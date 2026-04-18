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
docker run -d --name osops \
  -p 3000:3000 \
  -v osops-data:/data \
  -e OSOPS_MASTER_KEY=$(cat .master-key) \
  -e OSOPS_BASE_URL=https://ops.mycompany.com \
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
OSOPS_TEST_PORT=3100 OSOPS_BASE_URL=http://localhost:3100 PORT=3100 npm run dev &
npm run test:e2e
```

## Configuration

| Env var | Required | Description |
|---|---|---|
| `OSOPS_MASTER_KEY` | prod-only | 32 raw bytes as hex (64 chars) or base64. Encrypts private keys at rest. Generate: `openssl rand -hex 32`. |
| `OSOPS_BASE_URL` | recommended | External URL of this server. Used in OAuth `verification_uri`. Defaults to `http://localhost:3000`. |
| `DATABASE_URL` | no | `file:./data/osops.db` by default. Postgres URL supported (phase 2). |
| `OSOPS_GITHUB_CLIENT_ID` | optional | GitHub OAuth app client id. Enables "sign in with github" on the panel. Callback: `<OSOPS_BASE_URL>/login/github/callback`. |
| `OSOPS_GITHUB_CLIENT_SECRET` | with above | GitHub OAuth app client secret. |

## Architecture

Single Next.js process. SQLite by default (one file, one volume, one backup). Private keys are wrapped with AES-256-GCM under a server master key — rotate the key by deploying a new `OSOPS_MASTER_KEY` and re-encrypting rows; old key id stays in the ciphertext prefix until the last row migrates.

## License

MIT. See `LICENSE`.

This project is not affiliated with, endorsed by, or sponsored by DOTENVX LLC. It is a clean-room reimplementation of the open wire protocol of the commercial `dotenvx-ops` CLI.
