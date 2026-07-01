import { describe, expect, it } from 'vitest';
import {
  broadcastEndpoint,
  broadcastMessages,
  terminalSessionStartMessages,
  type BroadcastEnvelope,
  type FetchLike,
} from './realtime.ts';
import { SESSION_START_EVENT } from './signalling.ts';

const SESSION = '33333333-3333-4333-8333-333333333333';
const PET_A = '11111111-1111-4111-8111-111111111111';
const PET_B = '22222222-2222-4222-8222-222222222222';

describe('broadcastEndpoint', () => {
  it('builds the Realtime HTTP endpoint, tolerating trailing slashes', () => {
    expect(broadcastEndpoint('https://x.supabase.co')).toBe(
      'https://x.supabase.co/realtime/v1/api/broadcast',
    );
    expect(broadcastEndpoint('https://x.supabase.co/')).toBe(
      'https://x.supabase.co/realtime/v1/api/broadcast',
    );
  });
});

describe('broadcastMessages', () => {
  const messages: BroadcastEnvelope[] = [
    { topic: 'session:abc', event: 'signal', payload: { v: 1 } },
  ];

  it('POSTs the messages with service-role auth headers', async () => {
    const calls: Array<{ url: string; init: Parameters<FetchLike>[1] }> = [];
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 200 };
    };
    const ok = await broadcastMessages({
      supabaseUrl: 'https://x.supabase.co',
      serviceRoleKey: 'srk',
      messages,
      fetchImpl,
    });
    expect(ok).toBe(true);
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe('https://x.supabase.co/realtime/v1/api/broadcast');
    expect(call.init.method).toBe('POST');
    expect(call.init.headers['Authorization']).toBe('Bearer srk');
    expect(call.init.headers['apikey']).toBe('srk');
    expect(JSON.parse(call.init.body)).toEqual({ messages });
  });

  it('skips the network entirely for an empty batch', async () => {
    let called = false;
    const fetchImpl: FetchLike = async () => {
      called = true;
      return { ok: true, status: 200 };
    };
    expect(
      await broadcastMessages({
        supabaseUrl: 'https://x.supabase.co',
        serviceRoleKey: 'srk',
        messages: [],
        fetchImpl,
      }),
    ).toBe(true);
    expect(called).toBe(false);
  });

  it('reports non-2xx and thrown errors without throwing', async () => {
    const errors: string[] = [];
    expect(
      await broadcastMessages({
        supabaseUrl: 'https://x.supabase.co',
        serviceRoleKey: 'srk',
        messages,
        fetchImpl: async () => ({ ok: false, status: 500 }),
        onError: (detail) => errors.push(detail),
      }),
    ).toBe(false);
    expect(
      await broadcastMessages({
        supabaseUrl: 'https://x.supabase.co',
        serviceRoleKey: 'srk',
        messages,
        fetchImpl: async () => {
          throw new Error('boom');
        },
        onError: (detail) => errors.push(detail),
      }),
    ).toBe(false);
    expect(errors).toHaveLength(2);
  });
});

describe('terminalSessionStartMessages', () => {
  it('fans out one session-start per device with the full SessionStartPush payload', () => {
    const messages = terminalSessionStartMessages(
      [
        { deviceId: 'dev-a', petId: PET_A },
        { deviceId: 'dev-b', petId: PET_B },
      ],
      SESSION,
      PET_A,
      PET_B,
    );
    expect(messages).toEqual([
      {
        topic: 'terminal:dev-a',
        event: SESSION_START_EVENT,
        payload: { session_id: SESSION, pet_id: PET_A, partner_pet_id: PET_B },
      },
      {
        topic: 'terminal:dev-b',
        event: SESSION_START_EVENT,
        payload: { session_id: SESSION, pet_id: PET_B, partner_pet_id: PET_A },
      },
    ]);
  });

  it('skips devices bound to neither pet of the session', () => {
    expect(
      terminalSessionStartMessages(
        [{ deviceId: 'dev-x', petId: 'someone-else' }],
        SESSION,
        PET_A,
        PET_B,
      ),
    ).toEqual([]);
  });
});
