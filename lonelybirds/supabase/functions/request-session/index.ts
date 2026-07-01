// request-session — owner-auth. Validates connection active + partner pet
// within availability window (_shared/availability via _shared/sessionRules):
// in-window → session `connecting` + push both terminals; out-of-window →
// session `pending_approval` + push partner owner.
// Thin Deno entrypoint (outside tsc/vitest); decisions live in ../_shared/.
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
  decideRequestSession,
  LIVE_SESSION_STATUSES,
  type PetSchedule,
} from '../_shared/sessionRules.ts';
import { validateRequestSession } from '../_shared/validation.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

interface PetRow {
  id: string;
  owner_id: string;
  name: string;
  timezone: string;
}

async function loadSchedule(petId: string): Promise<PetSchedule | null> {
  const { data: pet } = await supabase
    .from('pets')
    .select('timezone')
    .eq('id', petId)
    .maybeSingle();
  if (!pet) return null;
  const { data: windows, error } = await supabase
    .from('availability_windows')
    .select('weekday, start_minute, end_minute')
    .eq('pet_id', petId);
  if (error) return null;
  return {
    timezone: pet.timezone,
    windows: (windows ?? []).map((w) => ({
      weekday: w.weekday,
      startMinute: w.start_minute,
      endMinute: w.end_minute,
    })),
  };
}

/**
 * Tell both pets' terminals a session is starting: (1) broadcast the
 * SessionStartPush payload on each terminal's `terminal:{device_id}` Realtime
 * channel — the delivery path paired terminals actually listen on today —
 * and (2) sendPush for any device with a registered APNs token.
 */
async function notifyTerminalsSessionStart(
  petAId: string,
  petBId: string,
  sessionId: string,
  pushBody: string,
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
    onError: (detail) => console.error(`request-session: session-start ${detail}`),
  });

  for (const device of rows) {
    if (!device.push_token) continue;
    const partnerPetId = device.pet_id === petAId ? petBId : petAId;
    await sendPush(device.push_token, {
      title: 'LonelyBirds session starting',
      body: pushBody,
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

  const token = bearerToken(req.headers.get('Authorization'));
  if (!token) return errorResponse(401, 'unauthorized');
  const { data: auth, error: authError } = await supabase.auth.getUser(token);
  if (authError || !auth.user) return errorResponse(401, 'unauthorized');
  const callerId = auth.user.id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, 'invalid_json');
  }
  const parsed = validateRequestSession(body);
  if (!parsed.ok) return errorResponse(400, parsed.error);

  const { data: connection, error: connError } = await supabase
    .from('connections')
    .select('id, pet_a_id, pet_b_id, status')
    .eq('id', parsed.value.connectionId)
    .maybeSingle();
  if (connError) return errorResponse(500, 'connection_lookup_failed');
  if (!connection) return errorResponse(404, 'connection_not_found');

  const { data: pets, error: petsError } = await supabase
    .from('pets')
    .select('id, owner_id, name, timezone')
    .in('id', [connection.pet_a_id, connection.pet_b_id]);
  if (petsError || !pets || pets.length !== 2) return errorResponse(500, 'pets_lookup_failed');

  const requesterPet = (pets as PetRow[]).find((p) => p.owner_id === callerId);
  if (!requesterPet) return errorResponse(403, 'forbidden');
  const partnerPet = (pets as PetRow[]).find((p) => p.id !== requesterPet.id) as PetRow;

  // One live session per connection.
  const { data: liveSessions } = await supabase
    .from('sessions')
    .select('id')
    .eq('connection_id', connection.id)
    .in('status', [...LIVE_SESSION_STATUSES])
    .limit(1);
  if (liveSessions && liveSessions.length > 0) {
    return errorResponse(409, 'session_already_live');
  }

  const requesterSchedule = await loadSchedule(requesterPet.id);
  const partnerSchedule = await loadSchedule(partnerPet.id);
  if (!requesterSchedule || !partnerSchedule) {
    return errorResponse(500, 'schedule_lookup_failed');
  }

  const now = new Date();
  const decision = decideRequestSession({
    connectionStatus: connection.status,
    requester: requesterSchedule,
    partner: partnerSchedule,
    now,
  });

  if (decision.kind === 'reject') {
    return errorResponse(409, decision.reason);
  }

  if (decision.kind === 'start') {
    const { data: session, error: insertError } = await supabase
      .from('sessions')
      .insert({
        connection_id: connection.id,
        initiated_by: decision.initiatedBy,
        requested_by_pet_id: requesterPet.id,
        status: decision.sessionStatus,
        started_at: now.toISOString(),
        scheduled_end_at: decision.scheduledEndAt.toISOString(),
      })
      .select('id, status')
      .single();
    if (insertError || !session) return errorResponse(500, 'session_create_failed');

    await notifyTerminalsSessionStart(
      requesterPet.id,
      partnerPet.id,
      session.id,
      `${requesterPet.name} is calling ${partnerPet.name}`,
    );
    return jsonResponse(200, { session_id: session.id, status: session.status });
  }

  // decision.kind === 'await_approval' — requested_by_pet_id lets
  // respond-session reject the requester approving their own request.
  const { data: session, error: insertError } = await supabase
    .from('sessions')
    .insert({
      connection_id: connection.id,
      initiated_by: decision.initiatedBy,
      requested_by_pet_id: requesterPet.id,
      status: decision.sessionStatus,
    })
    .select('id, status')
    .single();
  if (insertError || !session) return errorResponse(500, 'session_create_failed');

  // Owner phones don't register APNs tokens in the v1 schema; the logging
  // push sender routes via the owner:{id} placeholder (see _shared/push.ts).
  await sendPush(ownerPushToken(partnerPet.owner_id), {
    title: 'LonelyBirds session request',
    body: `${requesterPet.name} wants a session with ${partnerPet.name} — approve?`,
    data: { kind: 'session_approval_request', session_id: session.id },
  });
  return jsonResponse(200, { session_id: session.id, status: session.status });
});
