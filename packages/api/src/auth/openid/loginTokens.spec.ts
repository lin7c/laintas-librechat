import { buildOpenIDLoginTokenArtifacts } from './loginTokens';

const NOW_MS = 1_900_000_000_000;
const FALLBACK_MS = 7 * 24 * 60 * 60 * 1000;

const makeJwt = (payload: Record<string, unknown>) =>
  ['header', Buffer.from(JSON.stringify(payload)).toString('base64'), 'sig'].join('.');

describe('buildOpenIDLoginTokenArtifacts', () => {
  it('returns null without an access token', () => {
    expect(
      buildOpenIDLoginTokenArtifacts({
        tokenset: { id_token: makeJwt({ sub: 's' }) },
        nowMs: NOW_MS,
        fallbackExpiryMs: FALLBACK_MS,
        secureCookie: true,
      }),
    ).toBeNull();
  });

  it('builds the session shape and cookies from expires_in', () => {
    const artifacts = buildOpenIDLoginTokenArtifacts({
      tokenset: { access_token: 'access-1', id_token: 'id-1', expires_in: 3600 },
      nowMs: NOW_MS,
      fallbackExpiryMs: FALLBACK_MS,
      secureCookie: true,
      userId: 'user-1',
      openidSubject: 'sub-1',
      openidIssuer: 'https://issuer.example',
    });

    const expectedAccessExpiry = Math.floor(NOW_MS / 1000) + 3600;
    expect(artifacts?.sessionTokens).toEqual({
      accessToken: 'access-1',
      idToken: 'id-1',
      expiresAt: NOW_MS + FALLBACK_MS,
      lastRefreshedAt: NOW_MS,
      accessTokenExpiresAt: expectedAccessExpiry,
      appUserId: 'user-1',
      openidSubject: 'sub-1',
      openidIssuer: 'https://issuer.example',
    });

    expect(artifacts?.cookies).toHaveLength(2);
    const [accessCookie, idCookie] = artifacts?.cookies ?? [];
    expect(accessCookie.name).toBe('openid_access_token');
    expect(accessCookie.value).toBe('access-1');
    expect(accessCookie.options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
    });
    expect(accessCookie.options.expires.getTime()).toBe(expectedAccessExpiry * 1000);
    expect(idCookie.name).toBe('openid_id_token');
    /** The opaque id token here has no readable exp, so it shares the access cookie's expiry */
    expect(idCookie.options.expires.getTime()).toBe(expectedAccessExpiry * 1000);
  });

  it('accepts a string expires_in and decodes the ID token expiry', () => {
    const idToken = makeJwt({ sub: 'sub-1', exp: 1_900_003_600 });
    const artifacts = buildOpenIDLoginTokenArtifacts({
      tokenset: { access_token: 'access-1', id_token: idToken, expires_in: '3600' },
      nowMs: NOW_MS,
      fallbackExpiryMs: FALLBACK_MS,
      secureCookie: false,
    });
    const idCookie = artifacts?.cookies.find((cookie) => cookie.name === 'openid_id_token');
    expect(idCookie?.options.expires.getTime()).toBe(1_900_003_600 * 1000);
    expect(idCookie?.options.secure).toBe(false);
  });

  it('derives the access expiry from a JWT access token when expires_in is absent', () => {
    const accessToken = makeJwt({ exp: 1_900_007_200 });
    const artifacts = buildOpenIDLoginTokenArtifacts({
      tokenset: { access_token: accessToken },
      nowMs: NOW_MS,
      fallbackExpiryMs: FALLBACK_MS,
      secureCookie: true,
    });
    expect(artifacts?.sessionTokens.accessTokenExpiresAt).toBe(1_900_007_200);
    expect(artifacts?.cookies).toHaveLength(1);
    expect(artifacts?.cookies[0].options.expires.getTime()).toBe(1_900_007_200 * 1000);
  });

  it('uses the fallback horizon for an opaque token with no declared lifetime', () => {
    const artifacts = buildOpenIDLoginTokenArtifacts({
      tokenset: { access_token: 'opaque-access', refresh_token: 'refresh-1' },
      nowMs: NOW_MS,
      fallbackExpiryMs: FALLBACK_MS,
      secureCookie: true,
    });
    expect(artifacts?.sessionTokens.accessTokenExpiresAt).toBeUndefined();
    expect(artifacts?.sessionTokens.refreshToken).toBe('refresh-1');
    expect(artifacts?.cookies[0].options.expires.getTime()).toBe(NOW_MS + FALLBACK_MS);
  });
});
