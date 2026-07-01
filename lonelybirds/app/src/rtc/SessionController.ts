/**
 * SessionController — wires the pure core sessionMachine to an RTCProvider
 * and a SignallingChannel (CONTRACTS.md §app/src/rtc).
 *
 * Perfect-negotiation roles: terminal_a (lexically smaller pet id) is the
 * IMPOLITE peer and creates offers; terminal_b is polite and always accepts
 * an incoming offer, replacing its peer if one already exists. Observers
 * join recv-only: they send `hello`, terminal_a answers each observer with a
 * dedicated sendonly peer; observers never publish media.
 *
 * Reconnect: on peer disconnect the machine enters `reconnecting`; the
 * controller retries using core `nextBackoffMs` (terminal_a re-offers on a
 * fresh peer, terminal_b/observers re-send `hello` to poke terminal_a) and
 * dispatches RECONNECT_TIMEOUT after 60s of unbroken reconnecting, ending
 * the session as failed. Teardown happens on `bye` or any END-family event.
 *
 * Envelope on the wire is exactly `{v, type, from, payload}`; directed
 * routing (`to`) lives inside `payload` so the envelope stays contract-exact.
 */

import { nextBackoffMs, type BackoffOptions } from '../core/backoff';
import {
  initialSessionState,
  RECONNECT_TIMEOUT_MS,
  sessionReducer,
  type EndReason,
  type SessionState,
} from '../core/sessionMachine';
import { makeSignalMessage, type SignalMessage, type SignalSender } from '../core/signalling';
import type {
  IceCandidateInit,
  MediaStreamHandle,
  PeerHandle,
  RTCProvider,
  SessionDescription,
} from './provider';
import type { SignallingChannel } from './signallingChannel';

// --- Payload shapes (inside the contract envelope's `payload: unknown`) ----

export interface DirectedDescriptionPayload {
  to: SignalSender;
  description: SessionDescription;
}

export interface DirectedIcePayload {
  to: SignalSender;
  candidate: IceCandidateInit;
}

export interface ByePayload {
  reason?: EndReason;
}

function directedTo(payload: unknown): SignalSender | null {
  if (typeof payload === 'object' && payload !== null) {
    const to = (payload as Record<string, unknown>)['to'];
    if (typeof to === 'string') return to as SignalSender;
  }
  return null;
}

// ---------------------------------------------------------------------------

export interface SessionControllerOptions {
  /** My sender identity: 'terminal_a' | 'terminal_b' | 'observer:{ownerId}'. */
  role: SignalSender;
  provider: RTCProvider;
  channel: SignallingChannel;
  /** Backoff options for the reconnect loop. Default: 1s base, 30s cap, jitter. */
  backoff?: BackoffOptions;
  /** Clock, injectable for tests. */
  now?: () => number;
  onStateChange?: (state: SessionState) => void;
  /** Remote media arrived (partner terminal for terminals; terminal_a for observers). */
  onRemoteStream?: (stream: MediaStreamHandle, from: SignalSender) => void;
  onEnded?: (reason: EndReason) => void;
}

export class SessionController {
  readonly role: SignalSender;

  private readonly provider: RTCProvider;
  private readonly channel: SignallingChannel;
  private readonly backoff: BackoffOptions;
  private readonly now: () => number;
  private readonly opts: SessionControllerOptions;

  private machineState: SessionState = initialSessionState;
  private mainPeer: PeerHandle | null = null;
  private mainPeerUnsubs: Array<() => void> = [];
  /** terminal_a only: one sendonly peer per observer. */
  private readonly observerPeers = new Map<string, PeerHandle>();
  private localStream: MediaStreamHandle | null = null;
  private unsubscribeMessages: (() => void) | null = null;

  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDeadline: ReturnType<typeof setTimeout> | null = null;
  private helloRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private tornDown = false;

  constructor(opts: SessionControllerOptions) {
    this.opts = opts;
    this.role = opts.role;
    this.provider = opts.provider;
    this.channel = opts.channel;
    this.backoff = opts.backoff ?? { baseMs: 1000, maxMs: 30000, jitter: true };
    this.now = opts.now ?? Date.now;
  }

