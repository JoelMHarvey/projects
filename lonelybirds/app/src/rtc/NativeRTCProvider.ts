/**
 * NativeRTCProvider — RTCProvider adapter over `react-native-webrtc`.
 *
 * The module is ambient-declared in types/deno-shim.d.ts (the native
 * dependency is only present in real app builds), so every export arrives as
 * `unknown` and is cast at this boundary — the ONE place `any`-ish casting is
 * allowed per CONTRACTS.md. Do NOT import this file from vitest tests; it is
 * excluded from the "importable under plain Node" rule.
 *
 * Video is constrained to max 640x480@15fps (VIDEO_CONSTRAINTS) for
 * old-device thermals (spec §14 — "480p is fine, it's for a bird").
 */

import { RTCIceCandidate, RTCPeerConnection, RTCSessionDescription, mediaDevices } from 'react-native-webrtc';
import { resolveIceServers, STUN_SERVERS } from './iceConfig';
import {
  Emitter,
  VIDEO_CONSTRAINTS,
  type CreatePeerOptions,
  type IceCandidateInit,
  type IceServer,
  type MediaDirection,
  type MediaStreamHandle,
  type PeerConnectionState,
  type PeerHandle,
  type RTCProvider,
  type SessionDescription,
} from './provider';

/**
 * Bare STUN list, kept for callers that explicitly want no relay. The
 * provider's DEFAULT is `resolveIceServers()` (./iceConfig), which appends
 * the managed TURN relay from the `__TURN_URL__`/`__TURN_USERNAME__`/
 * `__TURN_CREDENTIAL__` build placeholders (or TURN_* env vars) — the P0
 * "TURN fallback for NAT traversal".
 */
export const DEFAULT_ICE_SERVERS: IceServer[] = STUN_SERVERS;

// --- Minimal structural typings of the react-native-webrtc surface we use ---

interface NativeTrack {
  kind: string;
  stop(): void;
}

interface NativeStream {
  id: string;
  toURL(): string;
  getTracks(): NativeTrack[];
}

interface NativeSessionDescription {
  type: string;
  sdp: string;
}

interface NativeIceCandidate {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

interface NativePeerConnection {
  connectionState: string;
  createOffer(options?: unknown): Promise<NativeSessionDescription>;
  createAnswer(): Promise<NativeSessionDescription>;
  setLocalDescription(desc?: unknown): Promise<void>;
  setRemoteDescription(desc: unknown): Promise<void>;
  addIceCandidate(candidate: unknown): Promise<void>;
  addTrack(track: NativeTrack, stream: NativeStream): unknown;
  addTransceiver(kind: string, init?: { direction?: string }): unknown;
  close(): void;
  onicecandidate: ((event: { candidate: NativeIceCandidate | null }) => void) | null;
  ontrack: ((event: { streams?: NativeStream[] }) => void) | null;
  onconnectionstatechange: (() => void) | null;
}

type PeerConnectionCtor = new (config: {
  iceServers: IceServer[];
}) => NativePeerConnection;

type SessionDescriptionCtor = new (init: { type: string; sdp: string }) => unknown;
type IceCandidateCtor = new (init: IceCandidateInit) => unknown;

const PeerConnection = RTCPeerConnection as PeerConnectionCtor;
const NativeDescription = RTCSessionDescription as SessionDescriptionCtor;
const NativeCandidate = RTCIceCandidate as IceCandidateCtor;
const nativeMediaDevices = mediaDevices as {
  getUserMedia(constraints: unknown): Promise<unknown>;
};

class NativePeerHandle implements PeerHandle {
  private readonly pc: NativePeerConnection;
  private readonly direction: MediaDirection;
  private readonly ice = new Emitter<IceCandidateInit>();
  private readonly track = new Emitter<MediaStreamHandle>();
  private readonly state = new Emitter<PeerConnectionState>();
  private localStream: NativeStream | null = null;
  private tracksAdded = false;
  private closed = false;

  constructor(pc: NativePeerConnection, direction: MediaDirection) {
    this.pc = pc;
    this.direction = direction;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.ice.emit({
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
        });
      }
    };
    pc.ontrack = (event) => {
      const stream = event.streams?.[0];
      if (stream) {
        this.track.emit({ id: stream.id, url: stream.toURL(), native: stream });
      }
    };
    pc.onconnectionstatechange = () => {
      this.state.emit(pc.connectionState as PeerConnectionState);
    };
  }

  setLocalStream(stream: MediaStreamHandle): void {
    if (this.direction === 'recvonly') return; // observers never publish media
    const native = stream.native as NativeStream | undefined;
    if (!native || this.tracksAdded) return;
    this.tracksAdded = true;
    for (const track of native.getTracks()) {
      this.pc.addTrack(track, native);
    }
    this.localStream = native;
  }

  async createOffer(): Promise<SessionDescription> {
    if (this.direction === 'recvonly') {
      this.pc.addTransceiver('audio', { direction: 'recvonly' });
      this.pc.addTransceiver('video', { direction: 'recvonly' });
    }
    const offer = await this.pc.createOffer(
      this.direction === 'sendonly'
        ? { offerToReceiveAudio: false, offerToReceiveVideo: false }
        : undefined,
    );
    await this.pc.setLocalDescription(offer);
    return { type: 'offer', sdp: offer.sdp };
  }

  async acceptOffer(offer: SessionDescription): Promise<SessionDescription> {
    await this.pc.setRemoteDescription(new NativeDescription(offer));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return { type: 'answer', sdp: answer.sdp };
  }

  async acceptAnswer(answer: SessionDescription): Promise<void> {
    await this.pc.setRemoteDescription(new NativeDescription(answer));
  }

  async addIce(candidate: IceCandidateInit): Promise<void> {
    await this.pc.addIceCandidate(new NativeCandidate(candidate));
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
    if (this.closed) return;
    this.closed = true;
    this.pc.onicecandidate = null;
    this.pc.ontrack = null;
    this.pc.onconnectionstatechange = null;
    this.pc.close();
    this.ice.clear();
    this.track.clear();
    this.state.clear();
  }
}

export class NativeRTCProvider implements RTCProvider {
  private readonly iceServers: IceServer[];
  private cachedStream: MediaStreamHandle | null = null;

  constructor(iceServers: IceServer[] = resolveIceServers()) {
    this.iceServers = iceServers;
  }

  createPeer(opts: CreatePeerOptions = {}): PeerHandle {
    const pc = new PeerConnection({
      iceServers: opts.iceServers ?? this.iceServers,
    });
    return new NativePeerHandle(pc, opts.direction ?? 'sendrecv');
  }

  /**
   * Front camera + mic at max 640x480@15fps. The stream is cached so a
   * reconnect's replacement peer reuses the same capture (no camera flap).
   */
  async getLocalStream(): Promise<MediaStreamHandle> {
    if (this.cachedStream) return this.cachedStream;
    const stream = (await nativeMediaDevices.getUserMedia({
      audio: true,
      video: VIDEO_CONSTRAINTS,
    })) as NativeStream;
    this.cachedStream = { id: stream.id, url: stream.toURL(), native: stream };
    return this.cachedStream;
  }

  /** Stop capture (terminal returning to WaitingScreen). */
  releaseLocalStream(): void {
    const native = this.cachedStream?.native as NativeStream | undefined;
    this.cachedStream = null;
    if (native) for (const track of native.getTracks()) track.stop();
  }
}
