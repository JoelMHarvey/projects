// respond-session — the PARTNER owner (never the requester) approves/declines
// a `pending_approval` session. Approve → re-checks the connection is still
// `active`, session goes `connecting` (+ notify both terminals); decline →
// `ended` with end_reason `partner_declined`.
// Thin Deno entrypoint (outside tsc/vitest); decisions live in ../_shared/.
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  bearerToken,
  errorResponse,
  jsonResponse,
  methodNotAllowed,
  preflightResponse,
} from '../_shared/http.ts';
import { sendPush } from '../_shared/push.ts';
import { broadcastMessages, terminalSessionStartMessages } from '../_shared/realtime.ts';
import { decideRespondSession } from '../_shared/sessionRules.ts';
import { validateRespondSession } from '../_shared/validation.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

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
  const parsed = validateRespondSession(body);
  if (!parsed.ok) return errorResponse(400, parsed.error);

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, connection_id, status, requested_by_pet_id')
    .eq('id', parsed.value.sessionId)
    .maybeSingle();
  if (sessionError) return errorResponse(500, 'session_lookup_failed');
  if (!session) return errorResponse(404, 'session_not_found');

  // Re-fetch the connection INCLUDING status: a pause/block after the request
  // was made must still veto approval (non-active connections make sessions
  // impossible by any means).
  const { data: connection } = await supabase
    .from('connections')
    .select('id, pet_a_id, pet_b_id, status')
    .eq('id', session.connection_id)
    .maybeSingle();
  if (!connection) return errorResponse(500, 'connection_lookup_failed');

  const { data: pets } = await supabase
    .from('pets')
    .select('id, owner_id')
    .in('id', [connection.pet_a_id, connection.pet_b_id]);
  const isConnectionOwner = (pets ?? []).some((p) => p.owner_id === callerId);
  if (!isConnectionOwner) return errorResponse(403, 'forbidden');

  // The approval gate exists because the REQUESTER's owner wants a session the
  // partner pet is not available for — so the responder must be the owner of
  // the pet that did NOT request it.
  const callerIsRequester = (pets ?? []).some(
    (p) => p.id === session.requested_by_pet_id && p.owner_id === callerId,
  );

  const now = new Date();
  const decision = decideRespondSession({
    sessionStatus: session.status,
    connectionStatus: connection.status,
    callerIsRequester,
    approve: parsed.value.approve,
    now,
  });

  if (decision.kind === 'reject') {
    const httpStatus = decision.reason === 'requester_cannot_respond' ? 403 : 409;
    return errorResponse(httpStatus, decision.reason);
  }

  if (decision.kind === 'start') {
    const { data: updated, error: updateError } = await supabase
      .from('sessions')
      .update({
        status: decision.sessionStatus,
        started_at: now.toISOString(),
        scheduled_end_at: decision.scheduledEndAt.toISOString(),
      })
      .eq('id', session.id)
      .eq('status', 'pending_approval') // guard against concurrent responses
      .select('id');
    if (updateError) return errorResponse(500, 'session_update_failed');
    if (!updated || updated.length === 0) return errorResponse(409, 'session_not_pending');

    // Notify both terminals: Realtime `terminal:{device_id}` broadcast (the
    // path paired terminals listen on) + APNs push for registered tokens.
    const { data: devices } = await supabase
      .from('devices')
      .select('id, pet_id, push_token')
      .in('pet_id', [connection.pet_a_id, connection.pet_b_id]);
    const deviceRows = (devices ?? []) as Array<{
      id: string;
      pet_id: string;
      push_token: string | null;
    }>;

    await broadcastMessages({
      supabaseUrl: SUPABASE_URL,
      serviceRoleKey: SERVICE_ROLE_KEY,
      messages: terminalSessionStartMessages(
        deviceRows.map((d) => ({ deviceId: d.id, petId: d.pet_id })),
        session.id,
        connection.pet_a_id,
        connection.pet_b_id,
      ),
      fetchImpl: fetch,
      onError: (detail) => console.error(`respond-session: session-start ${detail}`),
    });

    for (const device of deviceRows) {
      if (!device.push_token) continue;
      const partnerPetId =
        device.pet_id === connection.pet_a_id ? connection.pet_b_id : connection.pet_a_id;
      await sendPush(device.push_token, {
        title: 'LonelyBirds session starting',
        body: 'Session approved — connecting now',
        data: {
          kind: 'session_start',
          session_id: session.id,
          pet_id: device.pet_id,
          partner_pet_id: partnerPetId,
        },
      });
    }
    return jsonResponse(200, { session_id: session.id, status: decision.sessionStatus });
  }

  // decision.kind === 'decline'
  const { data: updated, error: updateError } = await supabase
    .from('sessions')
    .update({
      status: decision.sessionStatus,
      ended_at: now.toISOString(),
      end_reason: decision.endReason,
    })
    .eq('id', session.id)
    .eq('status', 'pending_approval')
    .select('id');
  if (updateError) return errorResponse(500, 'session_update_failed');
  if (!updated || updated.length === 0) return errorResponse(409, 'session_not_pending');

  return jsonResponse(200, { session_id: session.id, status: decision.sessionStatus });
});
