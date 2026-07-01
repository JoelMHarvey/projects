/**
 * HTTP helpers shared by the Deno entrypoints: CORS headers, JSON responses,
 * bearer-token extraction. Pure (Request/Response are web-standard globals in
 * both Deno and Node 18+), so this stays inside the tsc/vitest perimeter.
 */

export const CORS_HEADERS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** JSON body + CORS headers. */
export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/** `{error}` JSON body with the given status. */
export function errorResponse(status: number, error: string): Response {
  return jsonResponse(status, { error });
}

/** Reply to a CORS preflight. */
export function preflightResponse(): Response {
  return new Response(null, { status: 204, headers: { ...CORS_HEADERS } });
}

export function methodNotAllowed(): Response {
  return errorResponse(405, 'method_not_allowed');
}

/**
 * Extract the token from an `Authorization: Bearer <token>` header value.
 * Returns null for missing/malformed headers or an empty token.
 */
export function bearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? (match[1] ?? null) : null;
}
