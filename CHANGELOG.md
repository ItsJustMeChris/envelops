## envelops v0.1.1

A second pass that tightens the access-control story, drops a piece of scope I
shouldn't have shipped in 0.1.0, and gives the panel a friendlier on-ramp into
the CLI. Wire-protocol still drop-in compatible with `dotenvx-ops`; the only
behavioral change a CLI sees is that some prior 403s are now 404s.

### Highlights

- **New `envelops://<slug>/<key>` URI scheme for per-org secrets.** Any string
  is now a valid `dotenvx-ops set/get` target. Bare names (`LASTPASS_PASSWORD`)
  route to the caller's personal org; `envelops://<slug>/<key>` routes to that
  team if the caller is a member, otherwise `404 not_found` — we don't reveal
  whether the team or the key exists. Namespaced keys (`stripe/prod/key`) are
  preserved verbatim. See `DEVIATIONS.md` §2 for the rationale.
- **404-leak-safe across the board.** `/api/set`, `/get`, `/keypair`, `/sync`,
  `/backup`, `/rotate`, `/rotate/connect`, `/panel/reveal`, and
  `/synchronization` now return `404 not_found` instead of `403 forbidden` (or
  `403 device_mismatch`) whenever the caller lacks access. We never echo
  whether the underlying org/project/secret exists. CLIs that keyed on the old
  status codes will need to treat 404 the same way.
- **Audit log gated to admin/owner.** Plain members no longer see the audit
  page or its nav link. Public keys inside audit payloads are run through a
  new `roleBasedPublicKey` guard so even an accidentally-leaked render
  truncates to the first 5 bytes for non-admins.
- **Removed the standalone CLI shim** (`packages/cli-shim/`). It was research
  leftover from before the protocol-compat work landed; shipping it as a
  competing client to `dotenvx-ops` doesn't serve anyone. Use the real
  `dotenvx-ops` CLI against your envelops instance.
- **No more auto-created `default` project.** Callers that arrive without a
  `dotenvxProjectId` and without a cwd name now get a hard error instead of
  silently writing into a team-wide "default" bucket. Real CLI paths always
  supply one of those; the fallback was a footgun for manual API use.
- **Panel UX**: secrets and projects pages now show CLI examples in a framed
  terminal component, with the right URI shape for the team you're viewing
  (bare key in personal orgs, `envelops://<slug>/<key>` in shared teams). The
  projects page also previews the `dotenvx-ops backup` org-picker so you know
  which entry to pick.

### Behavior changes worth flagging

- `403 device_mismatch` is gone. Mismatched device public keys return
  `404 not_found` like every other access failure.
- `/api/set` no longer accepts `dotenvx_project_id` or `org` body fields. The
  URI alone determines routing. These weren't actually sent by the client and were
  more or less irrelevant / wishful thinking. 
- `/api/synchronization` returns `{ synced: false }` instead of `403` when the
  caller can't access the project — same leak-safety rationale.
- README no longer claims master-key rotation works by redeploy. It doesn't —
  proper rotation needs design work and is tracked for a future release.

### Image

```sh
docker pull ghcr.io/itsjustmechris/envelops:0.1.1
```

---

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
