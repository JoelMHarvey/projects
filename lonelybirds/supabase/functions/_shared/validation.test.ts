import { describe, expect, it } from 'vitest';
import {
  isRecord,
  isUuid,
  validateCreatePairingCode,
  validateDeviceHeartbeat,
  validateEndSession,
  validatePairDevice,
  validateRequestSession,
  validateRespondSession,
} from './validation.ts';

const UUID = '123e4567-e89b-42d3-a456-426614174000';

function expectFail(result: { ok: boolean }, error: string): void {
  expect(result).toEqual({ ok: false, error });
}

describe('isUuid', () => {
  it('accepts canonical uuids, case-insensitively', () => {
    expect(isUuid(UUID)).toBe(true);
    expect(isUuid(UUID.toUpperCase())).toBe(true);
  });

  it('rejects non-uuids and non-strings', () => {
    for (const bad of ['', 'not-a-uuid', UUID.slice(1), `${UUID} `, 42, null, undefined, {}]) {
      expect(isUuid(bad)).toBe(false);
    }
  });
});

describe('isRecord', () => {
  it('accepts plain objects only', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(isRecord('x')).toBe(false);
  });
});

describe('validateCreatePairingCode', () => {
  it('accepts {pet_id}', () => {
    expect(validateCreatePairingCode({ pet_id: UUID })).toEqual({
      ok: true,
      value: { petId: UUID },
    });
  });

  it('rejects missing/malformed pet_id and non-object bodies', () => {
    expectFail(validateCreatePairingCode(null), 'body_must_be_object');
    expectFail(validateCreatePairingCode({}), 'pet_id_must_be_uuid');
    expectFail(validateCreatePairingCode({ pet_id: '123' }), 'pet_id_must_be_uuid');
  });
});

describe('validatePairDevice', () => {
  it('accepts a 6-digit code and trims the device name', () => {
    expect(validatePairDevice({ code: '012345', device_name: '  Old iPad  ' })).toEqual({
      ok: true,
      value: { code: '012345', deviceName: 'Old iPad' },
    });
  });

  it('rejects bad codes (numbers, wrong length, non-digits)', () => {
    expectFail(validatePairDevice({ code: 12345, device_name: 'x' }), 'code_must_be_6_digits');
    expectFail(validatePairDevice({ code: '12345', device_name: 'x' }), 'code_must_be_6_digits');
    expectFail(validatePairDevice({ code: '12a456', device_name: 'x' }), 'code_must_be_6_digits');
  });

  it('rejects empty or oversized device names', () => {
    expectFail(validatePairDevice({ code: '123456', device_name: '  ' }), 'device_name_required');
    expectFail(validatePairDevice({ code: '123456' }), 'device_name_required');
    expectFail(
      validatePairDevice({ code: '123456', device_name: 'x'.repeat(81) }),
      'device_name_too_long',
    );
  });
});

describe('validateRequestSession', () => {
  it('accepts {connection_id}', () => {
    expect(validateRequestSession({ connection_id: UUID })).toEqual({
      ok: true,
      value: { connectionId: UUID },
    });
  });

  it('rejects malformed ids', () => {
    expectFail(validateRequestSession({ connection_id: 'x' }), 'connection_id_must_be_uuid');
  });
});

describe('validateRespondSession', () => {
  it('accepts {session_id, approve}', () => {
    expect(validateRespondSession({ session_id: UUID, approve: false })).toEqual({
      ok: true,
      value: { sessionId: UUID, approve: false },
    });
  });

  it('requires a real boolean for approve', () => {
    expectFail(validateRespondSession({ session_id: UUID }), 'approve_must_be_boolean');
    expectFail(
      validateRespondSession({ session_id: UUID, approve: 'true' }),
      'approve_must_be_boolean',
    );
  });
});

describe('validateEndSession', () => {
  it('accepts owner_ended and failed reasons', () => {
    expect(validateEndSession({ session_id: UUID, reason: 'owner_ended' })).toEqual({
      ok: true,
      value: { sessionId: UUID, reason: 'owner_ended' },
    });
    expect(validateEndSession({ session_id: UUID, reason: 'failed' })).toEqual({
      ok: true,
      value: { sessionId: UUID, reason: 'failed' },
    });
  });

  it('accepts an optional device_id (terminal caller)', () => {
    expect(
      validateEndSession({ session_id: UUID, reason: 'failed', device_id: UUID }),
    ).toEqual({ ok: true, value: { sessionId: UUID, reason: 'failed', deviceId: UUID } });
    expectFail(
      validateEndSession({ session_id: UUID, reason: 'failed', device_id: 'nope' }),
      'device_id_must_be_uuid',
    );
  });

  it('rejects server-only and unknown end reasons', () => {
    for (const reason of ['window_boundary', 'max_duration', 'partner_declined', 'other', 7]) {
      expectFail(
        validateEndSession({ session_id: UUID, reason }),
        'reason_must_be_owner_ended_or_failed',
      );
    }
  });
});

describe('validateDeviceHeartbeat', () => {
  it('accepts {device_id}', () => {
    expect(validateDeviceHeartbeat({ device_id: UUID })).toEqual({
      ok: true,
      value: { deviceId: UUID },
    });
  });

  it('rejects malformed ids', () => {
    expectFail(validateDeviceHeartbeat({ device_id: 123 }), 'device_id_must_be_uuid');
  });

  it('accepts an optional push_token registration', () => {
    expect(validateDeviceHeartbeat({ device_id: UUID, push_token: 'apns-abc' })).toEqual({
      ok: true,
      value: { deviceId: UUID, pushToken: 'apns-abc' },
    });
  });

  it('rejects blank, non-string or oversized push tokens', () => {
    for (const pushToken of ['', '   ', 42, 'x'.repeat(513)]) {
      expectFail(
        validateDeviceHeartbeat({ device_id: UUID, push_token: pushToken }),
        'push_token_invalid',
      );
    }
  });
});
