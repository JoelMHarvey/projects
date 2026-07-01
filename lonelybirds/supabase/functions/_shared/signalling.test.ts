/** Sanity tests for the _shared mirror of app/src/core/signalling.ts. */
import { describe, expect, it } from 'vitest';
import {
  SIGNAL_PROTOCOL_VERSION,
  isSignalMessage,
  makeSignalMessage,
  observerSender,
  sessionChannelName,
  whoAmI,
} from './signalling.ts';

describe('signalling mirror', () => {
  it('names the session channel per contract', () => {
    expect(sessionChannelName('abc-123')).toBe('session:abc-123');
  });

  it('assigns terminal_a to the lexically smaller pet id', () => {
    expect(whoAmI('aaa', 'bbb')).toBe('terminal_a');
    expect(whoAmI('bbb', 'aaa')).toBe('terminal_b');
    expect(() => whoAmI('same', 'same')).toThrow();
  });

  it('builds v1 envelopes that pass validation', () => {
    const bye = makeSignalMessage('bye', observerSender('owner-1'), { reason: 'owner_ended' });
    expect(bye).toEqual({
      v: SIGNAL_PROTOCOL_VERSION,
      type: 'bye',
      from: 'observer:owner-1',
      payload: { reason: 'owner_ended' },
    });
    expect(isSignalMessage(bye)).toBe(true);
  });

  it('rejects malformed envelopes', () => {
    expect(isSignalMessage(null)).toBe(false);
    expect(isSignalMessage({ v: 2, type: 'bye', from: 'terminal_a' })).toBe(false);
    expect(isSignalMessage({ v: 1, type: 'nope', from: 'terminal_a' })).toBe(false);
    expect(isSignalMessage({ v: 1, type: 'bye', from: 'observer:' })).toBe(false);
  });
});
