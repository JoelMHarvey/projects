// end-session — either owner (JWT) or a terminal (device_id in the body) ends
// a live session: sets `ended` + `end_reason` and broadcasts `bye` on the
// `session:{session_id}` Realtime channel.
// Thin Deno entrypoint (outside tsc/vitest); logic lives in ../_shared/.
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  bearerToken,
  errorResponse,
  jsonResponse,
  methodNotAllowed,
  preflightResponse,
} from '../_shared/http.ts';
import { broadcastMessages } from '../_shared/realtime.ts';
import {
  makeSignalMessage,
  observerSender,
  sessionChannelName,
  SIGNAL_EVENT,
  whoAmI,
  type SignalSender,
} from '../_shared/signalling.ts';
import { isLiveSessionStatus } from '../_shared/sessionRules.ts';
import { validateEndSession } from '../_shared/validation.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/**
 * Broadcast a `bye` envelope over Realtime's HTTP broadcast endpoint. The
 * event MUST be SIGNAL_EVENT ('signal') — the app's SupabaseSignallingChannel
 * filters broadcasts by that event name, so anything else is dropped and the
 * terminals would keep streaming.
 */
async function broadcastBye(sessionId: string, from: SignalSender, reason: string): Promise<void> {
  await broadcastMessages({
    supabaseUrl: SUPABASE_URL,
    serviceRoleKey: SERVICE_ROLE_KEY,
    messages: [
      {
        topic: sessionChannelName(sessionId),
        event: SIGNAL_EVENT,
        payload: makeSignalMessage('bye', from, { reason }),
      },
    ],
    fetchImpl: fetch,
    onError: (detail) => console.error(`end-session: bye ${detail}`),
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return preflightResponse();
  if (req.method !== 'POST') return methodNotAllowed();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, 'invalid_json');
  }
  const parsed = validateEndSession(body);
  if (!parsed.ok) return errorResponse(400, parsed.error);
  const { sessionId, reason, deviceId } = parsed.value;

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, connection_id, status')
    .eq('id', sessionId)
    .maybeSingle();
  if (sessionError) return errorResponse(500, 'session_lookup_failed');
  if (!session) return errorResponse(404, 'session_not_found');

  const { data: connection } = await supabase
    .from('connections')
    .select('id, pet_a_id, pet_b_id')
    .eq('id', session.connection_id)
    .maybeSingle();
  if (!connection) return errorResponse(500, 'connection_lookup_failed');

  // Authorise: an owner of either pet (JWT), or one of the two terminals.
  let from: SignalSender | null = null;
  const token = bearerToken(req.headers.get('Authorization'));
  if (token) {
    const { data: auth } = await supabase.auth.getUser(token);
    if (auth?.user) {
      const { data: pets } = await supabase
        .from('pets')
        .select('id, owner_id')
        .in('id', [connection.pet_a_id, connection.pet_b_id]);
      if ((pets ?? []).some((p) => p.owner_id === auth.user.id)) {
        from = observerSender(auth.user.id);
      }
    }
  }
  if (!from && deviceId) {
    const { data: device } = await supabase
      .from('devices')
      .select('id, pet_id')
      .eq('id', deviceId)
      .maybeSingle();
    if (
      device &&
      (device.pet_id === connection.pet_a_id || device.pet_id === connection.pet_b_id)
    ) {
      const partnerPetId =
        device.pet_id === connection.pet_a_id ? connection.pet_b_id : connection.pet_a_id;
      from = whoAmI(device.pet_id, partnerPetId);
    }
  }
  if (!from) return errorResponse(403, 'forbidden');

  if (!isLiveSessionStatus(session.status)) {
    return errorResponse(409, 'session_not_live');
  }

  const { data: updated, error: updateError } = await supabase
    .from('sessions')
    .update({
      status: 'ended',
      ended_at: new Date().toISOString(),
      end_reason: reason,
    })
    .eq('id', session.id)
    .in('status', ['pending_approval', 'connecting', 'active']) // guard: still live
    .select('id');
  if (updateError) return errorResponse(500, 'session_update_failed');
  if (!updated || updated.length === 0) return errorResponse(409, 'session_not_live');

  await broadcastBye(session.id, from, reason);

  return jsonResponse(200, { session_id: session.id, status: 'ended', end_reason: reason });
});
