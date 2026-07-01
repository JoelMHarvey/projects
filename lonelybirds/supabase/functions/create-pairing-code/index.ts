// create-pairing-code — owner-auth; issues a 6-digit code with 10-min expiry.
// Thin Deno entrypoint (outside tsc/vitest); decision logic lives in ../_shared/.
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  bearerToken,
  errorResponse,
  jsonResponse,
  methodNotAllowed,
  preflightResponse,
} from '../_shared/http.ts';
import { generatePairingCode } from '../_shared/pairing.ts';
import { PAIRING_CODE_TTL_MINUTES } from '../_shared/sessionRules.ts';
import { validateCreatePairingCode } from '../_shared/validation.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } },
);

const UNIQUE_VIOLATION = '23505';
const MAX_CODE_ATTEMPTS = 5;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return preflightResponse();
  if (req.method !== 'POST') return methodNotAllowed();

  const token = bearerToken(req.headers.get('Authorization'));
  if (!token) return errorResponse(401, 'unauthorized');
  const { data: auth, error: authError } = await supabase.auth.getUser(token);
  if (authError || !auth.user) return errorResponse(401, 'unauthorized');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, 'invalid_json');
  }
  const parsed = validateCreatePairingCode(body);
  if (!parsed.ok) return errorResponse(400, parsed.error);

  const { data: pet, error: petError } = await supabase
    .from('pets')
    .select('id, owner_id')
    .eq('id', parsed.value.petId)
    .maybeSingle();
  if (petError) return errorResponse(500, 'pet_lookup_failed');
  if (!pet) return errorResponse(404, 'pet_not_found');
  if (pet.owner_id !== auth.user.id) return errorResponse(403, 'forbidden');

  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + PAIRING_CODE_TTL_MINUTES * 60_000,
  ).toISOString();

  // Purge expired unclaimed codes so dead rows cannot trip the partial-unique
  // index (pairing_codes_unclaimed_code_key) on insert.
  await supabase
    .from('pairing_codes')
    .delete()
    .is('claimed_by_device', null)
    .lt('expires_at', now.toISOString());

  // Retry on the ~N/1e6 chance of colliding with another live unclaimed code.
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = generatePairingCode();
    const { data, error } = await supabase
      .from('pairing_codes')
      .insert({ code, pet_id: pet.id, expires_at: expiresAt })
      .select('code, expires_at')
      .single();
    if (!error && data) {
      return jsonResponse(200, { code: data.code, expires_at: data.expires_at });
    }
    if (error && error.code !== UNIQUE_VIOLATION) {
      console.error('create-pairing-code insert failed', error);
      return errorResponse(500, 'insert_failed');
    }
  }
  return errorResponse(500, 'code_collision');
});
