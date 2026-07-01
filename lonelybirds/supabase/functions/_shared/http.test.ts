import { describe, expect, it } from 'vitest';
import {
  CORS_HEADERS,
  bearerToken,
  errorResponse,
  jsonResponse,
  methodNotAllowed,
  preflightResponse,
} from './http.ts';

describe('jsonResponse', () => {
  it('serialises the body with JSON + CORS headers', async () => {
    const res = jsonResponse(201, { session_id: 's1' });
    expect(res.status).toBe(201);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    for (const [k, v] of Object.entries(CORS_HEADERS)) {
      expect(res.headers.get(k)).toBe(v);
    }
    expect(await res.json()).toEqual({ session_id: 's1' });
  });
});

describe('errorResponse / methodNotAllowed', () => {
  it('wraps the error string', async () => {
    const res = errorResponse(403, 'forbidden');
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
  });

  it('methodNotAllowed is a 405', async () => {
    const res = methodNotAllowed();
    expect(res.status).toBe(405);
    expect(await res.json()).toEqual({ error: 'method_not_allowed' });
  });
});

describe('preflightResponse', () => {
  it('is an empty 204 carrying the CORS headers', () => {
    const res = preflightResponse();
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('OPTIONS');
  });
});

describe('bearerToken', () => {
  it('extracts the token case-insensitively', () => {
    expect(bearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(bearerToken('bearer tok')).toBe('tok');
    expect(bearerToken('  Bearer tok  ')).toBe('tok');
  });

  it('returns null for missing or malformed headers', () => {
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
    expect(bearerToken('')).toBeNull();
    expect(bearerToken('Basic dXNlcg==')).toBeNull();
    expect(bearerToken('Bearer')).toBeNull();
    expect(bearerToken('Bearer ')).toBeNull();
  });
});
