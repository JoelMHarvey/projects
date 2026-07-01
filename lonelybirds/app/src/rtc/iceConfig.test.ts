import { afterEach, describe, expect, it } from 'vitest';
import {
  isTurnConfigured,
  resolveIceServers,
  resolveTurnConfig,
  STUN_SERVERS,
  TURN_CREDENTIAL_PLACEHOLDER,
  TURN_URL_PLACEHOLDER,
  TURN_USERNAME_PLACEHOLDER,
} from './iceConfig';

afterEach(() => {
  delete process.env['TURN_URL'];
  delete process.env['TURN_USERNAME'];
  delete process.env['TURN_CREDENTIAL'];
});

describe('resolveTurnConfig / isTurnConfigured', () => {
  it('falls back to the build-time placeholders and reports unconfigured', () => {
    const config = resolveTurnConfig();
    expect(config).toEqual({
      url: TURN_URL_PLACEHOLDER,
      username: TURN_USERNAME_PLACEHOLDER,
      credential: TURN_CREDENTIAL_PLACEHOLDER,
    });
    expect(isTurnConfigured(config)).toBe(false);
  });

  it('env vars win over the placeholders', () => {
    process.env['TURN_URL'] = 'turn:relay.example.com:3478';
    expect(resolveTurnConfig().url).toBe('turn:relay.example.com:3478');
    expect(isTurnConfigured()).toBe(true);
  });
});

describe('resolveIceServers', () => {
  it('is STUN-only while TURN is unconfigured (graceful degradation)', () => {
    expect(resolveIceServers()).toEqual(STUN_SERVERS);
  });

  it('appends the TURN relay with credentials when configured', () => {
    expect(
      resolveIceServers({
        url: 'turn:relay.example.com:3478',
        username: 'bird',
        credential: 'seed',
      }),
    ).toEqual([
      ...STUN_SERVERS,
      { urls: 'turn:relay.example.com:3478', username: 'bird', credential: 'seed' },
    ]);
  });

  it('omits placeholder/blank username and credential', () => {
    const servers = resolveIceServers({
      url: 'turn:relay.example.com:3478',
      username: TURN_USERNAME_PLACEHOLDER,
      credential: '',
    });
    expect(servers).toHaveLength(STUN_SERVERS.length + 1);
    expect(servers[servers.length - 1]).toEqual({ urls: 'turn:relay.example.com:3478' });
  });
});
