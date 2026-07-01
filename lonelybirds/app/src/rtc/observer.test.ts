import { describe, expect, it } from 'vitest';
import type { ObserverControllerFactory } from '../api/sessionController';
import { MockRTCProvider } from './MockRTCProvider';
import { createObserverControllerFactory } from './observer';
import { SessionController } from './SessionController';
import {
  SupabaseSignallingChannel,
  type RealtimeChannelLike,
  type RealtimeClientLike,
} from './signallingChannel';

async function flush(times = 25): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

/**
 * In-memory fake of the supabase Realtime client: endpoints subscribed to
 * the same channel name receive each other's broadcasts (self: false), so
 * SupabaseSignallingChannel itself is exercised end-to-end.
 */
class FakeRealtime implements RealtimeClientLike {
  private readonly endpoints = new Map<string, Set<FakeEndpoint>>();

  channel(name: string): RealtimeChannelLike {
    return new FakeEndpoint(this, name);
  }

  /** @internal */
  attach(endpoint: FakeEndpoint, name: string): void {
    let set = this.endpoints.get(name);
    if (!set) {
      set = new Set();
      this.endpoints.set(name, set);
    }
    set.add(endpoint);
  }

  /** @internal */
  detach(endpoint: FakeEndpoint, name: string): void {
    this.endpoints.get(name)?.delete(endpoint);
  }

  /** @internal */
  broadcast(from: FakeEndpoint, name: string, event: string, payload: unknown): void {
    for (const endpoint of [...(this.endpoints.get(name) ?? [])]) {
      if (endpoint !== from) endpoint.deliver(event, payload);
    }
  }
}

class FakeEndpoint implements RealtimeChannelLike {
  private readonly handlers: Array<{ event: string; cb: (m: { payload?: unknown }) => void }> = [];

  constructor(
    private readonly bus: FakeRealtime,
    private readonly name: string,
  ) {}

  on(
    _type: 'broadcast',
    filter: { event: string },
    cb: (message: { payload?: unknown }) => void,
  ): RealtimeChannelLike {
    this.handlers.push({ event: filter.event, cb });
    return this;
  }

  subscribe(cb?: (status: string, err?: Error) => void): RealtimeChannelLike {
    this.bus.attach(this, this.name);
    cb?.('SUBSCRIBED');
    return this;
  }

  async send(args: { type: 'broadcast'; event: string; payload: unknown }): Promise<unknown> {
    this.bus.broadcast(this, this.name, args.event, args.payload);
    return 'ok';
  }

  async unsubscribe(): Promise<unknown> {
    this.bus.detach(this, this.name);
    return 'ok';
  }

  /** @internal */
  deliver(event: string, payload: unknown): void {
    for (const h of this.handlers) if (h.event === event) h.cb({ payload });
  }
}

describe('createObserverControllerFactory', () => {
  it('matches the interface the owner app consumes (compile-time)', () => {
    const factory: ObserverControllerFactory = createObserverControllerFactory({
      provider: new MockRTCProvider(),
      realtimeClient: new FakeRealtime(),
    });
    expect(typeof factory).toBe('function');
  });

  it('observer joins over SupabaseSignallingChannel, gets media, leaves harmlessly', async () => {
    const provider = new MockRTCProvider();
    const realtime = new FakeRealtime();
    const sessionId = 'sess-observer-e2e';

    const a = new SessionController({
      role: 'terminal_a',
      provider,
      channel: new SupabaseSignallingChannel(realtime, sessionId),
      backoff: { jitter: false },
    });
    const b = new SessionController({
      role: 'terminal_b',
      provider,
      channel: new SupabaseSignallingChannel(realtime, sessionId),
      backoff: { jitter: false },
    });
    await a.start();
    await b.start();
    await flush();
    expect(a.state.status).toBe('active');
    expect(b.state.status).toBe('active');

    const factory = createObserverControllerFactory({ provider, realtimeClient: realtime });
    const handle = factory({ sessionId, ownerId: 'owner-7' });
    const streams: unknown[] = [];
    const states: string[] = [];
    handle.onRemoteStream((s) => streams.push(s));
    handle.onStateChange((s) => states.push(s));

    await handle.join();
    await flush();
    expect(states[states.length - 1]).toBe('active');
    expect(streams).toHaveLength(1);

    await handle.leave();
    await flush();
    // Observer leaving must not end the pets' session.
    expect(a.state.status).toBe('active');
    expect(b.state.status).toBe('active');
  });
});
