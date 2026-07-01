/**
 * Signalling protocol types for the Supabase Realtime broadcast channel
 * `session:{session_id}`. Pure types + helpers, shared conceptually with
 * `app/src/core/signalling.ts` (this file is the re-declared copy — no
 * cross-package imports; keep in sync by copying).
 *
 * terminal_a = terminal of the pet with the lexically smaller pet id, and is
 * the IMPOLITE peer (creates the offer). terminal_b is the polite peer
 * (perfect negotiation). Observers are recv-only owners: they send `hello`
 * and terminal_a answers with a sendonly offer; observers never publish media.
 */

export const SIGNAL_PROTOCOL_VERSION = 1 as const;

/**
 * Realtime broadcast EVENT name for signalling envelopes on the
 * `session:{session_id}` channel. Must match the app's subscription
 * (`SIGNAL_EVENT` in app/src/rtc/signallingChannel.ts) — clients filter
 * broadcasts by event name, so a server-sent `bye` with any other event name
 * is silently dropped.
 */
export const SIGNAL_EVENT = 'signal';

/**
 * Realtime broadcast EVENT name for "session starting" pushes on the
 * `terminal:{device_id}` channel (the terminal's realtime fallback until real
 * APNs delivery lands). Must match `subscribeToSessionStart` in
 * app/src/terminal/terminalApi.ts.
 */
export const SESSION_START_EVENT = 'session-start';

/** Realtime broadcast channel a paired terminal listens on for pushes. */
export function terminalChannelName(deviceId: string): string {
  return `terminal:${deviceId}`;
}

export type SignalType = 'hello' | 'offer' | 'answer' | 'ice' | 'bye';

export type TerminalRole = 'terminal_a' | 'terminal_b';

export type SignalSender = TerminalRole | `observer:${string}`;

export interface SignalMessage {
  v: typeof SIGNAL_PROTOCOL_VERSION;
  type: SignalType;
  from: SignalSender;
  payload: unknown;
}

const SIGNAL_TYPES: readonly SignalType[] = ['hello', 'offer', 'answer', 'ice', 'bye'];

/** Realtime broadcast channel name for a session. */
export function sessionChannelName(sessionId: string): string {
  return `session:${sessionId}`;
}

/** `from` value for an owner joining a session as a silent observer. */
export function observerSender(ownerId: string): SignalSender {
  return `observer:${ownerId}`;
}

/**
 * Which terminal role this pet's device plays in a session with `partnerPetId`.
 * The lexically smaller pet id is terminal_a (the impolite, offering peer).
 */
export function whoAmI(petId: string, partnerPetId: string): TerminalRole {
  if (petId === partnerPetId) {
    throw new Error('petId and partnerPetId must differ');
  }
  return petId < partnerPetId ? 'terminal_a' : 'terminal_b';
}

export function makeSignalMessage(
  type: SignalType,
  from: SignalSender,
  payload: unknown = null,
): SignalMessage {
  return { v: SIGNAL_PROTOCOL_VERSION, type, from, payload };
}

function isSignalSender(value: unknown): value is SignalSender {
  if (typeof value !== 'string') return false;
  return (
    value === 'terminal_a' ||
    value === 'terminal_b' ||
    (value.startsWith('observer:') && value.length > 'observer:'.length)
  );
}

/**
 * Runtime validation for messages received off the wire. Accepts any payload
 * (including undefined) but requires v === 1, a known type, and a well-formed
 * sender.
 */
export function isSignalMessage(value: unknown): value is SignalMessage {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  return (
    m['v'] === SIGNAL_PROTOCOL_VERSION &&
    typeof m['type'] === 'string' &&
    (SIGNAL_TYPES as readonly string[]).includes(m['type']) &&
    isSignalSender(m['from'])
  );
}
