## envelops v0.1.0

First tagged release (yippeeeee). Self-hosted, open-source alternative to the `dotenvx ops`
panel — run it on your own infrastructure and keep your team's private keys off
someone else's server. MIT.

Wire-protocol compatible with the commercial `dotenvx-ops` CLI: point
`DOTENVX_OPS_HOSTNAME` at your envelops instance and everything just works.

### Highlights
- **Drop-in CLI compatibility** — no patched `dotenvx-ops`, no forked client.
- **One container, one volume, one backup** — Next.js + SQLite + a single
  AES-256-GCM master key wraps every stored private key.
- **Sign in with GitHub** for the panel; magic-link email via Mailgun (US/EU)
  when configured, otherwise login links go to stdout.
- **Security defaults on by default** — CSRF, strict security headers, body
  size caps, per-IP rate limits (honors `X-Forwarded-For` only when
  `ENVELOPS_TRUST_PROXY=1`), no plaintext secret logging. Refuses to boot
  without `ENVELOPS_MASTER_KEY` unless `ENVELOPS_DEV_MODE=1`.
- **Multi-arch images** for `linux/amd64` and `linux/arm64`.

### Install

```sh
docker pull ghcr.io/itsjustmechris/envelops:0.1.0

See the README quickstart for the full docker run command and required env
vars.

Not in this release

Automated rotation connectors (manual rotation works today), SAML/OIDC-generic
SSO (GitHub OAuth covers the common case), per-project RBAC. See
DEVIATIONS.md for intentional UX differences from the commercial panel — wire
protocol is unchanged.](envelops://ItsJustMeChris/LASTPASS_PASSWORD)
