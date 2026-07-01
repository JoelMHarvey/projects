/**
 * Server-side Realtime broadcasting for the edge functions.
 *
 * Supabase Realtime exposes an HTTP broadcast endpoint
 * (`{SUPABASE_URL}/realtime/v1/api/broadcast`) that the service role can POST
 * to without holding a websocket. This module builds the request (pure,
 * fetch is injected) so the delivery decisions are vitest-covered while the
 * Deno entrypoints stay thin.
 *
 * Two producers use it:
 * - `bye` envelopes on `session:{session_id}` (end-session, schedule-tick) —
 *   event MUST be `SIGNAL_EVENT` ('signal'), the event name terminals and
 *   observers subscribe to.
 * - SessionStartPush payloads on `terminal:{device_id}` (request-session,
 *   respond-session, schedule-tick) — event `SESSION_START_EVENT`
 *   ('session-start'), payload `{session_id, pet_id, partner_pet_id}` exactly
 *   as app/src/terminal/terminalApi.ts expects.
 *
 * Pure module: no Deno globals, no URL imports.
 */

import { SESSION_START_EVENT, terminalChannelName } from './signalling.ts';

/** One message for the Realtime HTTP broadcast endpoint. */
export interface BroadcastEnvelope {
  topic: string;
  event: string;
  payload: unknown;
}

export interface FetchResponseLike {
  ok: boolean;
  status: number;
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<FetchResponseLike>;

/** The Realtime HTTP broadcast endpoint for a Supabase project. */
export function broadcastEndpoint(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/realtime/v1/api/broadcast`;
}

/**
 * POST a batch of broadcast messages. Never throws — Realtime delivery is
 * best-effort (terminals also poll heartbeats; owners poll session state), so
 * a delivery failure must not fail the calling edge function's DB work.
 */
export async function broadcastMessages(opts: {
  supabaseUrl: string;
  serviceRoleKey: string;
  messages: readonly BroadcastEnvelope[];
  fetchImpl: FetchLike;
  onError?: (detail: string) => void;
}): Promise<boolean> {
  if (opts.messages.length === 0) return true;
  try {
    const res = await opts.fetchImpl(broadcastEndpoint(opts.supabaseUrl), {
      method: 'POST',
      headers: {
        apikey: opts.serviceRoleKey,
        Authorization: `Bearer ${opts.serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages: opts.messages }),
    });
    if (!res.ok) {
      opts.onError?.(`broadcast failed (${res.status})`);
      return false;
    }
    return true;
  } catch (err) {
    opts.onError?.(`broadcast failed: ${String(err)}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// SessionStartPush fan-out to terminals
// ---------------------------------------------------------------------------

/** A `devices` row, reduced to what session-start fan-out needs. */
export interface TerminalDeviceRef {
  deviceId: string;
  petId: string;
}

/**
 * Payload the terminal's `subscribeToSessionStart` validates
 * (SessionStartPush in app/src/terminal/terminalApi.ts). `partner_pet_id` is
 * required for `whoAmI` role selection in TerminalSessionScreen.
 */
export interface SessionStartPushPayload {
  session_id: string;
  pet_id: string;
  partner_pet_id: string;
}

/**
 * One `session-start` broadcast per terminal device of the two pets in the
 * session. Devices bound to neither pet are skipped (defensive: callers query
 * by pet id anyway).
 */
export function terminalSessionStartMessages(
  devices: readonly TerminalDeviceRef[],
  sessionId: string,
  petAId: string,
  petBId: string,
): BroadcastEnvelope[] {
  const messages: BroadcastEnvelope[] = [];
  for (const device of devices) {
    let partnerPetId: string;
    if (device.petId === petAId) partnerPetId = petBId;
    else if (device.petId === petBId) partnerPetId = petAId;
    else continue;
    const payload: SessionStartPushPayload = {
      session_id: sessionId,
      pet_id: device.petId,
      partner_pet_id: partnerPetId,
    };
    messages.push({
      topic: terminalChannelName(device.deviceId),
      event: SESSION_START_EVENT,
      payload,
    });
  }
  return messages;
}
