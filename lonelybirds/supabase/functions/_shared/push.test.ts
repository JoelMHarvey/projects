import { describe, expect, it } from 'vitest';
import { createLoggingPushSender, ownerPushToken, sendPush } from './push.ts';

describe('createLoggingPushSender', () => {
  it('logs the delivery and reports success', async () => {
    const logs: string[] = [];
    const send = createLoggingPushSender((m) => logs.push(m));
    const result = await send('apns-token-1', {
      title: 'Session starting',
      body: 'Kiwi is calling',
      data: { session_id: 's1' },
    });
    expect(result).toEqual({ ok: true, detail: 'logged' });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('apns-token-1');
    expect(logs[0]).toContain('Session starting');
    expect(logs[0]).toContain('"session_id":"s1"');
  });

  it('fails fast on a missing token without logging', async () => {
    const logs: string[] = [];
    const send = createLoggingPushSender((m) => logs.push(m));
    for (const token of ['', '   ']) {
      const result = await send(token, { title: 't', body: 'b' });
      expect(result).toEqual({ ok: false, detail: 'missing_token' });
    }
    expect(logs).toHaveLength(0);
  });

  it('omits the data suffix when payload.data is absent', async () => {
    const logs: string[] = [];
    const send = createLoggingPushSender((m) => logs.push(m));
    await send('tok', { title: 't', body: 'b' });
    expect(logs[0]).not.toContain('data=');
  });
});

describe('sendPush (default sender)', () => {
  it('is a working PushSender', async () => {
    const result = await sendPush('tok', { title: 't', body: 'b' });
    expect(result.ok).toBe(true);
  });
});

describe('ownerPushToken', () => {
  it('builds the owner routing placeholder', () => {
    expect(ownerPushToken('4c1f...')).toBe('owner:4c1f...');
  });
});
