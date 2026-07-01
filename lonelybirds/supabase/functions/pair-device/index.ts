// pair-device — NO user auth (anon): claims a pairing code, creates a
// `devices` row, returns {device_id, pet_id}. The optional device_jwt from the
// contract is not issued in the MVP (terminals call device-scoped functions
// with their device_id).
// Thin Deno entrypoint (outside tsc/vitest); logic lives in ../_shared/.
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  errorResponse,
  jsonResponse,
  methodNotAllowed,
  preflightResponse,
} from '../_shared/http.ts';
import { validatePairDevice } from '../_shared/validation.ts';

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
  const parsed = validatePairDevice(body);
  if (!parsed.ok) return errorResponse(400, parsed.error);
  const { code, deviceName } = parsed.value;

  const nowIso = new Date().toISOString();

  // At most one UNCLAIMED row per code value (partial unique index), so this
  // lookup is unambiguous.
  const { data: codeRow, error: codeError } = await supabase
    .from('pairing_codes')
    .select('id, pet_id')
    .eq('code', code)
    .is('claimed_by_device', null)
    .gt('expires_at', nowIso)
    .maybeSingle();
  if (codeError) return errorResponse(500, 'code_lookup_failed');
  if (!codeRow) return errorResponse(404, 'invalid_or_expired_code');

  const { data: device, error: deviceError } = await supabase
    .from('devices')
    .insert({
      pet_id: codeRow.pet_id,
      role: 'terminal',
      last_seen_at: nowIso,
      is_online: true,
    })
    .select('id, pet_id')
    .single();
  if (deviceError || !device) {
    console.error('pair-device device insert failed', deviceError);
    return errorResponse(500, 'device_create_failed');
  }

  // Claim atomically: only wins if the code is still unclaimed.
  const { data: claimed, error: claimError } = await supabase
    .from('pairing_codes')
    .update({ claimed_by_device: device.id })
    .eq('id', codeRow.id)
    .is('claimed_by_device', null)
    .select('id');
  if (claimError || !claimed || claimed.length === 0) {
    // Lost the race (or claim failed) — roll back the device row.
    await supabase.from('devices').delete().eq('id', device.id);
    if (claimError) {
      console.error('pair-device claim failed', claimError);
      return errorResponse(500, 'claim_failed');
    }
    return errorResponse(409, 'code_already_claimed');
  }

  // devices has no name column in the v1 schema; log the friendly name so
  // support can correlate pairing events.
  console.log(`pair-device: paired "${deviceName}" as device ${device.id} for pet ${device.pet_id}`);

  return jsonResponse(200, { device_id: device.id, pet_id: device.pet_id });
});
