/**
 * WebRTC abstraction per CONTRACTS.md (§ app/src/rtc).
 *
 * `RTCProvider.createPeer(opts)` returns a `PeerHandle` with the contract
 * methods: setLocalStream, createOffer, acceptOffer, acceptAnswer, addIce,
 * onIce/onTrack/onConnectionStateChange, close. Two implementations:
 * `NativeRTCProvider` (react-native-webrtc adapter) and `MockRTCProvider`
 * (in-memory linked pair for tests).
 *
 * All types here are pure TypeScript — importable under plain Node.
 */

/** SDP description exchanged over the signalling channel. */
export interface SessionDescription {
  type: 'offer' | 'answer';
  sdp: string;
}

/** ICE candidate exchanged over the signalling channel. */
export interface IceCandidateInit {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
}

export type PeerConnectionState =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';

/**
 * Media direction of a peer:
 * - 'sendrecv' — terminal ⇄ terminal session peers
 * - 'sendonly' — terminal_a's per-observer peers (observer receives only)
 * - 'recvonly' — observer's own peer (never publishes media)
 */
export type MediaDirection = 'sendrecv' | 'sendonly' | 'recvonly';

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface CreatePeerOptions {
  /** Default 'sendrecv'. */
  direction?: MediaDirection;
  /** STUN/TURN servers. Ignored by the mock. */
  iceServers?: IceServer[];
}

/**
 * Opaque handle around a media stream. `native` is the underlying
 * platform stream (react-native-webrtc MediaStream); the mock leaves it
 * undefined. `url` is what RTCView's `streamURL` prop wants (`toURL()`).
 */
export interface MediaStreamHandle {
  id: string;
  url?: string;
  native?: unknown;
}

/**
 * Video constraints: max 640x480@15fps — old-device thermals, spec §14
 * ("480p is fine — it's for a bird").
 */
export const VIDEO_CONSTRAINTS = {
  width: { ideal: 640, max: 640 },
  height: { ideal: 480, max: 480 },
  frameRate: { ideal: 15, max: 15 },
  facingMode: 'user',
} as const;

export interface PeerHandle {
  /** Attach the local capture stream (no-op for recvonly peers). */
  setLocalStream(stream: MediaStreamHandle): void;
  /** Create an SDP offer (impolite peer / per-observer peers only). */
  createOffer(): Promise<SessionDescription>;
  /** Apply a remote offer and produce the answer. */
  acceptOffer(offer: SessionDescription): Promise<SessionDescription>;
  /** Apply the remote answer to a previously created offer. */
  acceptAnswer(answer: SessionDescription): Promise<void>;
  /** Add a remote ICE candidate. */
  addIce(candidate: IceCandidateInit): Promise<void>;
  /** Local ICE candidates to forward over signalling. Returns unsubscribe. */
  onIce(cb: (candidate: IceCandidateInit) => void): () => void;
  /** Remote media arrived. Returns unsubscribe. */
  onTrack(cb: (stream: MediaStreamHandle) => void): () => void;
  /** Connection state transitions. Returns unsubscribe. */
  onConnectionStateChange(cb: (state: PeerConnectionState) => void): () => void;
  /** Tear the peer down; safe to call twice. */
  close(): void;
}

export interface RTCProvider {
  createPeer(opts?: CreatePeerOptions): PeerHandle;
  /**
   * Acquire the local camera+mic stream (640x480@15fps constraints in the
   * native implementation; a fake handle in the mock).
   */
  getLocalStream(): Promise<MediaStreamHandle>;
}

/** Tiny typed emitter used by both implementations. */
export class Emitter<T> {
  private listeners = new Set<(value: T) => void>();

  on(cb: (value: T) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  emit(value: T): void {
    for (const cb of [...this.listeners]) cb(value);
  }

  clear(): void {
    this.listeners.clear();
  }
}