  get state(): SessionState {
    return this.machineState;
  }

  private get isObserver(): boolean {
    return this.role.startsWith('observer:');
  }

  /** The counterpart my main peer talks to. */
  private get counterpart(): SignalSender {
    if (this.isObserver) return 'terminal_a';
    return this.role === 'terminal_a' ? 'terminal_b' : 'terminal_a';
  }

  /** Join the signalling channel and announce ourselves. */
  async start(): Promise<void> {
    this.dispatch({ type: 'JOIN' });
    await this.channel.open();
    this.unsubscribeMessages = this.channel.onMessage((msg) => {
      void this.handleMessage(msg).catch((err) => {
        // Signalling handler failures must never crash the host.
        console.error(`[SessionController ${this.role}] signalling error`, err);
      });
    });
    if (!this.isObserver) {
      this.localStream = await this.provider.getLocalStream();
    }
    this.mainPeer = this.createMainPeer();
    await this.send('hello', null);
    if (this.isObserver) {
      // Terminal_a may not have joined yet (or our hello may race its
      // subscribe): keep repeating hello with backoff until we get an offer.
      this.scheduleHelloRetry(0);
    }
  }

  /** End the session for everyone (terminals) or leave quietly (observers). */
  async end(reason: EndReason): Promise<void> {
    if (this.machineState.status === 'ended') return;
    try {
      const payload: ByePayload = { reason };
      await this.send('bye', payload);
    } catch {
      // Channel may already be gone; teardown regardless.
    }
    this.dispatch({ type: 'END', reason });
  }

  // -------------------------------------------------------------- machine --

  private dispatch(event: Parameters<typeof sessionReducer>[1]): void {
    const prev = this.machineState;
    const next = sessionReducer(prev, event);
    if (next === prev) return;
    this.machineState = next;

    if (prev.status === 'reconnecting' && next.status === 'active') {
      this.clearReconnectTimers();
    }
    this.opts.onStateChange?.(next);
    if (next.status === 'ended') {
      this.teardown();
      this.opts.onEnded?.(next.endReason ?? 'failed');
    }
  }

  // ------------------------------------------------------------- peers -----

  private createMainPeer(): PeerHandle {
    const peer = this.provider.createPeer({
      direction: this.isObserver ? 'recvonly' : 'sendrecv',
    });
    if (this.localStream) peer.setLocalStream(this.localStream);

    const unsubs: Array<() => void> = [];
    unsubs.push(
      peer.onIce((candidate) => {
        if (peer !== this.mainPeer) return;
        const payload: DirectedIcePayload = { to: this.counterpart, candidate };
        void this.send('ice', payload).catch(() => undefined);
      }),
    );
    unsubs.push(
      peer.onTrack((stream) => {
        if (peer !== this.mainPeer) return;
        this.opts.onRemoteStream?.(stream, this.counterpart);
      }),
    );
    unsubs.push(
      peer.onConnectionStateChange((state) => {
        if (peer !== this.mainPeer) return;
        if (state === 'connected') {
          if (this.machineState.status === 'reconnecting') {
            this.dispatch({ type: 'RECONNECTED' });
          } else {
            this.dispatch({ type: 'NEGOTIATED' });
          }
        } else if (state === 'disconnected' || state === 'failed') {
          const status = this.machineState.status;
          if (status === 'active' || status === 'negotiating') {
            this.dispatch({ type: 'DISCONNECT', at: this.now() });
            this.startReconnectLoop();
          }
        }
      }),
    );
    // Replace the previous peer's subscriptions.
    for (const unsub of this.mainPeerUnsubs) unsub();
    this.mainPeerUnsubs = unsubs;
    return peer;
  }

  private replaceMainPeer(): PeerHandle {
    const old = this.mainPeer;
    this.mainPeer = null; // events from `old` are ignored from here on
    old?.close();
    this.mainPeer = this.createMainPeer();
    return this.mainPeer;
  }

