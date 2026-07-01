// schedule-tick — cron (service role). Per CONTRACTS.md:
//   1. starts scheduled sessions when both pets' windows overlap 'now'
//   2. ends live sessions past `scheduled_end_at`
//   3. marks devices offline (last_seen_at > 90s) and pushes the owner
// Thin Deno entrypoint (outside tsc/vitest); ALL decisions live in
// ../_shared/sessionRules.ts (planScheduledStarts / planSessionEnds /
// planOfflineDevices), which is vitest-covered.
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  bearerToken,
  errorResponse,
  jsonResponse,
  methodNotAllowed,
  preflightResponse,
} from '../_shared/http.ts';
import { ownerPushToken, sendPush } from '../_shared/push.ts';
import { broadcastMessages, terminalSessionStartMessages } from '../_shared/realtime.ts';
import {
  LIVE_SESSION_STATUSES,
  planOfflineDevices,
  planScheduledStarts,
  planSessionEnds,
  type PetSchedule,
  type TickConnection,
  type TickDevice,
  type TickSession,
} from '../_shared/sessionRules.ts';
import {
  makeSignalMessage,
  observerSender,
  sessionChannelName,
  SIGNAL_EVENT,
} from '../_shared/signalling.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

interface PetRow {
  id: string;
  owner_id: string;
  timezone: string;
}

/**
 * Auto-end teardown. Event MUST be SIGNAL_EVENT ('signal') — the app's
 * SupabaseSignallingChannel filters broadcasts by that event name; with any
 * other name the terminals never see the bye and stream past the boundary.
 */
async function broadcastBye(sessionId: string, reason: string): Promise<void> {
  await broadcastMessages({
    supabaseUrl: SUPABASE_URL,
    serviceRoleKey: SERVICE_ROLE_KEY,
    messages: [
      {
        topic: sessionChannelName(sessionId),
        event: SIGNAL_EVENT,
        payload: makeSignalMessage('bye', observerSender('schedule-tick'), { reason }),
      },
    ],
    fetchImpl: fetch,
    onError: (detail) => console.error(`schedule-tick: bye ${detail}`),
  });
}

/**
 * Scheduled session is starting: broadcast the SessionStartPush payload on
 * each terminal's `terminal:{device_id}` Realtime channel (the delivery path
 * paired terminals listen on) + APNs push for any registered token.
 */
