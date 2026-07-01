import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  observerSender,
  whoAmI,
  type SignalMessage,
  type SignalSender,
} from '../core/signalling';
import type { EndReason, SessionState } from '../core/sessionMachine';
import { MockRTCProvider } from './MockRTCProvider';
import { SessionController } from './SessionController';
import { MemorySignallingBus } from './signallingChannel';
import type { MediaStreamHandle } from './provider';

/** Drain the promise chains between the controllers (bus delivery is sync,
 * but handlers await provider promises). */
async function flush(times = 25): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

interface Harness {
  controller: SessionController;
  states: SessionState[];
  streams: MediaStreamHandle[];
  ended: EndReason[];
}

function makeHarness(
  role: SignalSender,
  provider: MockRTCProvider,
  bus: MemorySignallingBus,
  backoff = { jitter: false },
): Harness {
  const states: SessionState[] = [];
  const streams: MediaStreamHandle[] = [];
  const ended: EndReason[] = [];
  const controller = new SessionController({
    role,
    provider,
    channel: bus.connect(),
    backoff,
    onStateChange: (s) => states.push(s),
    onRemoteStream: (s) => streams.push(s),
    onEnded: (r) => ended.push(r),
  });
  return { controller, states, streams, ended };
}

describe('SessionController end-to-end over MockRTCProvider + memory bus', () => {
  let provider: MockRTCProvider;
  let bus: MemorySignallingBus;

  beforeEach(() => {
    provider = new MockRTCProvider();
    bus = new MemorySignallingBus();
  });

  async function establish(): Promise<{ a: Harness; b: Harness }> {
    const a = makeHarness('terminal_a', provider, bus);
    const b = makeHarness('terminal_b', provider, bus);
    await a.controller.start();
    await b.controller.start();
    await flush();
    return { a, b };
  }

  it('two terminals reach active and exchange media', async () => {
    const { a, b } = await establish();

    expect(a.controller.state.status).toBe('active');
    expect(b.controller.state.status).toBe('active');
    // Both sides received the other's stream exactly once.
    expect(a.streams).toHaveLength(1);
    expect(b.streams).toHaveLength(1);
    expect(a.streams[0]?.id).not.toBe(b.streams[0]?.id);
    // Machine walked joining → negotiating → active.
    expect(a.states.map((s) => s.status)).toEqual(['joining', 'negotiating', 'active']);
    expect(b.states.map((s) => s.status)).toEqual(['joining', 'negotiating', 'active']);
  });

  it('establishes regardless of start order (terminal_b first)', async () => {
    const a = makeHarness('terminal_a', provider, bus);
    const b = makeHarness('terminal_b', provider, bus);
    await b.controller.start();
    await a.controller.start();
    await flush();

    expect(a.controller.state.status).toBe('active');
    expect(b.controller.state.status).toBe('active');
  });

  it('uses the contract envelope on the wire', async () => {
    await establish();

    for (const msg of bus.log) {
      expect(Object.keys(msg).sort()).toEqual(['from', 'payload', 'type', 'v']);
      expect(msg.v).toBe(1);
      expect(['hello', 'offer', 'answer', 'ice', 'bye']).toContain(msg.type);
      expect(['terminal_a', 'terminal_b']).toContain(msg.from);
    }
    // terminal_a is the impolite offerer: every offer comes from it.
    const offers = bus.log.filter((m) => m.type === 'offer');
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.every((m) => m.from === 'terminal_a')).toBe(true);
    const answers = bus.log.filter((m) => m.type === 'answer');
    expect(answers.every((m) => m.from === 'terminal_b')).toBe(true);
  });

  it('whoAmI maps the lexically smaller pet id to terminal_a', () => {
    expect(whoAmI('pet-aaa', 'pet-bbb')).toBe('terminal_a');
    expect(whoAmI('pet-bbb', 'pet-aaa')).toBe('terminal_b');
  });

  describe('reconnect', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('recovers after a media drop via backoff re-offer', async () => {
      const { a, b } = await establish();
      const aPeer = provider.peers.find((p) => p.linkedTo !== null);
      expect(aPeer).toBeDefined();

      provider.severPair(aPeer!);
      await flush();
      expect(a.controller.state.status).toBe('reconnecting');
      expect(b.controller.state.status).toBe('reconnecting');

      // First backoff attempt at 1000ms: terminal_a re-offers, link re-forms.
      await vi.advanceTimersByTimeAsync(1000);
      await flush();
      expect(a.controller.state.status).toBe('active');
      expect(b.controller.state.status).toBe('active');
      // reconnecting → active came via RECONNECTED, not a fresh join.
      expect(a.states.map((s) => s.status)).toEqual([
        'joining',
        'negotiating',
        'active',
        'reconnecting',
        'active',
      ]);
    });

    it('ends as failed when reconnecting exceeds 60s', async () => {
      const { a, b } = await establish();
      const aPeer = provider.peers.find((p) => p.linkedTo !== null);

      bus.dropMessages = true; // network partition: signalling down too
      provider.severPair(aPeer!);
      await flush();
      expect(a.controller.state.status).toBe('reconnecting');

      await vi.advanceTimersByTimeAsync(59_000);
      expect(a.controller.state.status).toBe('reconnecting');

      await vi.advanceTimersByTimeAsync(2_000);
      expect(a.controller.state.status).toBe('ended');
      expect(a.controller.state.endReason).toBe('failed');
      expect(a.ended).toEqual(['failed']);
      expect(b.controller.state.status).toBe('ended');
      expect(b.controller.state.endReason).toBe('failed');
    });
  });

  describe('observer', () => {
    it('joins recv-only and receives terminal_a media without publishing', async () => {
      const { a, b } = await establish();

      const obs = makeHarness(observerSender('owner-42'), provider, bus);
      await obs.controller.start();
      await flush();

      expect(obs.controller.state.status).toBe('active');
      // Observer received exactly one stream: terminal_a's local capture.
      expect(obs.streams).toHaveLength(1);
      // Terminals are unaffected and got no extra media.
      expect(a.controller.state.status).toBe('active');
      expect(b.controller.state.status).toBe('active');
      expect(a.streams).toHaveLength(1);
      expect(b.streams).toHaveLength(1);

      // Observer's offer came from terminal_a addressed to the observer.
      const observerOffers = bus.log.filter(
        (m: SignalMessage) =>
          m.type === 'offer' &&
          (m.payload as { to?: string }).to === 'observer:owner-42',
      );
      expect(observerOffers).toHaveLength(1);
      expect(observerOffers[0]?.from).toBe('terminal_a');
      // Observer never sent an offer and never published media (recvonly peer).
      expect(bus.log.some((m) => m.type === 'offer' && m.from === 'observer:owner-42')).toBe(false);
      const observerPeer = provider.peers.find((p) => p.direction === 'recvonly');
      expect(observerPeer?.localStream).toBeNull();
    });

    it('an observer leaving does not end the terminals', async () => {
      const { a, b } = await establish();
      const obs = makeHarness(observerSender('owner-42'), provider, bus);
      await obs.controller.start();
      await flush();

      await obs.controller.end('owner_ended');
      await flush();

      expect(obs.controller.state.status).toBe('ended');
      expect(a.controller.state.status).toBe('active');
      expect(b.controller.state.status).toBe('active');
    });
  });

  describe('end / bye', () => {
    it('END propagates bye and tears everyone down', async () => {
      const { a, b } = await establish();
      const obs = makeHarness(observerSender('owner-42'), provider, bus);
      await obs.controller.start();
      await flush();

      await a.controller.end('owner_ended');
      await flush();

      // Exactly one bye on the wire, from terminal_a, with the reason.
      const byes = bus.log.filter((m) => m.type === 'bye' && m.from === 'terminal_a');
      expect(byes).toHaveLength(1);
      expect((byes[0]?.payload as { reason?: string }).reason).toBe('owner_ended');

      expect(a.controller.state).toMatchObject({ status: 'ended', endReason: 'owner_ended' });
      expect(b.controller.state).toMatchObject({ status: 'ended', endReason: 'owner_ended' });
      expect(obs.controller.state).toMatchObject({ status: 'ended', endReason: 'owner_ended' });
      expect(a.ended).toEqual(['owner_ended']);
      expect(b.ended).toEqual(['owner_ended']);

      // All peers are closed: no media path survives the session.
      await flush();
      for (const peer of provider.peers) {
        expect(peer.connectionState === 'closed' || peer.linkedTo === null).toBe(true);
      }
    });

    it('window boundary bye carries its reason to the far side', async () => {
      const { a, b } = await establish();
      await b.controller.end('window_boundary');
      await flush();
      expect(a.controller.state.endReason).toBe('window_boundary');
      expect(b.controller.state.endReason).toBe('window_boundary');
    });
  });
});