  // --------------------------------------------------------- signalling ----

  private async send(type: SignalMessage['type'], payload: unknown): Promise<void> {
    await this.channel.send(makeSignalMessage(type, this.role, payload));
  }

  private async handleMessage(msg: SignalMessage): Promise<void> {
    if (msg.from === this.role) return; // self-echo safety
    if (this.machineState.status === 'ended') return;

    switch (msg.type) {
      case 'hello':
        await this.handleHello(msg.from);
        return;
      case 'offer':
        if (directedTo(msg.payload) !== this.role) return;
        await this.handleOffer(msg.from, msg.payload as DirectedDescriptionPayload);
        return;
      case 'answer':
        if (directedTo(msg.payload) !== this.role) return;
        await this.handleAnswer(msg.from, msg.payload as DirectedDescriptionPayload);
        return;
      case 'ice':
        if (directedTo(msg.payload) !== this.role) return;
        await this.handleIce(msg.from, msg.payload as DirectedIcePayload);
        return;
      case 'bye':
        this.handleBye(msg.from, msg.payload as ByePayload | null);
        return;
    }
  }

  private async handleHello(from: SignalSender): Promise<void> {
    if (this.isObserver) return; // observers only care about their offer

    if (from.startsWith('observer:')) {
      // Observer wants in: only terminal_a serves observers (single fan-out point).
      if (this.role === 'terminal_a' && this.localStream) {
        await this.offerToObserver(from);
      }
      return;
    }

    if (from !== this.counterpart) return;
    const prevStatus = this.machineState.status;
    this.dispatch({ type: 'PEER_HELLO' });

    if (this.role === 'terminal_a') {
      // Impolite offerer: offer on first contact and on reconnect pokes.
      if (prevStatus === 'joining') {
        await this.offerToPartner(false);
      } else if (prevStatus === 'reconnecting') {
        await this.offerToPartner(true);
      }
    } else if (prevStatus === 'joining') {
      // terminal_b joined first: reply hello so terminal_a knows we're here.
      await this.send('hello', null);
    }
  }

  private async offerToPartner(replacePeer: boolean): Promise<void> {
    const peer = replacePeer ? this.replaceMainPeer() : (this.mainPeer ?? this.createMainPeer());
    this.mainPeer = peer;
    const description = await peer.createOffer();
    const payload: DirectedDescriptionPayload = { to: this.counterpart, description };
    await this.send('offer', payload);
  }

  private async offerToObserver(observer: SignalSender): Promise<void> {
    // Fresh peer per hello (covers observer reconnects too).
    this.observerPeers.get(observer)?.close();
    const peer = this.provider.createPeer({ direction: 'sendonly' });
    this.observerPeers.set(observer, peer);
    if (this.localStream) peer.setLocalStream(this.localStream);
    peer.onIce((candidate) => {
      if (this.observerPeers.get(observer) !== peer) return;
      const payload: DirectedIcePayload = { to: observer, candidate };
      void this.send('ice', payload).catch(() => undefined);
    });
    const description = await peer.createOffer();
    const payload: DirectedDescriptionPayload = { to: observer, description };
    await this.send('offer', payload);
  }

  private async handleOffer(
    from: SignalSender,
    payload: DirectedDescriptionPayload,
  ): Promise<void> {
    if (this.role === 'terminal_a') return; // impolite peer never accepts offers
    if (from !== this.counterpart) return;

    if (this.machineState.status === 'joining') {
      this.dispatch({ type: 'PEER_HELLO' }); // an offer implies hello
    }
    // Polite peer (and observer): always accept the newest offer, replacing
    // any existing peer — this is the perfect-negotiation collision rule and
    // doubles as the reconnect path.
    const peer =
      this.machineState.status === 'negotiating' && this.mainPeer
        ? this.mainPeer
        : this.replaceMainPeer();
    const answer = await peer.acceptOffer(payload.description);
    const reply: DirectedDescriptionPayload = { to: from, description: answer };
    await this.send('answer', reply);
  }

