import { decodeJwtExpirySeconds } from '~/utils/oidc';
import { normalizeExpiresIn } from '~/oauth/expiry';

/** Token endpoint response fields the login bridge consumes. */
export interface OpenIDLoginTokenset {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
  expires_in?: unknown;
}

export interface OpenIDLoginTokenCookie {
  name: 'openid_access_token' | 'openid_id_token';
  value: string;
  options: {
    httpOnly: true;
    secure: boolean;
    sameSite: 'strict';
    expires: Date;
  };
}

/**
 * Express-session token shape (see the SessionOpenIDTokens contract in
 * `./session`); only the fields a fresh login can fill.
 */
export interface OpenIDLoginSessionTokens {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  /** Session-record expiry (ms), not the access token's own expiry. */
  expiresAt: number;
  lastRefreshedAt: number;
  accessTokenExpiresAt?: number;
  appUserId?: string;
  openidSubject?: string;
  tenantId?: string;
  openidIssuer?: string;
}

export interface OpenIDLoginTokenArtifacts {
  sessionTokens: OpenIDLoginSessionTokens;
  cookies: OpenIDLoginTokenCookie[];
}

export interface BuildOpenIDLoginTokenArtifactsParams {
  tokenset: OpenIDLoginTokenset;
  /** Wall-clock milliseconds at login. */
  nowMs: number;
  /**
   * Horizon for the session record and for cookies whose token lifetime
   * is unknown; the caller passes its REFRESH_TOKEN_EXPIRY resolution.
   */
  fallbackExpiryMs: number;
  secureCookie: boolean;
  userId?: string;
  openidSubject?: string;
  tenantId?: string;
  openidIssuer?: string;
}

/**
 * Builds the token stores an OpenID login leaves behind when
 * OPENID_REUSE_TOKENS is off. The reuse publication path
 * (`sendOpenIDAuthResponse` / `setOpenIDAuthTokens`) requires an IdP
 * refresh token end to end — the durable session record is keyed by it
 * and publication throws without one — so a provider that never issues
 * refresh tokens (no `offline_access` grant) cannot use it. The standard
 * login branch then keeps only LibreChat's own JWT and the IdP tokenset
 * is dropped, which leaves `{{LIBRECHAT_OPENID_*}}` header templates
 * unresolvable for the whole session: model fetches for endpoints
 * configured with the user's access token silently fall back to the
 * configured seed list, and chat requests carry no credential.
 *
 * The artifacts mirror the two stores the request path already reads:
 * the express-session token shape, and the `openid_access_token` /
 * `openid_id_token` cookies `setOpenIDAuthTokens` itself sets when no
 * session is available. `requireJwtAuth` rebuilds `user.federatedTokens`
 * from them per request (see `resolveStoredOpenIDTokens`). Nothing here
 * extends the access token's own lifetime: once it expires, resolution
 * fails closed and the user signs in again — the honest limit of a
 * refresh-token-less provider.
 *
 * Returns null when the tokenset carries no access token.
 */
export function buildOpenIDLoginTokenArtifacts(
  params: BuildOpenIDLoginTokenArtifactsParams,
): OpenIDLoginTokenArtifacts | null {
  const { tokenset, nowMs, fallbackExpiryMs, secureCookie } = params;
  if (!tokenset.access_token) {
    return null;
  }

  const expiresInSeconds = normalizeExpiresIn(tokenset.expires_in);
  const accessTokenExpiresAt =
    expiresInSeconds != null
      ? Math.floor(nowMs / 1000) + expiresInSeconds
      : decodeJwtExpirySeconds(tokenset.access_token);
  const accessCookieExpires =
    accessTokenExpiresAt != null
      ? new Date(accessTokenExpiresAt * 1000)
      : new Date(nowMs + fallbackExpiryMs);

  const cookies: OpenIDLoginTokenCookie[] = [
    {
      name: 'openid_access_token',
      value: tokenset.access_token,
      options: {
        httpOnly: true,
        secure: secureCookie,
        sameSite: 'strict',
        expires: accessCookieExpires,
      },
    },
  ];
  if (tokenset.id_token) {
    const idTokenExpiresAt = decodeJwtExpirySeconds(tokenset.id_token);
    cookies.push({
      name: 'openid_id_token',
      value: tokenset.id_token,
      options: {
        httpOnly: true,
        secure: secureCookie,
        sameSite: 'strict',
        expires: idTokenExpiresAt != null ? new Date(idTokenExpiresAt * 1000) : accessCookieExpires,
      },
    });
  }

  const sessionTokens: OpenIDLoginSessionTokens = {
    accessToken: tokenset.access_token,
    ...(tokenset.id_token ? { idToken: tokenset.id_token } : {}),
    ...(tokenset.refresh_token ? { refreshToken: tokenset.refresh_token } : {}),
    expiresAt: nowMs + fallbackExpiryMs,
    lastRefreshedAt: nowMs,
    ...(accessTokenExpiresAt != null ? { accessTokenExpiresAt } : {}),
    ...(params.userId ? { appUserId: params.userId } : {}),
    ...(params.openidSubject ? { openidSubject: params.openidSubject } : {}),
    ...(params.tenantId ? { tenantId: params.tenantId } : {}),
    ...(params.openidIssuer ? { openidIssuer: params.openidIssuer } : {}),
  };

  return { sessionTokens, cookies };
}
