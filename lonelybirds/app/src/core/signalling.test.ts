import { describe, expect, it } from 'vitest';
import {
  isSignalMessage,
  makeSignalMessage,
  observerSender,
  sessionChannelName,
  SIGNAL_PROTOCOL_VERSION,
  whoAmI,
  type SignalMessage,
} from './signalling';

describe('whoAmI', () => {
  it('assigns terminal_a to the lexically smaller pet id', () => {
    expect(whoAmI('aaa', 'bbb')).toBe('terminal_a');
    expect(whoAmI('bbb', 'aaa')).toBe('terminal_b');
  });

  it('is consistent from both sides of the pair', () => {
    const petA = '0f5c9a2e-1111-4a7b-9c3d-000000000001';
    const petB = '9f5c9a2e-2222-4a7b-9c3d-000000000002';
    expect(whoAmI(petA, petB)).toBe('terminal_a');
    expect(whoAmI(petB, petA)).toBe('terminal_b');
    expect(whoAmI(petA, petB)).not.toBe(whoAmI(petB, petA));
  });

  it('uses plain lexical comparison on uuid strings', () => {
    // '1' < 'a' in ASCII — matches Postgres pet_a_id < pet_b_id text ordering
    // for lowercase hex uuids.
    expect(whoAmI('1abc', 'aabc')).toBe('terminal_a');
  });

  it('throws when both pet ids are identical', () => {
    expect(() => whoAmI('same-id', 'same-id')).toThrow();
  });
});

describe('sessionChannelName / observerSender', () => {
  it('builds the contract channel name session:{session_id}', () => {
    expect(sessionChannelName('abc-123')).toBe('session:abc-123');
  });

  it('builds observer sender ids as observer:{owner_id}', () => {
    expect(observerSender('owner-9')).toBe('observer:owner-9');
  });
});

describe('makeSignalMessage', () => {
  it('stamps v=1 and carries type/from/payload', () => {
    const msg = makeSignalMessage('offer', 'terminal_a', { sdp: 'v=0...' });
    expect(msg).toEqual({
      v: 1,
      type: 'offer',
      from: 'terminal_a',
      payload: { sdp: 'v=0...' },
    });
    expect(msg.v).toBe(SIGNAL_PROTOCOL_VERSION);
  });

  it('defaults payload to null', () => {
    expect(makeSignalMessage('bye', 'terminal_b').payload).toBeNull();
  });
});

describe('isSignalMessage', () => {
  it('accepts every valid type from both terminals and observers', () => {
    const senders = ['terminal_a', 'terminal_b', observerSender('owner-1')] as const;
    const types = ['hello', 'offer', 'answer', 'ice', 'bye'] as const;
    for (const from of senders) {
      for (const type of types) {
        expect(isSignalMessage(makeSignalMessage(type, from))).toBe(true);
      }
    }
  });

  it('round-trips through JSON (wire format)', () => {
    const msg = makeSignalMessage('ice', 'terminal_b', { candidate: 'c', sdpMid: '0' });
    const parsed: unknown = JSON.parse(JSON.stringify(msg));
    expect(isSignalMessage(parsed)).toBe(true);
    expect((parsed as SignalMessage).type).toBe('ice');
  });

  it('rejects wrong version numbers', () => {
    expect(isSignalMessage({ v: 2, type: 'hello', from: 'terminal_a', payload: null })).toBe(
      false,
    );
    expect(isSignalMessage({ v: '1', type: 'hello', from: 'terminal_a', payload: null })).toBe(
      false,
    );
  });

  it('rejects unknown types and malformed senders', () => {
    expect(isSignalMessage({ v: 1, type: 'ping', from: 'terminal_a', payload: null })).toBe(false);
    expect(isSignalMessage({ v: 1, type: 'offer', from: 'terminal_c', payload: null })).toBe(
      false,
    );
    expect(isSignalMessage({ v: 1, type: 'offer', from: 'observer:', payload: null })).toBe(false);
    expect(isSignalMessage({ v: 1, type: 'offer', from: 42, payload: null })).toBe(false);
  });

  it('rejects non-objects and null', () => {
    expect(isSignalMessage(null)).toBe(false);
    expect(isSignalMessage(undefined)).toBe(false);
    expect(isSignalMessage('hello')).toBe(false);
    expect(isSignalMessage(42)).toBe(false);
    expect(isSignalMessage([])).toBe(false);
  });

  it('accepts a missing payload field (payload may be undefined off the wire)', () => {
    expect(isSignalMessage({ v: 1, type: 'hello', from: 'terminal_a' })).toBe(true);
  });
});
