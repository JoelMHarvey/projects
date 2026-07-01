/**
 * In-memory RTCProvider used by tests. Peers created by the same
 * MockRTCProvider instance link up through their SDP strings: an offer's SDP
 * carries the offering peer's id; `acceptOffer` records the pending link and
 * `acceptAnswer` completes it, at which point both handles synchronously emit
 * 'connecting' → 'connected' and deliver each other's local streams according
 * to the offerer's media direction.
 *
 * Extra test-only surface (not part of RTCProvider):
 * - `MockPeerHandle.simulateConnectionState(state)` — inject a state change
 * - `MockRTCProvider.severPair(handle)` — emit 'disconnected' on both linked
 *   peers and break the link (WiFi-drop simulation)
 * - `MockRTCProvider.peers` — every handle ever created
 */

import {
  Emitter,
  type CreatePeerOptions,
  type IceCandidateInit,
  type MediaDirection,
  type MediaStreamHandle,
  type PeerConnectionState,
  type PeerHandle,
  type RTCProvider,
  type SessionDescription,
} from './provider';

const SDP_PREFIX = 'mock-sdp';

function encodeSdp(peerId: string): string {
  return `${SDP_PREFIX}:${peerId}`;
}

function decodeSdp(sdp: string): string {
  const parts = sdp.split(':');
  if (parts[0] !== SDP_PREFIX || !parts[1]) {
    throw new Error(`MockRTCProvider: unrecognised SDP "${sdp}"`);
  }
  return parts[1];
}

export class MockPeerHandle implements PeerHandle {
  readonly id: string;
  readonly direction: MediaDirection;
  localStream: MediaStreamHandle | null = null;
  connectionState: PeerConnectionState = 'new';
  /** Remote candidates received via addIce (for assertions). */
  readonly remoteCandidates: IceCandidateInit[] = [];
  /** The peer this handle is currently linked to, once connected. */
  linkedTo: MockPeerHandle | null = null;

  private readonly ice = new Emitter<IceCandidateInit>();
  private readonly track = new Emitter<MediaStreamHandle>();
  private readonly state = new Emitter<PeerConnectionState>();
  private readonly provider: MockRTCProvider;

  constructor(provider: MockRTCProvider, id: string, direction: MediaDirection) {
    this.provider = provider;
    this.id = id;
    this.direction = direction;
  }

  setLocalStream(stream: MediaStreamHandle): void {
    this.localStream = stream;
  }

  async createOffer(): Promise<SessionDescription> {
    this.assertOpen('createOffer');
    // A real PC starts gathering ICE once the local description is set.
    this.ice.emit({ candidate: `mock-ice:${this.id}:0`, sdpMid: '0', sdpMLineIndex: 0 });
    return { type: 'offer', sdp: encodeSdp(this.id) };
  }

  async acceptOffer(offer: SessionDescription): Promise<SessionDescription> {
    this.assertOpen('acceptOffer');
    if (offer.type !== 'offer') throw new Error('acceptOffer: not an offer');
    const remote = this.provider.lookup(decodeSdp(offer.sdp));
    remote.pendingAnswerFrom = this.id;
    this.ice.emit({ candidate: `mock-ice:${this.id}:0`, sdpMid: '0', sdpMLineIndex: 0 });
    return { type: 'answer', sdp: encodeSdp(this.id) };
  }

  async acceptAnswer(answer: SessionDescription): Promise<void> {
    this.assertOpen('acceptAnswer');
    if (answer.type !== 'answer') throw new Error('acceptAnswer: not an answer');
    const remote = this.provider.lookup(decodeSdp(answer.sdp));
    if (remote.pendingAnswerFrom !== undefined && remote.pendingAnswerFrom !== this.id) {
      // The answering peer answered a different offer; ignore.
    }
    this.provider.link(this, remote);
  }

  async addIce(candidate: IceCandidateInit): Promise<void> {
    if (this.connectionState === 'closed') return;
    this.remoteCandidates.push(candidate);
  }

  onIce(cb: (candidate: IceCandidateInit) => void): () => void {
    return this.ice.on(cb);
  }

  onTrack(cb: (stream: MediaStreamHandle) => void): () => void {
    return this.track.on(cb);
  }

  onConnectionStateChange(cb: (state: PeerConnectionState) => void): () => void {
    return this.state.on(cb);
  }

  close(): void {
    if (this.connectionState === 'closed') return;
    const other = this.linkedTo;
    this.linkedTo = null;
    if (other && other.linkedTo === this) other.linkedTo = null;
    this.setState('closed');
    // The far side of a closed connection eventually observes a disconnect —
    // asynchronously, as in real WebRTC (a `bye` handled in the same tick
    // must win the race, exactly like production).
    if (other) {
      queueMicrotask(() => {
        if (other.connectionState !== 'closed') other.setState('disconnected');
      });
    }
  }

  /** Test hook: force a connection-state transition on this handle only. */
  simulateConnectionState(state: PeerConnectionState): void {
    this.setState(state);
  }

  /** Test hook: deliver a remote stream. */
  emitTrack(stream: MediaStreamHandle): void {
    this.track.emit(stream);
  }

  /** @internal */
  setState(state: PeerConnectionState): void {
    if (this.connectionState === 'closed') return;
    this.connectionState = state;
    this.state.emit(state);
  }

  /** @internal set on the offering handle while its answer is in flight */
  pendingAnswerFrom?: string;

  private assertOpen(op: string): void {
    if (this.connectionState === 'closed') {
      throw new Error(`MockPeerHandle(${this.id}): ${op} after close`);
    }
  }
}

export class MockRTCProvider implements RTCProvider {
  readonly peers: MockPeerHandle[] = [];
  private counter = 0;
  private streamCounter = 0;
  private readonly registry = new Map<string, MockPeerHandle>();

  createPeer(opts: CreatePeerOptions = {}): MockPeerHandle {
    const id = `peer-${this.counter++}`;
    const handle = new MockPeerHandle(this, id, opts.direction ?? 'sendrecv');
    this.registry.set(id, handle);
    this.peers.push(handle);
    return handle;
  }

  async getLocalStream(): Promise<MediaStreamHandle> {
    const id = `mock-stream-${this.streamCounter++}`;
    return { id, url: `mock://${id}` };
  }

  /** Break the media link of a connected pair, as a WiFi drop would. */
  severPair(handle: MockPeerHandle): void {
    const other = handle.linkedTo;
    handle.linkedTo = null;
    handle.setState('disconnected');
    if (other) {
      if (other.linkedTo === handle) other.linkedTo = null;
      other.setState('disconnected');
    }
  }

  /** @internal */
  lookup(id: string): MockPeerHandle {
    const handle = this.registry.get(id);
    if (!handle) throw new Error(`MockRTCProvider: unknown peer "${id}"`);
    return handle;
  }

  /** @internal complete a link: emit states + tracks per media direction. */
  link(offerer: MockPeerHandle, answerer: MockPeerHandle): void {
    offerer.linkedTo = answerer;
    answerer.linkedTo = offerer;
    delete offerer.pendingAnswerFrom;

    const offererSends = offerer.direction !== 'recvonly' && offerer.localStream !== null;
    const answererSends =
      offerer.direction === 'sendrecv' &&
      answerer.direction !== 'recvonly' &&
      answerer.localStream !== null;

    offerer.setState('connecting');
    answerer.setState('connecting');
    offerer.setState('connected');
    answerer.setState('connected');

    if (offererSends && offerer.localStream) answerer.emitTrack(offerer.localStream);
    if (answererSends && answerer.localStream) offerer.emitTrack(answerer.localStream);
  }
}
