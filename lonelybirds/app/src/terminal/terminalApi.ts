/**
 * Terminal-side API helpers, built on the shared supabase client from
 * `app/src/api/client.ts` (owner-app builder). The owner-side edge-function
 * wrappers live in `app/src/api/queries.ts`; the two calls only a terminal
 * makes — `pair-device` (anon) and `device-heartbeat` — live here, next to
 * the screens that use them.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getClient } from '../api/client';
import type { RealtimeClientLike } from '../rtc/signallingChannel';

/** The shared client, narrowed to the signalling channel's structural need. */
export function getRealtimeClient(client: SupabaseClient = getClient()): RealtimeClientLike {
  return client as unknown as RealtimeClientLike;
}

async function invokeEdge<T>(
  client: SupabaseClient,
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client.functions.invoke(name, { body });
  if (error) throw new Error(`${name} failed: ${error.message ?? 'unknown error'}`);
  return data as T;
}

// --- pair-device (anon; CONTRACTS.md edge function table) -------------------

export interface PairDeviceResult {
  device_id: string;
  pet_id: string;
  device_jwt?: string;
}

/** Claim a 6-digit pairing code; binds this device as the pet's terminal. */
export function pairDevice(
  code: string,
  deviceName: string,
  client: SupabaseClient = getClient(),
): Promise<PairDeviceResult> {
  return invokeEdge<PairDeviceResult>(client, 'pair-device', {
    code,
    device_name: deviceName,
  });
}

// --- device-heartbeat --------------------------------------------------------

/**
 * Heartbeat cadence. Must stay comfortably under the 90s offline threshold
 * schedule-tick uses to mark devices offline and alert the owner.
 */
export const HEARTBEAT_INTERVAL_MS = 30_000;

export function deviceHeartbeat(
  deviceId: string,
  client: SupabaseClient = getClient(),
  /** Optional APNs token — piggybacked on the heartbeat to register it. */
  pushToken?: string,
): Promise<unknown> {
  const body: Record<string, unknown> = { device_id: deviceId };
  if (pushToken !== undefined) body['push_token'] = pushToken;
  return invokeEdge<unknown>(client, 'device-heartbeat', body);
}

// --- session-start push (realtime fallback until APNs is wired) -------------

export interface SessionStartPush {
  session_id: string;
  pet_id: string;
  partner_pet_id: string;
}

function isSessionStartPush(value: unknown): value is SessionStartPush {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p['session_id'] === 'string' &&
    typeof p['pet_id'] === 'string' &&
    typeof p['partner_pet_id'] === 'string'
  );
}

/**
 * Listen for "session starting" pushes for this terminal.
 *
 * Delivery contract (see CONTRACTS.md "Push delivery"): a Realtime broadcast
 * channel `terminal:{device_id}`, event `session-start`, payload
 * SessionStartPush. `_shared/push.ts` is a logging stub, so request-session,
 * respond-session and schedule-tick all mirror their terminal pushes onto
 * this channel (via `_shared/realtime.ts`) — this is how paired terminals
 * auto-join until real APNs delivery lands. Returns an unsubscribe function.
 */
export function subscribeToSessionStart(
  deviceId: string,
  cb: (push: SessionStartPush) => void,
  client: SupabaseClient = getClient(),
): () => void {
  const channel = client
    .channel(`terminal:${deviceId}`)
    .on('broadcast', { event: 'session-start' }, (message: { payload?: unknown }) => {
      if (isSessionStartPush(message.payload)) cb(message.payload);
    })
    .subscribe();
  return () => {
    void channel.unsubscribe();
  };
}
