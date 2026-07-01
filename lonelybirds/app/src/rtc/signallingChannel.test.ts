import { describe, expect, it } from 'vitest';
import { makeSignalMessage, type SignalMessage } from '../core/signalling';
import {
  MemorySignallingBus,
  SIGNAL_EVENT,
  SupabaseSignallingChannel,
  type RealtimeChannelLike,
  type RealtimeClientLike,
} from './signallingChannel';

// --- Fake of the @supabase/supabase-js Realtime surface ---------------------

class FakeRealtimeChannel implements RealtimeChannelLike {
  readonly handlers: Array<{ event: string; cb: (m: { payload?: unknown }) => void }> = [];
  readonly sent: unknown[] = [];
  subscribed = false;
  unsubscribed = false;

  on(
    _type: 'broadcast',
    filter: { event: string },
    cb: (message: { payload?: unknown }) => void,
  ): RealtimeChannelLike {
    this.handlers.push({ event: filter.event, cb });
    return this;
  }

  subscribe(cb?: (status: string, err?: Error) => void): RealtimeChannelLike {
    this.subscribed = true;
    cb?.('SUBSCRIBED');
    return this;
  }

  async send(args: { type: 'broadcast'; event: string; payload: unknown }): Promise<unknown> {
    this.sent.push(args);
    return 'ok';
  }

  async unsubscribe(): Promise<unknown> {
    this.unsubscribed = true;
    return 'ok';
  }

  /** Simulate an inbound broadcast from another participant. */
  deliver(event: string, payload: unknown): void {
    for (const h of this.handlers) if (h.event === event) h.cb({ payload });
  }
}

class FakeSupabase implements RealtimeClientLike {
  readonly channels = new Map<string, FakeRealtimeChannel>();
  lastConfig: unknown;

  channel(name: string, opts?: unknown): RealtimeChannelLike {
    this.lastConfig = opts;
    const ch = new FakeRealtimeChannel();
    this.channels.set(name, ch);
    return ch;
  }
}

describe('SupabaseSignallingChannel', () => {
  it('joins the contract channel session:{id} with self-echo off', async () => {
    const client = new FakeSupabase();
    const channel = new SupabaseSignallingChannel(client, 'sess-123');
    await channel.open();

    expect([...client.channels.keys()]).toEqual(['session:sess-123']);
    expect(client.channels.get('session:sess-123')?.subscribed).toBe(true);
    expect(client.lastConfig).toMatchObject({
      config: { broadcast: { self: false } },
    });
  });

  it('sends the exact contract envelope as broadcast payload', async () => {
    const client = new FakeSupabase();
    const channel = new SupabaseSignallingChannel(client, 'sess-123');
    await channel.open();
    await channel.send(makeSignalMessage('hello', 'terminal_b'));

    const fake = client.channels.get('session:sess-123')!;
    expect(fake.sent).toEqual([
      {
        type: 'broadcast',
        event: SIGNAL_EVENT,
        payload: { v: 1, type: 'hello', from: 'terminal_b', payload: null },
      },
    ]);
  });

  it('delivers valid inbound envelopes and drops malformed ones', async () => {
    const client = new FakeSupabase();
    const channel = new SupabaseSignallingChannel(client, 'sess-123');
    await channel.open();

    const received: SignalMessage[] = [];
    channel.onMessage((m) => received.push(m));

    const fake = client.channels.get('session:sess-123')!;
    fake.deliver(SIGNAL_EVENT, makeSignalMessage('offer', 'terminal_a', { to: 'terminal_b' }));
    fake.deliver(SIGNAL_EVENT, { v: 2, type: 'offer', from: 'terminal_a' }); // wrong version
    fake.deliver(SIGNAL_EVENT, { garbage: true });
    fake.deliver(SIGNAL_EVENT, null);

    expect(received).toHaveLength(1);
    expect(received[0]?.type).toBe('offer');
  });

  it('send before open throws; close unsubscribes', async () => {
    const client = new FakeSupabase();
    const channel = new SupabaseSignallingChannel(client, 'sess-123');
    await expect(channel.send(makeSignalMessage('hello', 'terminal_a'))).rejects.toThrow(
      /before open/,
    );

    await channel.open();
    await channel.close();
    expect(client.channels.get('session:sess-123')?.unsubscribed).toBe(true);
  });
});

describe('MemorySignallingBus', () => {
  it('broadcasts to every endpoint except the sender (self: false semantics)', async () => {
    const bus = new MemorySignallingBus();
    const a = bus.connect();
    const b = bus.connect();
    const c = bus.connect();
    await a.open();
    await b.open();
    await c.open();

    const seenByA: SignalMessage[] = [];
    const seenByB: SignalMessage[] = [];
    const seenByC: SignalMessage[] = [];
    a.onMessage((m) => seenByA.push(m));
    b.onMessage((m) => seenByB.push(m));
    c.onMessage((m) => seenByC.push(m));

    await a.send(makeSignalMessage('hello', 'terminal_a'));
    expect(seenByA).toHaveLength(0);
    expect(seenByB).toHaveLength(1);
    expect(seenByC).toHaveLength(1);
    expect(bus.log).toHaveLength(1);
  });

  it('closed endpoints stop receiving', async () => {
    const bus = new MemorySignallingBus();
    const a = bus.connect();
    const b = bus.connect();
    await a.open();
    await b.open();
    const seen: SignalMessage[] = [];
    b.onMessage((m) => seen.push(m));

    await b.close();
    await a.send(makeSignalMessage('bye', 'terminal_a'));
    expect(seen).toHaveLength(0);
  });
});
