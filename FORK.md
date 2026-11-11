# laintas-librechat — fork notes

`laintas-librechat` is a fork of [LibreChat](https://github.com/danny-avila/LibreChat)
(MIT, see `LICENSE`) maintained by Laintas. It is a pure chat client (a
ChatGPT-style web app: React client + Node API + MongoDB) whose only model
backend is the Laintas API and whose only sign-in method is a Laintas
account. It is **not** the owner's independently developed "Laintas AI"
product, and must never be presented as such; it is LibreChat, rebranded
and restricted, with upstream attribution preserved.

- **Base version:** LibreChat `v0.8.8` (tag commit `e8f3be0`), the latest
  stable release at fork time (2026-11-11). `v0.8.9` existed only as an RC.
- **Working product name:** `laintas-librechat`. The final display name is
  pending owner confirmation; the string is centralized (see "Rebrand
  surfaces") so renaming later is a small change.
- **Maintenance model:** pinned upstream tag + the fork commits on branch
  `laintas` (listed below). To update: fetch the new upstream tag, rebase
  or cherry-pick the fork commits onto it, re-run the smoke checks in
  "Verification". The fork patch surface is deliberately small and
  concentrated in config assembly, shipped configuration, and branding,
  so rebases stay cheap. Never push anything to the upstream remote.

## Fork commits (on branch `laintas`, over `v0.8.8`)

| Commit | Subject |
| --- | --- |
| `afc9623` | feat(fork): permanently disable built-in vendor endpoints |
| `c2867a9` | feat(fork): ship Laintas-only endpoint and sign-in configuration |
| `5aa9975` | feat(fork): rebrand visible surfaces to laintas-librechat |
| `d04f2f5` | feat(fork): rebrand PWA manifest name and theme color |
| `859c8f3` | test(fork): assert vendor endpoints are dropped from merged config |
| `188e940` | fix(fork): seed Laintas endpoint models.default (schema requires min 1) |
| `8ac1dce` | fix(fork): ALLOW_SOCIAL_LOGIN=true in shipped env (gates OpenID strategy) |
| _(this file's commit)_ | docs(fork): FORK.md |

## What was removed or disabled

The goal: the only model endpoint is a custom OpenAI-compatible endpoint
named **Laintas** at `https://laintas.com/v1`, and the only sign-in is a
Laintas account. Enforcement is layered:

1. **Endpoint assembly choke point (code).**
   `packages/data-provider/src/parsers.ts` — `getEnabledEndpoints()` no
   longer enables any built-in vendor endpoint and filters vendor names
   out of the `ENDPOINTS` env var, so no env var or API key can resurrect
   them. Only `agents` (not a vendor; it runs on remaining model
   endpoints) and `custom` remain.
2. **Merged-config filter (code).**
   `packages/api/src/endpoints/config/endpoints.ts` — after the default
   and custom endpoint configs are merged, every entry that did not come
   from the custom endpoint definitions is deleted. The client can only
   ever see custom endpoints (here: Laintas) plus `agents`.
3. **Shipped configuration.**
   - `librechat.yaml` (force-added; upstream gitignores it as a local
     file, here it is the product config) defines exactly one custom
     endpoint, `Laintas`, with `models.fetch: true` (the model list comes
     from `https://laintas.com/v1/models`) and per-user auth via the
     OpenID token placeholder described below.
   - `.env.example`: `ENDPOINTS=agents,custom`; email login and
     registration off; social login off; vendor API-key assignments
     (OpenAI, Anthropic, Google, Assistants, Azure AI Search, Tavily,
     Flux, Google Search/CSE) and Google/Apple social-login assignments
     are commented out as removed surfaces; the OpenID section is
     preconfigured for the Laintas issuer.
   - `librechat.example.yaml` carries a fork note: it is upstream
     reference only; non-Laintas custom endpoints defined by an operator
     are dropped at runtime by layer 2.

**Deliberately not deleted:** the vendor client code itself
(`packages/api/src/endpoints/{openai,anthropic,google,bedrock}`, the
assistants/Azure wiring, `api/app/clients/*`, etc.) remains in the tree
but is unreachable: it never enters the assembled endpoint config, so it
gets no routes, no model lists, and no UI. Deleting it wholesale would
mean diverging from thousands of shared-type references
(`EModelEndpoint` is used across the monorepo) for no runtime effect,
and would make upstream security updates painful to absorb. If a future
maintainer wants the stronger guarantee, the two choke points above are
where the config is decided.

**Operator boundary (honest note):** this is self-hosted software.
Whoever operates the server can edit configuration; layers 1–2 make the
*product as shipped and as assembled at runtime* Laintas-only, including
against stray env vars and copied upstream example configs. Optional
upstream features that can call third parties when an operator
explicitly configures them (web-search providers, image generation,
speech) are not enabled by the shipped configuration.

## Sign-in design (Laintas accounts)

### What the Laintas side actually exposes (verified 2026-11-11)

`accounts.laintas.com` **is** an OpenID Connect provider (a Better Auth
OAuth/OIDC provider), with discovery at
`https://accounts.laintas.com/api/auth/.well-known/openid-configuration`:

- issuer: `https://accounts.laintas.com/api/auth`
- `authorization_endpoint`: `.../api/auth/oauth2/authorize`
- `token_endpoint`: `.../api/auth/oauth2/token`
- `userinfo_endpoint`: `.../api/auth/oauth2/userinfo`
- `jwks_uri`: `.../api/auth/jwks` (EdDSA)
- `introspection_endpoint` and `revocation_endpoint` are published
- grants: `authorization_code` only; PKCE `S256` supported; client auth
  `client_secret_basic` / `client_secret_post`
- scopes: `openid`, `profile`, `email` (no `offline_access` listed)
- **no dynamic client registration endpoint** — clients are registered
  manually on the Laintas side (server-side step S1 below)

### What LibreChat supports (verified in this codebase)

- Native OpenID Connect login via `OPENID_*` env vars
  (`OPENID_ISSUER`, `OPENID_CLIENT_ID`, `OPENID_CLIENT_SECRET`,
  `OPENID_SESSION_SECRET`, `OPENID_SCOPE`, `OPENID_CALLBACK_URL`,
  `OPENID_BUTTON_LABEL`, `OPENID_AUTO_REDIRECT`, optional PKCE).
- After login, the user's OIDC tokens are stored on the user record and
  refreshed by the server (`OpenIDSessionRefresh` subsystem); when a
  token can no longer be resolved, the request path raises a 401
  re-authentication error instead of silently calling the backend
  unauthenticated.
- **Token passthrough for custom endpoints is a built-in feature:** the
  placeholders `{{LIBRECHAT_OPENID_ACCESS_TOKEN}}` and
  `{{LIBRECHAT_OPENID_ID_TOKEN}}` in a custom endpoint's `headers` are
  resolved per user, per request — for chat calls
  (`packages/api/src/endpoints/openai/initialize.ts`,
  `packages/api/src/endpoints/custom/initialize.ts`) and for `/models`
  fetches (`packages/api/src/endpoints/models.ts`, which also correctly
  skips the shared model cache when user-scoped headers are present).
  Resolution logic: `packages/api/src/utils/oidc.ts`.

### What this fork implements

- `.env.example` ships the OpenID section preconfigured:
  `OPENID_ISSUER=https://accounts.laintas.com/api/auth`,
  `OPENID_SCOPE="openid profile email"`,
  `OPENID_CALLBACK_URL=/oauth/openid/callback`,
  `OPENID_BUTTON_LABEL=Continue with Laintas`,
  `OPENID_AUTO_REDIRECT=true`; email login, registration, and social
  login are off, so the Laintas OpenID button is the only way in.
- `librechat.yaml`'s Laintas endpoint sends
  `Authorization: Bearer {{LIBRECHAT_OPENID_ACCESS_TOKEN}}` on every chat
  request and model fetch, i.e. each user's own Laintas access token.
  The static `apiKey: 'laintas'` in the endpoint definition is only a
  non-empty placeholder required by the endpoint schema; the resolved
  Authorization header is the credential (upstream behaviour: when the
  configured headers supply an Authorization, the apiKey fallback is not
  added — see `packages/api/src/endpoints/models.ts`).

### The remaining server-side steps (not faked, not done here)

- **S1 — Register this deployment as an OAuth client** on
  `accounts.laintas.com` (Laintas auth admin/DB): issue a `client_id` /
  `client_secret` for laintas-librechat with redirect URI
  `https://<chat-host>/oauth/openid/callback` and scopes
  `openid profile email`. Until this exists, `OPENID_CLIENT_ID` /
  `OPENID_CLIENT_SECRET` stay empty and LibreChat (correctly) keeps the
  OpenID button disabled — there is no working login to demo before S1,
  and this fork does not pretend otherwise.
- **S2 — Teach the Laintas `/v1` facade/gateway to accept the OIDC
  access token.** Today the facade accepts `Authorization: Bearer
  <token>`, translates it to `X-Session-Token`, and the gateway resolves
  a Laintas **session** token (the kind minted by web login and by the
  device-code flow used by laintas-opencode/laintas-openclaw). An OIDC
  access token from the OAuth provider is a different credential, and
  there is no evidence the gateway accepts it as a session token today.
  Smallest change: in the facade (`laintas-v1-facade`), when session
  resolution fails for a Bearer token, validate it as an OAuth access
  token via the IdP's introspection endpoint (using a dedicated
  introspection client credential, `client_secret_basic`), map `sub`
  to the Laintas user, and proceed with billing as that user.
  Alternative: add an RFC 8693 token-exchange endpoint on the accounts
  service that swaps an access token for a scoped session token, and
  have the facade call it. Either is a Laintas-backend change of tens of
  lines plus a credential — deliberately **not** attempted from this
  client-side fork.
- **S3 (optional) — Refresh tokens.** The IdP's discovery document
  lists only `openid profile email` scopes; if it does not issue
  refresh tokens, passthrough sessions end when the access token
  expires and LibreChat asks the user to sign in again (handled, see
  above). Enabling `offline_access` on the IdP would make sessions
  silently renewable.

**Interim diagnostic option (not the product UX, not shipped):** the
facade already accepts genuine Laintas *session* tokens as Bearer. A
deployment could temporarily set the endpoint header to a static
session token for a test account to validate the chat path end to end.
Pasting tokens around contradicts the product's "users never see a key"
rule, so this is documented only as a debugging aid for S2 development.

## Rebrand surfaces

Working name `laintas-librechat` (display name pending owner
confirmation):

- `client/index.html` — `<title>` and meta description.
- `client/vite.config.ts` — PWA manifest `name` / `short_name` and
  theme color.
- `client/public/assets/logo.svg` — upstream mark replaced with a plain
  "L" tile placeholder. **The final Laintas logo asset is still to be
  supplied by the owner**; the favicon PNGs (`favicon-16x16.png`,
  `favicon-32x32.png`, `apple-touch-icon-180x180.png`, `icon-192x192.png`,
  `maskable-icon.png`) still carry the upstream mark for the same reason
  (binary assets, replaced when the real logo lands).
- Default app-name strings (used when `APP_TITLE` is unset; shipped
  `.env.example` sets it explicitly): startup-config route
  (`api/server/routes/config.js`), auth emails
  (`api/server/services/AuthService.js`), two-factor issuer
  (`api/server/controllers/TwoFactorController.js`), shared-links
  config (`packages/api/src/shared-links/config.ts`), client title/logo
  fallbacks (`client/src/routes/Layouts/Startup.tsx`,
  `client/src/utils/documentTitle.ts`,
  `client/src/components/Auth/AuthLayout.tsx`).
- English UI strings that named the product (MCP trust note, API-keys
  description, code-environment copy, native-tools label) in
  `client/src/locales/en/translation.json`. Other locales still contain
  upstream product mentions in body copy; they are cosmetic and were
  left untouched.

Internal identifiers are unchanged on purpose: npm package names
(`@librechat/*`, `librechat-data-provider`), env var names, the
`EModelEndpoint` enum, and the upstream `LICENSE` / copyright notices.

## Running it

Prerequisites: Node 20+ (verified with Node 24), a MongoDB to point
`MONGO_URI` at. Meilisearch is optional (`SEARCH=false` in the shipped
env example). Redis is optional (single-instance in-memory defaults).

```bash
cp .env.example .env
# Fill in the secrets (CREDS_KEY/CREDS_IV, JWT_SECRET,
# JWT_REFRESH_SECRET, SESSION_SECRET, OPENID_SESSION_SECRET) and, after
# server-side step S1, OPENID_CLIENT_ID / OPENID_CLIENT_SECRET.
# Set DOMAIN_CLIENT / DOMAIN_SERVER to the public origin.

npm ci
npm run build:packages   # data-provider, data-schemas, api, client package
npm run build:client     # web client into client/dist
npm run backend          # node api/server/index.js, PORT (default 3080)
```

Open `http://localhost:3080` (or `DOMAIN_CLIENT`): you are redirected to
the Laintas sign-in; after S1+S2, chat runs against
`https://laintas.com/v1` with your own account's token and billing.

Upstream's Docker files (`docker-compose.yml`, `deploy-compose.yml`,
`Dockerfile`) are unmodified and can be used the same way with the
fork's `.env` / `librechat.yaml`; the source run above is the path this
fork's verification exercised.

## Verification

Verified on the build VM on 2026-11-11 (Node 24, standalone MongoDB
8.0.14 from `~/workspace/laintas-librechat/tools/`, Meilisearch not
installed and not required for boot):

- Dependencies installed (`npm ci` hit a transient ECONNRESET near the
  end; completed via cache-resumed `npm install`, lockfile restored
  unchanged). `npm run build:packages` and `npm run build:client` both
  succeed.
- Config: the first boot failed schema validation because
  `models.default` is required (min 1) even with `fetch: true` — fixed
  by seeding `gpt-6-luna` (commit `188e940`). The second boot also
  exposed that `ALLOW_SOCIAL_LOGIN` gates registration of ALL OAuth
  strategies, OpenID included — fixed in the shipped `.env.example`
  (commit `8ac1dce`).
- Server boot: `Connected to MongoDB`, `Server listening at
  http://localhost:3080`, `Server readiness checks passing`. Boot log
  shows the parsed `librechat.yaml` containing only the Laintas custom
  endpoint. (One unrelated upstream warning: the `[schedules]`
  subsystem refuses to arm without Redis or
  `SCHEDULES_SINGLE_PROCESS=true`; schedules are not part of this
  fork's scope.)
- `GET /api/config` returns `appTitle: "laintas-librechat"`,
  `openidLoginEnabled: true`, `openidLabel: "Continue with Laintas"`,
  `openidAutoRedirect: true`, `emailLoginEnabled: false`,
  `registrationEnabled: false`, `socialLoginEnabled: false`, and all
  vendor social flags false.
- `GET /` serves `<title>laintas-librechat</title>`;
  `GET /assets/logo.svg` serves the placeholder L tile.
- OIDC wiring: server log shows `OpenID Connect configured
  successfully` after live discovery against
  `https://accounts.laintas.com/api/auth`, and `GET /oauth/openid`
  returns `302` to
  `https://accounts.laintas.com/api/auth/oauth2/authorize` with
  `response_type=code`, `code_challenge_method=S256`,
  `scope=openid profile email`, and the deployment callback URL. The
  smoke test used a dummy client id, so the identity service rejects
  the actual login — that is step S1 above, not a wiring failure.
- Laintas facade: `GET https://laintas.com/v1/models` without auth
  returns `401` ("Missing or invalid Laintas login token"), and with a
  bogus Bearer token returns `401` after the token is forwarded for
  session resolution — confirming both the target and the Bearer
  contract the custom endpoint header uses.
- Tests: `packages/api` endpoints-config spec — 23/23 pass (7 cases
  rewritten to the fork contract, commit `859c8f3`).
  `getEnabledEndpoints()` from the built data-provider returns
  `[agents, custom]` for empty and for vendor-filled `ENDPOINTS`
  values. `npx tsc --noEmit` passes in `packages/api` and
  `packages/data-provider` (needs a raised heap on small VMs:
  `NODE_OPTIONS=--max-old-space-size=4608`).

Not verified (needs a real deployment): the full login round trip
(blocked on S1), a live chat completion billed to a Laintas account
(blocked on S1 + S2), and the login page rendered in a browser (the
client build was verified, and the served HTML/config payloads carry
the branding; no browser pass was made on this VM).
