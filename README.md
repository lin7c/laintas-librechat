# laintas-librechat

A ChatGPT-style chat UI that runs on exactly one backend: **Laintas**.

`laintas-librechat` is a Laintas-maintained fork of [LibreChat](https://github.com/danny-avila/LibreChat) (MIT), pinned to upstream v0.8.8 with a small set of patch commits on top. All built-in vendor endpoints (OpenAI, Anthropic, Google, Azure, Bedrock, …) have been stripped at the code-default, served-config and shipped-config layers; the only model endpoint is a Laintas custom endpoint pointing at `https://laintas.com/v1`, with the model list fetched live from that endpoint. Sign-in is Laintas-only, via OpenID Connect against `accounts.laintas.com`.

It is a separate product from Laintas AI (which is independently developed); this one is honestly a fork, and upstream attribution is preserved. See [FORK.md](FORK.md) for the base version, what was removed/added, the full sign-in design, and the maintenance model.

## Status: sign-in needs two Laintas server-side steps

The client side is wired and verified up to the authorization redirect, but **Laintas sign-in does not work end-to-end yet** — two steps remain on the Laintas server side (documented in detail in [FORK.md](FORK.md)):

- **S1** — register this deployment as an OAuth client on `accounts.laintas.com` (issue `client_id`/`client_secret`, redirect URI `https://<chat-host>/oauth/openid/callback`, scopes `openid profile email`). Until then the OpenID values stay empty and the sign-in button stays disabled — by design, not by accident.
- **S2** — teach the Laintas `/v1` facade/gateway to accept the OIDC access token (today it resolves Laintas *session* tokens; an OIDC access token is a different credential).

Until S1+S2 land, treat this as a buildable, deployable codebase — not a working Laintas chat.

## Deploy (Docker)

Releases publish a Docker image to GHCR and a source tarball to the GitHub Release:

```bash
docker pull ghcr.io/lin7c/laintas-librechat:latest   # or a version tag, e.g. :v1.0.0
```

Run it with the upstream deployment setup (MongoDB required; see `docker-compose.yml` and `deploy-compose.yml` in this repo), a `librechat.yaml` (the shipped one defines only the Laintas endpoint), and an `.env` based on `.env.example` with all secrets set (`CREDS_KEY`, `CREDS_IV`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SESSION_SECRET`, `OPENID_SESSION_SECRET`, `DOMAIN_CLIENT`/`DOMAIN_SERVER` — plus `OPENID_CLIENT_ID`/`OPENID_CLIENT_SECRET` after step S1).

Each release also attaches `laintas-librechat-<version>.tar.gz` (source snapshot) and `checksums.txt` to the [GitHub Release](https://github.com/lin7c/laintas-librechat/releases).

## License

MIT, inherited from upstream LibreChat — see [LICENSE](LICENSE). Upstream copyright notices are retained.
