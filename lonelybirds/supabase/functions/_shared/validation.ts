/**
 * Request-body validation helpers for the edge functions.
 *
 * Each edge function parses JSON in its (untested, Deno) entrypoint and hands
 * the unknown value to one of these pure validators, which return a typed,
 * normalised value or a machine-readable error string for a 400 response.
 */

import { isValidPairingCode } from './pairing.ts';

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function ok<T>(value: T): ValidationResult<T> {
  return { ok: true, value };
}

function fail<T>(error: string): ValidationResult<T> {
  return { ok: false, error };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for canonical hyphenated UUID strings (any version). */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * End reasons a CLIENT may supply to `end-session`. `window_boundary`,
 * `max_duration` and `partner_declined` are set only by the server
 * (schedule-tick / respond-session).
 */
export const CLIENT_END_REASONS = ['owner_ended', 'failed'] as const;
export type ClientEndReason = (typeof CLIENT_END_REASONS)[number];

const MAX_DEVICE_NAME_LENGTH = 80;

// ---------------------------------------------------------------------------
// Per-function input validators (input shapes from the CONTRACTS.md table)
// ---------------------------------------------------------------------------

export interface CreatePairingCodeInput {
  petId: string;
}

/** `create-pairing-code` — `{pet_id}` */
export function validateCreatePairingCode(
  body: unknown,
): ValidationResult<CreatePairingCodeInput> {
  if (!isRecord(body)) return fail('body_must_be_object');
  if (!isUuid(body['pet_id'])) return fail('pet_id_must_be_uuid');
  return ok({ petId: body['pet_id'] });
}

export interface PairDeviceInput {
  code: string;
  deviceName: string;
}

/** `pair-device` — `{code, device_name}` */
export function validatePairDevice(body: unknown): ValidationResult<PairDeviceInput> {
  if (!isRecord(body)) return fail('body_must_be_object');
  const code = body['code'];
  if (typeof code !== 'string' || !isValidPairingCode(code)) {
    return fail('code_must_be_6_digits');
  }
  const deviceName = body['device_name'];
  if (typeof deviceName !== 'string' || deviceName.trim() === '') {
    return fail('device_name_required');
  }
  if (deviceName.trim().length > MAX_DEVICE_NAME_LENGTH) {
    return fail('device_name_too_long');
  }
  return ok({ code, deviceName: deviceName.trim() });
}

export interface RequestSessionInput {
  connectionId: string;
}

/** `request-session` — `{connection_id}` */
export function validateRequestSession(
  body: unknown,
): ValidationResult<RequestSessionInput> {
  if (!isRecord(body)) return fail('body_must_be_object');
  if (!isUuid(body['connection_id'])) return fail('connection_id_must_be_uuid');
  return ok({ connectionId: body['connection_id'] });
}

export interface RespondSessionInput {
  sessionId: string;
  approve: boolean;
}

/** `respond-session` — `{session_id, approve}` */
export function validateRespondSession(
  body: unknown,
): ValidationResult<RespondSessionInput> {
  if (!isRecord(body)) return fail('body_must_be_object');
  if (!isUuid(body['session_id'])) return fail('session_id_must_be_uuid');
  if (typeof body['approve'] !== 'boolean') return fail('approve_must_be_boolean');
  return ok({ sessionId: body['session_id'], approve: body['approve'] });
}

export interface EndSessionInput {
  sessionId: string;
  reason: ClientEndReason;
  /** Present when a terminal (no user JWT) is ending the session. */
  deviceId?: string;
}

/** `end-session` — `{session_id, reason, device_id?}` */
export function validateEndSession(body: unknown): ValidationResult<EndSessionInput> {
  if (!isRecord(body)) return fail('body_must_be_object');
  if (!isUuid(body['session_id'])) return fail('session_id_must_be_uuid');
  const reason = body['reason'];
  if (
    typeof reason !== 'string' ||
    !(CLIENT_END_REASONS as readonly string[]).includes(reason)
  ) {
    return fail('reason_must_be_owner_ended_or_failed');
  }
  const result: EndSessionInput = {
    sessionId: body['session_id'],
    reason: reason as ClientEndReason,
  };
  if (body['device_id'] !== undefined) {
    if (!isUuid(body['device_id'])) return fail('device_id_must_be_uuid');
    result.deviceId = body['device_id'];
  }
  return ok(result);
}

const MAX_PUSH_TOKEN_LENGTH = 512;

export interface DeviceHeartbeatInput {
  deviceId: string;
  /**
   * Optional APNs token registration: terminals piggyback their push token on
   * the heartbeat once the native build can obtain one (`devices.push_token`
   * has no other writer — this is the registration path).
   */
  pushToken?: string;
}

/** `device-heartbeat` — `{device_id, push_token?}` */
export function validateDeviceHeartbeat(
  body: unknown,
): ValidationResult<DeviceHeartbeatInput> {
  if (!isRecord(body)) return fail('body_must_be_object');
  if (!isUuid(body['device_id'])) return fail('device_id_must_be_uuid');
  const result: DeviceHeartbeatInput = { deviceId: body['device_id'] };
  if (body['push_token'] !== undefined) {
    const pushToken = body['push_token'];
    if (
      typeof pushToken !== 'string' ||
      pushToken.trim() === '' ||
      pushToken.length > MAX_PUSH_TOKEN_LENGTH
    ) {
      return fail('push_token_invalid');
    }
    result.pushToken = pushToken;
  }
  return ok(result);
}
