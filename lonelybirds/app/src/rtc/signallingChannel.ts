/**
 * SignallingChannel — transport abstraction for the session signalling
 * protocol (CONTRACTS.md §Signalling). Messages are the core envelope
 * `{v: 1, type, from, payload}` from app/src/core/signalling.
 *
 * Implementations:
 * - `SupabaseSignallingChannel` — Supabase Realtime broadcast channel
 *   `session:{session_id}` (channel name via core `sessionChannelName`).
 * - `MemorySignallingBus` / `MemorySignallingChannel` — in-process bus for
 *   tests; mirrors Realtime broadcast semantics (no echo to the sender).
 *
 * The Supabase client is typed structurally (RealtimeClientLike) so this
 * module stays importable under plain Node and testable without the SDK.
 */

import { isSignalMessage, sessionChannelName, type SignalMessage } from '../core/signalling';

export interface SignallingChannel {
  /** Subscribe; resolves once the channel is joined. Idempotent. */
  open(): Promise<void>;
  /** Broadcast an envelope to every other participant on the channel. */
  send(msg: SignalMessage): Promise<void>;
  /** Register a handler for incoming envelopes. Returns unsubscribe. */
  onMessage(cb: (msg: SignalMessage) => void): () => void;
  /** Leave the channel and release resources. Safe to call twice. */
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Supabase Realtime implementation
// ---------------------------------------------------------------------------

/** Broadcast event name inside the `session:{id}` channel. */
export const SIGNAL_EVENT = 'signal';

/** Structural subset of @supabase/supabase-js RealtimeChannel (v2). */
export interface RealtimeChannelLike {
  on(
    type: 'broadcast',
    filter: { event: string },
    cb: (message: { payload?: unknown }) => void,
  ): RealtimeChannelLike;
  subscribe(cb?: (status: string, err?: Error) => void): RealtimeChannelLike;
  send(args: { type: 'broadcast'; event: string; payload: unknown }): Promise<unknown>;
  unsubscribe(): Promise<unknown>;
}

/** Structural subset of the SupabaseClient we need. */
export interface RealtimeClientLike {
  channel(
    name: string,
    opts?: { config?: { broadcast?: { self?: boolean; ack?: boolean } } },
  ): RealtimeChannelLike;
}

export class SupabaseSignallingChannel implements SignallingChannel {
  private readonly client: RealtimeClientLike;
  private readonly sessionId: string;
  private channel: RealtimeChannelLike | null = null;
  private opening: Promise<void> | null = null;
  private readonly handlers = new Set<(msg: SignalMessage) => void>();

  constructor(client: RealtimeClientLike, sessionId: string) {
    this.client = client;
    this.sessionId = sessionId;
  }

  open(): Promise<void> {
    if (this.opening) return this.opening;
    const channel = this.client.channel(sessionChannelName(this.sessionId), {
      config: { broadcast: { self: false, ack: true } },
    });
    this.channel = channel;
    channel.on('broadcast', { event: SIGNAL_EVENT }, (message) => {
      const payload = message.payload;
      if (isSignalMessage(payload)) {
        for (const cb of [...this.handlers]) cb(payload);
      }
    });
    this.opening = new Promise<void>((resolve, reject) => {
      channel.subscribe((status, err) => {
        if (status === 'SUBSCRIBED') resolve();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          reject(err ?? new Error(`realtime subscribe failed: ${status}`));
        }
        // 'CLOSED' after a deliberate close() needs no action.
      });
    });
    return this.opening;
  }

  async send(msg: SignalMessage): Promise<void> {
    if (!this.channel) throw new Error('SupabaseSignallingChannel: send before open()');
    await this.channel.send({ type: 'broadcast', event: SIGNAL_EVENT, payload: msg });
  }

  onMessage(cb: (msg: SignalMessage) => void): () => void {
    this.handlers.add(cb);
    return () => {
      this.handlers.delete(cb);
    };
  }

  async close(): Promise<void> {
    const channel = this.channel;
    this.channel = null;
    this.opening = null;
    this.handlers.clear();
    if (channel) await channel.unsubscribe();
  }
}

// ---------------------------------------------------------------------------
// In-memory bus (tests / local dev)
// ---------------------------------------------------------------------------

/**
 * One bus per session. `connect()` mints a channel endpoint; `send` delivers
 * synchronously to every OTHER open endpoint (Realtime `self: false`).
 */
export class MemorySignallingBus {
  private readonly endpoints = new Set<MemorySignallingChannel>();
  /** Every envelope that crossed the bus, for assertions. */
  readonly log: SignalMessage[] = [];
  /** Test hook: when true, messages are logged but not delivered (network partition). */
  dropMessages = false;

  connect(): MemorySignallingChannel {
    return new MemorySignallingChannel(this);
  }

  /** @internal */
  attach(ch: MemorySignallingChannel): void {
    this.endpoints.add(ch);
  }

  /** @internal */
  detach(ch: MemorySignallingChannel): void {
    this.endpoints.delete(ch);
  }

  /** @internal */
  broadcast(from: MemorySignallingChannel, msg: SignalMessage): void {
    this.log.push(msg);
    if (this.dropMessages) return;
    for (const endpoint of [...this.endpoints]) {
      if (endpoint !== from) endpoint.deliver(msg);
    }
  }
}

export class MemorySignallingChannel implements SignallingChannel {
  private readonly bus: MemorySignallingBus;
  private readonly handlers = new Set<(msg: SignalMessage) => void>();
  private openState = false;

  constructor(bus: MemorySignallingBus) {
    this.bus = bus;
  }

  async open(): Promise<void> {
    if (this.openState) return;
    this.openState = true;
    this.bus.attach(this);
  }

  async send(msg: SignalMessage): Promise<void> {
    if (!this.openState) throw new Error('MemorySignallingChannel: send before open()');
    this.bus.broadcast(this, msg);
  }

  onMessage(cb: (msg: SignalMessage) => void): () => void {
    this.handlers.add(cb);
    return () => {
      this.handlers.delete(cb);
    };
  }

  async close(): Promise<void> {
    this.openState = false;
    this.bus.detach(this);
    this.handlers.clear();
  }

  /** @internal */
  deliver(msg: SignalMessage): void {
    for (const cb of [...this.handlers]) cb(msg);
  }
}
