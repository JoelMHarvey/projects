// device-heartbeat — terminal keep-alive: updates `last_seen_at` and
// `is_online`, and registers an APNs `push_token` when the terminal sends one
// (the only writer of devices.push_token). No user auth (terminals hold no
// JWT in the MVP); the device_id is an unguessable uuid issued by pair-device.
// schedule-tick flips `is_online` back off when heartbeats stop for >90s.
// Thin Deno entrypoint (outside tsc/vitest); validation lives in ../_shared/.
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  errorResponse,
  jsonResponse,
  methodNotAllowed,
  preflightResponse,
} from '../_shared/http.ts';
import { validateDeviceHeartbeat } from '../_shared/validation.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } },
);

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return preflightResponse();
  if (req.method !== 'POST') return methodNotAllowed();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, 'invalid_json');
  }
  const parsed = validateDeviceHeartbeat(body);
  if (!parsed.ok) return errorResponse(400, parsed.error);

  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = { last_seen_at: nowIso, is_online: true };
  if (parsed.value.pushToken !== undefined) patch['push_token'] = parsed.value.pushToken;
  const { data: updated, error } = await supabase
    .from('devices')
    .update(patch)
    .eq('id', parsed.value.deviceId)
    .select('id');
  if (error) return errorResponse(500, 'heartbeat_failed');
  if (!updated || updated.length === 0) return errorResponse(404, 'device_not_found');

  return jsonResponse(200, { ok: true, last_seen_at: nowIso });
});
