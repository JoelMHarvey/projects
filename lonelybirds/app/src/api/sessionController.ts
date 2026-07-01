/**
 * Minimal view of the rtc SessionController that the OWNER app consumes for
 * the join-as-observer flow. The real implementation lives in `app/src/rtc/`
 * (terminal-app builder). Per CONTRACTS.md the owner app declares only the
 * interface it consumes; the concrete controller is injected at the app root
 * once the rtc layer lands (structural typing keeps the two compatible).
 *
 * Observers are recv-only: they send `hello` on `session:{session_id}` and
 * terminal_a answers with a sendonly offer. Observers never publish media.
 */

export interface ObserverSessionHandle {
  /** Join the signalling channel and start perfect negotiation as observer. */
  join(): Promise<void>;
  /** Leave the session (sends nothing destructive — observers are passive). */
  leave(): Promise<void> | void;
  /** Remote media stream to render; `unknown` at the react-native-webrtc boundary. */
  onRemoteStream(listener: (stream: unknown) => void): void;
  /** Coarse connection state for status text in the UI. */
  onStateChange(listener: (state: string) => void): void;
}

export interface ObserverJoinOptions {
  sessionId: string;
  ownerId: string;
}

/**
 * Factory the app root injects into SessionScreen. Undefined until the rtc
 * layer is wired in — the screen shows a placeholder in that case.
 */
export type ObserverControllerFactory = (
  opts: ObserverJoinOptions,
) => ObserverSessionHandle;
