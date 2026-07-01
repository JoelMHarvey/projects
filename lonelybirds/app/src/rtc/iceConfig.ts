/**
 * ICE server configuration: public STUN plus an optional managed TURN relay
 * (P0: "WebRTC peer-to-peer video/audio ...; TURN fallback for NAT
 * traversal" — symmetric-NAT home networks, spec §14, need the relay).
 *
 * Configuration mirrors app/src/api/client.ts: `__TURN_URL__`,
 * `__TURN_USERNAME__` and `__TURN_CREDENTIAL__` are string-replaced at
 * build/deploy time with the managed provider's values (Twilio NTS /
 * Cloudflare Calls / metered.ca — no self-hosted coturn for MVP, per spec
 * §8), and TURN_URL / TURN_USERNAME / TURN_CREDENTIAL env vars win over the
 * placeholders when a bundler injects `process.env`. While unconfigured the
 * app degrades to STUN-only rather than breaking.
 *
 * Pure module (no react-native imports) so it stays testable under Node;
 * NativeRTCProvider consumes `resolveIceServers()` as its default.
 */

import type { IceServer } from './provider';

export const TURN_URL_PLACEHOLDER = '__TURN_URL__';
export const TURN_USERNAME_PLACEHOLDER = '__TURN_USERNAME__';
export const TURN_CREDENTIAL_PLACEHOLDER = '__TURN_CREDENTIAL__';

/** Always-present STUN entry (server reflexive candidates cost nothing). */
export const STUN_SERVERS: IceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

export interface TurnConfig {
  url: string;
  username: string;
  credential: string;
}

/** Read optional env (React Native has no `process` unless a bundler adds it). */
function envOr(name: string, fallback: string): string {
  const proc = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process;
  const value = proc?.env?.[name];
  return value !== undefined && value !== '' ? value : fallback;
}

export function resolveTurnConfig(): TurnConfig {
  return {
    url: envOr('TURN_URL', TURN_URL_PLACEHOLDER),
    username: envOr('TURN_USERNAME', TURN_USERNAME_PLACEHOLDER),
    credential: envOr('TURN_CREDENTIAL', TURN_CREDENTIAL_PLACEHOLDER),
  };
}

/** False while the URL placeholder has not been substituted/configured. */
export function isTurnConfigured(config: TurnConfig = resolveTurnConfig()): boolean {
  return config.url !== '' && !config.url.startsWith('__');
}

/**
 * The ICE server list every peer connection should use: STUN, plus the TURN
 * relay when configured. Placeholder username/credential are omitted (some
 * TURN deployments authenticate by other means).
 */
export function resolveIceServers(config: TurnConfig = resolveTurnConfig()): IceServer[] {
  if (!isTurnConfigured(config)) return [...STUN_SERVERS];
  const turn: IceServer = { urls: config.url };
  if (config.username !== '' && !config.username.startsWith('__')) {
    turn.username = config.username;
  }
  if (config.credential !== '' && !config.credential.startsWith('__')) {
    turn.credential = config.credential;
  }
  return [...STUN_SERVERS, turn];
}
