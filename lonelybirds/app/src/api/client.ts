/**
 * Supabase client factory for the app (both modes).
 *
 * Configuration uses build-time placeholders: `__SUPABASE_URL__` and
 * `__SUPABASE_ANON_KEY__` are string-replaced at build/deploy time (same
 * convention as landing/index.html). When the bundler injects `process.env`
 * (metro/babel) the SUPABASE_URL / SUPABASE_ANON_KEY env vars win over the
 * placeholders, which keeps local dev configurable without touching source.
 */

import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from '@supabase/supabase-js';

export const SUPABASE_URL_PLACEHOLDER = '__SUPABASE_URL__';
export const SUPABASE_ANON_KEY_PLACEHOLDER = '__SUPABASE_ANON_KEY__';

export interface ClientConfig {
  url: string;
  anonKey: string;
}

/** Read optional env (React Native has no `process` unless a bundler adds it). */
function envOr(name: string, fallback: string): string {
  const proc = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process;
  const value = proc?.env?.[name];
  return value !== undefined && value !== '' ? value : fallback;
}

export function resolveConfig(): ClientConfig {
  return {
    url: envOr('SUPABASE_URL', SUPABASE_URL_PLACEHOLDER),
    anonKey: envOr('SUPABASE_ANON_KEY', SUPABASE_ANON_KEY_PLACEHOLDER),
  };
}

/** False while the placeholders have not been substituted/configured. */
export function isConfigured(config: ClientConfig = resolveConfig()): boolean {
  return !config.url.startsWith('__') && !config.anonKey.startsWith('__');
}

/**
 * Create a Supabase client. Session is kept in memory only (no AsyncStorage
 * dependency in the MVP); the owner signs in again after an app restart.
 */
export function createClient(config: Partial<ClientConfig> = {}): SupabaseClient {
  const resolved = resolveConfig();
  return createSupabaseClient(
    config.url ?? resolved.url,
    config.anonKey ?? resolved.anonKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    },
  );
}

let sharedClient: SupabaseClient | null = null;

/** Lazily-created singleton used by the screens. */
export function getClient(): SupabaseClient {
  if (!sharedClient) sharedClient = createClient();
  return sharedClient;
}

/** Test seam: swap or clear the shared client. */
export function setClient(client: SupabaseClient | null): void {
  sharedClient = client;
}
