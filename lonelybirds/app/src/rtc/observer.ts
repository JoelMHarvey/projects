/**
 * Owner-app integration glue: adapts SessionController's observer mode to
 * the minimal handle shape the owner screens consume
 * (`app/src/api/sessionController.ts` declares it structurally — no import,
 * so the two packages stay decoupled; structural typing keeps them
 * compatible).
 *
 * Dependencies (provider + realtime client) are injected so this module
 * stays importable under plain Node; the app root supplies NativeRTCProvider
 * and the shared supabase client.
 */

import { observerSender } from '../core/signalling';
import type { MediaStreamHandle, RTCProvider } from './provider';
import { SessionController } from './SessionController';
import { SupabaseSignallingChannel, type RealtimeClientLike } from './signallingChannel';

export interface ObserverHandle {
  join(): Promise<void>;
  leave(): Promise<void>;
  onRemoteStream(listener: (stream: unknown) => void): void;
  onStateChange(listener: (state: string) => void): void;
}

export interface ObserverFactoryDeps {
  provider: RTCProvider;
  realtimeClient: RealtimeClientLike;
}

/**
 * Build the factory the owner app root injects into SessionScreen:
 * `(opts: {sessionId, ownerId}) => handle`. The observer joins recv-only
 * (sends `hello`; terminal_a answers with a sendonly offer) and never
 * publishes media. `leave()` sends an observer bye, which terminal_a treats
 * as "drop this observer's peer" — the pets' session continues.
 */
export function createObserverControllerFactory(deps: ObserverFactoryDeps) {
  return (opts: { sessionId: string; ownerId: string }): ObserverHandle => {
    const streamListeners: Array<(stream: unknown) => void> = [];
    const stateListeners: Array<(state: string) => void> = [];
    const controller = new SessionController({
      role: observerSender(opts.ownerId),
      provider: deps.provider,
      channel: new SupabaseSignallingChannel(deps.realtimeClient, opts.sessionId),
      onRemoteStream: (stream: MediaStreamHandle) => {
        for (const listener of [...streamListeners]) listener(stream);
      },
      onStateChange: (state) => {
        for (const listener of [...stateListeners]) listener(state.status);
      },
    });
    return {
      join: () => controller.start(),
      // 'owner_ended' here only ends the OBSERVER leg: byes from an
      // `observer:{id}` sender never end the terminals' session.
      leave: () => controller.end('owner_ended'),
      onRemoteStream: (listener) => {
        streamListeners.push(listener);
      },
      onStateChange: (listener) => {
        stateListeners.push(listener);
      },
    };
  };
}
