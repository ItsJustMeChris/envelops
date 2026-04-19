# envelops

Self-hosted open-source alternative to the [dotenvx Ops](https://dotenvx.com/ops) panel. Run your team's private keys on your own infrastructure. MIT.

Wire-protocol compatible with the commercial `dotenvx-ops` CLI — swap the hostname, everything works.

```sh
DOTENVX_OPS_HOSTNAME=https://ops.mycompany.com dotenvx-ops login
-- or --
dotenvx-ops login --hostname https://ops.mycompany.com
-- or --
'DOTENVX_OPS_HOSTNAME=https://ops.mycompany.com' >> ~/Library/Preferences/dotenvx/.env
```

Not yet shipped: automated rotation connectors (manual rotation works today), SAML/OIDC-generic SSO (GitHub OAuth covers the common case), per-project RBAC.

## Quickstart — Docker

```sh
openssl rand -hex 32 > .master-key
docker run -d --name envelops \
  -p 3000:3000 \
  -v envelops-data:/data \
  -e ENVELOPS_MASTER_KEY=$(cat .master-key) \
  -e ENVELOPS_BASE_URL=https://ops.mycompany.com \
  ghcr.io/<your-fork>/envelops:latest
```

Then:

```sh
DOTENVX_OPS_HOSTNAME=https://ops.mycompany.com dotenvx-ops login
-- or --
dotenvx-ops login --hostname https://ops.mycompany.com
-- or --
'DOTENVX_OPS_HOSTNAME=https://ops.mycompany.com' >> ~/Library/Preferences/dotenvx/.env
```

Follow the displayed URL, sign in with your email (the login link is written to the server logs — wire up SMTP yourself or use the docker logs), then enter the device code. The CLI finishes logging in. `dotenvx-ops keypair` and everything else works normally.

## Quickstart — local dev

```sh
npm install
npx drizzle-kit generate
npm run db:migrate
npm run dev
```

Server boots at `http://localhost:3000`.

Test end-to-end against the real commercial CLI (install `@dotenvx/dotenvx-ops` globally first):

```sh
ENVELOPS_TEST_PORT=3100 ENVELOPS_BASE_URL=http://localhost:3100 PORT=3100 npm run dev &
npm run test:e2e
```

## Configuration

| Env var | Required | Description |
|---|---|---|
| `ENVELOPS_MASTER_KEY` | yes | 32 raw bytes as hex (64 chars) or base64. Encrypts private keys at rest. Generate: `openssl rand -hex 32`. The server refuses to boot without this unless `ENVELOPS_DEV_MODE=1` is set. |
| `ENVELOPS_DEV_MODE` | dev-only | Set to `1` to allow booting without `ENVELOPS_MASTER_KEY` using a constant, insecure dev key. Never set in production. |
| `ENVELOPS_BASE_URL` | recommended | External URL of this server. Used in OAuth `verification_uri`. Defaults to `http://localhost:3000`. |
| `ENVELOPS_TRUST_PROXY` | optional | Set to `1` when running behind a trusted reverse proxy (Caddy, Cloudflare, nginx) that rewrites `X-Forwarded-For` / `X-Real-IP` / `CF-Connecting-IP`. Required for per-IP rate limiting to work. Leave unset when Next.js is exposed directly — otherwise clients can spoof these headers to bypass every rate limit. |
| `DATABASE_URL` | no | `file:./data/envelops.db` by default. Postgres URL supported (phase 2). |
| `ENVELOPS_GITHUB_CLIENT_ID` | optional | GitHub OAuth app client id. Enables "sign in with github" on the panel. Callback: `<ENVELOPS_BASE_URL>/login/github/callback`. |
| `ENVELOPS_GITHUB_CLIENT_SECRET` | with above | GitHub OAuth app client secret. |
| `ENVELOPS_MAILGUN_API_KEY` | optional | Mailgun private API key. If set together with `ENVELOPS_MAILGUN_EMAIL_DOMAIN`, login links are emailed via Mailgun; otherwise email is disabled and links are logged to stdout. |
| `ENVELOPS_MAILGUN_EMAIL_DOMAIN` | with above | Your Mailgun sending domain (bare hostname, e.g. `mg.mycompany.com`). Not a URL — the Mailgun API host is chosen internally from `ENVELOPS_MAILGUN_REGION`. |
| `ENVELOPS_MAILGUN_REGION` | optional | `us` (default) or `eu`. Selects which Mailgun API host (`api.mailgun.net` vs `api.eu.mailgun.net`) to post to. |

## Architecture

Single Next.js process. SQLite by default (one file, one volume, one backup). Private keys are wrapped with AES-256-GCM under a server master key — rotate the key by deploying a new `ENVELOPS_MASTER_KEY` and re-encrypting rows; old key id stays in the ciphertext prefix until the last row migrates.

## License

MIT. See `LICENSE`.

This project is not affiliated with, endorsed by, or sponsored by DOTENVX LLC. It is a clean-room reimplementation of the open wire protocol of the commercial `dotenvx-ops` CLI.