  private async handleAnswer(
    from: SignalSender,
    payload: DirectedDescriptionPayload,
  ): Promise<void> {
    if (from.startsWith('observer:')) {
      if (this.role !== 'terminal_a') return;
      const peer = this.observerPeers.get(from);
      if (peer) await peer.acceptAnswer(payload.description);
      return;
    }
    if (this.role !== 'terminal_a' || from !== this.counterpart) return;
    if (this.mainPeer) await this.mainPeer.acceptAnswer(payload.description);
  }

  private async handleIce(from: SignalSender, payload: DirectedIcePayload): Promise<void> {
    if (from.startsWith('observer:')) {
      const peer = this.observerPeers.get(from);
      if (peer) await peer.addIce(payload.candidate);
      return;
    }
    if (from === this.counterpart && this.mainPeer) {
      await this.mainPeer.addIce(payload.candidate);
    }
  }

  private handleBye(from: SignalSender, payload: ByePayload | null): void {
    if (from.startsWith('observer:')) {
      // An observer left: terminal_a drops that observer's peer; the session
      // itself continues.
      const peer = this.observerPeers.get(from);
      if (peer) {
        peer.close();
        this.observerPeers.delete(from);
      }
      return;
    }
    // A terminal said bye (owner ended, window boundary, max duration, …):
    // the whole session tears down.
    this.dispatch({ type: 'END', reason: payload?.reason ?? 'owner_ended' });
  }

  // ---------------------------------------------------------- reconnect ----

  private startReconnectLoop(): void {
    this.clearReconnectTimers();
    this.reconnectAttempt = 0;
    this.reconnectDeadline = setTimeout(() => {
      this.dispatch({ type: 'RECONNECT_TIMEOUT', at: this.now() });
    }, RECONNECT_TIMEOUT_MS);
    this.scheduleReconnectAttempt();
  }

  private scheduleReconnectAttempt(): void {
    const delay = nextBackoffMs(this.reconnectAttempt, this.backoff);
    this.reconnectTimer = setTimeout(() => {
      void (async () => {
        if (this.machineState.status !== 'reconnecting') return;
        this.reconnectAttempt += 1;
        try {
          if (this.role === 'terminal_a') {
            await this.offerToPartner(true);
          } else {
            // terminal_b / observer: poke terminal_a into re-offering.
            await this.send('hello', null);
          }
        } catch {
          // Channel hiccup: the next attempt will retry.
        }
        if (this.machineState.status === 'reconnecting') {
          this.scheduleReconnectAttempt();
        }
      })();
    }, delay);
  }

  private scheduleHelloRetry(attempt: number): void {
    this.helloRetryTimer = setTimeout(() => {
      void (async () => {
        if (this.machineState.status !== 'joining') return;
        try {
          await this.send('hello', null);
        } catch {
          // retry below
        }
        if (this.machineState.status === 'joining') this.scheduleHelloRetry(attempt + 1);
      })();
    }, nextBackoffMs(attempt, this.backoff));
  }

  private clearReconnectTimers(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.reconnectDeadline !== null) {
      clearTimeout(this.reconnectDeadline);
      this.reconnectDeadline = null;
    }
  }

  // ------------------------------------------------------------ teardown ---

  private teardown(): void {
    if (this.tornDown) return;
    this.tornDown = true;
    this.clearReconnectTimers();
    if (this.helloRetryTimer !== null) {
      clearTimeout(this.helloRetryTimer);
      this.helloRetryTimer = null;
    }
    this.unsubscribeMessages?.();
    this.unsubscribeMessages = null;
    for (const unsub of this.mainPeerUnsubs) unsub();
    this.mainPeerUnsubs = [];
    const peer = this.mainPeer;
    this.mainPeer = null;
    peer?.close();
    for (const observerPeer of this.observerPeers.values()) observerPeer.close();
    this.observerPeers.clear();
    void this.channel.close().catch(() => undefined);
  }
}