async function notifyTerminalsSessionStart(
  petAId: string,
  petBId: string,
  sessionId: string,
): Promise<void> {
  const { data: devices } = await supabase
    .from('devices')
    .select('id, pet_id, push_token')
    .in('pet_id', [petAId, petBId]);
  const rows = (devices ?? []) as Array<{
    id: string;
    pet_id: string;
    push_token: string | null;
  }>;

  await broadcastMessages({
    supabaseUrl: SUPABASE_URL,
    serviceRoleKey: SERVICE_ROLE_KEY,
    messages: terminalSessionStartMessages(
      rows.map((d) => ({ deviceId: d.id, petId: d.pet_id })),
      sessionId,
      petAId,
      petBId,
    ),
    fetchImpl: fetch,
    onError: (detail) => console.error(`schedule-tick: session-start ${detail}`),
  });

  for (const device of rows) {
    if (!device.push_token) continue;
    const partnerPetId = device.pet_id === petAId ? petBId : petAId;
    await sendPush(device.push_token, {
      title: 'LonelyBirds session starting',
      body: 'Scheduled session is starting',
      data: {
        kind: 'session_start',
        session_id: sessionId,
        pet_id: device.pet_id,
        partner_pet_id: partnerPetId,
      },
    });
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return preflightResponse();
  if (req.method !== 'POST') return methodNotAllowed();

  // Cron-only: the caller must present the service role key.
  const token = bearerToken(req.headers.get('Authorization'));
  if (!token || token !== SERVICE_ROLE_KEY) return errorResponse(401, 'unauthorized');

  const now = new Date();
  const nowIso = now.toISOString();

  // ------------------------------------------------------------------
  // 1) Start scheduled sessions where both pets' windows overlap now.
  // ------------------------------------------------------------------
  const { data: activeConnections } = await supabase
    .from('connections')
    .select('id, pet_a_id, pet_b_id')
    .eq('status', 'active');
  const connections = activeConnections ?? [];

  let started = 0;
  if (connections.length > 0) {
    const petIds = [...new Set(connections.flatMap((c) => [c.pet_a_id, c.pet_b_id]))];

    const { data: petRows } = await supabase
      .from('pets')
      .select('id, owner_id, timezone')
      .in('id', petIds);
    const { data: windowRows } = await supabase
      .from('availability_windows')
      .select('pet_id, weekday, start_minute, end_minute')
      .in('pet_id', petIds);
    const { data: liveRows } = await supabase
      .from('sessions')
      .select('connection_id')
      .in('status', [...LIVE_SESSION_STATUSES])
      .in('connection_id', connections.map((c) => c.id));

    const schedules = new Map<string, PetSchedule>();
    for (const pet of (petRows ?? []) as PetRow[]) {
      schedules.set(pet.id, { timezone: pet.timezone, windows: [] });
    }
    for (const w of windowRows ?? []) {
      schedules.get(w.pet_id)?.windows.push({
        weekday: w.weekday,
        startMinute: w.start_minute,
        endMinute: w.end_minute,
      });
    }
    const liveConnectionIds = new Set((liveRows ?? []).map((r) => r.connection_id));

    const tickConnections: TickConnection[] = [];
    for (const c of connections) {
      const petA = schedules.get(c.pet_a_id);
      const petB = schedules.get(c.pet_b_id);
      if (!petA || !petB) continue;
      tickConnections.push({
        connectionId: c.id,
        petA,
        petB,
        hasLiveSession: liveConnectionIds.has(c.id),
      });
    }

    for (const plan of planScheduledStarts(tickConnections, now)) {
      const { data: session, error } = await supabase
        .from('sessions')
        .insert({
          connection_id: plan.connectionId,
          initiated_by: plan.initiatedBy,
          status: plan.sessionStatus,
          started_at: nowIso,
          scheduled_end_at: plan.scheduledEndAt.toISOString(),
        })
        .select('id')
        .single();
      if (error || !session) {
        console.error('schedule-tick: session insert failed', error);
        continue;
      }
      started++;
      const conn = connections.find((c) => c.id === plan.connectionId);
      if (conn) await notifyTerminalsSessionStart(conn.pet_a_id, conn.pet_b_id, session.id);
    }
  }

  // ------------------------------------------------------------------
  // 2) End live sessions past scheduled_end_at.
  // ------------------------------------------------------------------
  const { data: dueRows } = await supabase
    .from('sessions')
    .select('id, status, started_at, scheduled_end_at')
    .in('status', ['connecting', 'active'])
    .lte('scheduled_end_at', nowIso);

  const dueSessions: TickSession[] = (dueRows ?? []).map((s) => ({
    sessionId: s.id,
    status: s.status,
    startedAt: s.started_at ? new Date(s.started_at) : null,
    scheduledEndAt: s.scheduled_end_at ? new Date(s.scheduled_end_at) : null,
  }));

  let ended = 0;
  for (const plan of planSessionEnds(dueSessions, now)) {
    const { error } = await supabase
      .from('sessions')
      .update({
        status: plan.sessionStatus,
        ended_at: nowIso,
        end_reason: plan.endReason,
      })
      .eq('id', plan.sessionId)
      .in('status', ['connecting', 'active']);
    if (error) {
      console.error('schedule-tick: session end failed', error);
      continue;
    }
    ended++;
    await broadcastBye(plan.sessionId, plan.endReason);
  }

  // ------------------------------------------------------------------
  // 3) Mark stale devices offline (last_seen_at > 90s) + push the owner.
  // ------------------------------------------------------------------
  const { data: onlineRows } = await supabase
    .from('devices')
    .select('id, pet_id, is_online, last_seen_at')
    .eq('is_online', true);

  const onlineDevices: TickDevice[] = (onlineRows ?? []).map((d) => ({
    deviceId: d.id,
    isOnline: d.is_online,
    lastSeenAt: d.last_seen_at ? new Date(d.last_seen_at) : null,
  }));

  let markedOffline = 0;
  for (const deviceId of planOfflineDevices(onlineDevices, now)) {
    const { error } = await supabase
      .from('devices')
      .update({ is_online: false })
      .eq('id', deviceId);
    if (error) {
      console.error('schedule-tick: mark offline failed', error);
      continue;
    }
    markedOffline++;

    const row = (onlineRows ?? []).find((d) => d.id === deviceId);
    if (!row) continue;
    const { data: pet } = await supabase
      .from('pets')
      .select('owner_id, name')
      .eq('id', row.pet_id)
      .maybeSingle();
    if (pet) {
      // Owner phones don't register APNs tokens in the v1 schema; the logging
      // sender routes via the owner:{id} placeholder (see _shared/push.ts).
      await sendPush(ownerPushToken(pet.owner_id), {
        title: 'LonelyBirds terminal offline',
        body: `${pet.name}'s terminal has gone offline`,
        data: { kind: 'terminal_offline', device_id: deviceId },
      });
    }
  }

  return jsonResponse(200, { started, ended, marked_offline: markedOffline });
});
