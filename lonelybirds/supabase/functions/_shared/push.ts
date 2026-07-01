/**
 * Push delivery interface for LonelyBirds edge functions.
 *
 * `sendPush(token, payload)` is the single delivery entrypoint (CONTRACTS.md
 * "Push delivery"). The MVP implementation is a logging stub — it validates
 * the token, logs the delivery intent, and reports success — but every call
 * site in the edge functions is real, so swapping in an APNs provider means
 * changing only `createLoggingPushSender` (or exporting a provider-backed
 * sender with the same `PushSender` shape).
 *
 * Pure module: no Deno globals, no network, injectable logger for tests.
 */

/** Notification content. `data` values ride along for client routing. */
export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushResult {
  ok: boolean;
  /** Machine-readable detail, e.g. 'logged' or 'missing_token'. */
  detail: string;
}

export type PushSender = (token: string, payload: PushPayload) => Promise<PushResult>;

export type PushLogger = (message: string) => void;

/**
 * Owner-directed pushes: the schema stores push tokens only on `devices`
 * (terminals). Until owner phones register APNs tokens, owner notifications
 * are addressed with this routing placeholder so call sites stay real and the
 * eventual provider integration can resolve `owner:{owner_id}` to real tokens.
 */
export function ownerPushToken(ownerId: string): string {
  return `owner:${ownerId}`;
}

/**
 * Build a `PushSender` that logs deliveries instead of hitting APNs.
 * Empty/blank tokens fail fast (`ok: false`) without logging a delivery.
 */
export function createLoggingPushSender(log: PushLogger): PushSender {
  return (token: string, payload: PushPayload): Promise<PushResult> => {
    if (typeof token !== 'string' || token.trim() === '') {
      return Promise.resolve({ ok: false, detail: 'missing_token' });
    }
    const data = payload.data ? ` data=${JSON.stringify(payload.data)}` : '';
    log(`[push] to=${token} title=${JSON.stringify(payload.title)} body=${JSON.stringify(payload.body)}${data}`);
    return Promise.resolve({ ok: true, detail: 'logged' });
  };
}

/** Default sender used by the edge functions (logs to console). */
export const sendPush: PushSender = createLoggingPushSender((message) => {
  // eslint-disable-next-line no-console
  console.log(message);
});
