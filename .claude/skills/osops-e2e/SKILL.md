---
name: osops-e2e
description: Run a full end-to-end test of envelops against the real commercial `dotenvx` + `dotenvx-ops` binaries. Use when the user asks to verify the full armor flow (dotenvx encrypt → our server as keystore → dotenvx run), validate protocol compatibility end-to-end, or reproduce what the automated `test/armor.test.ts` covers. Also use when the user asks to "prove the server is the keystore" or "make sure `.env.keys` is never written."
---

# End-to-end harness for envelops

This project is a self-hostable drop-in backend for the commercial `dotenvx-ops` CLI. The *real* end-to-end assertion isn't just "our API endpoints return the right shape" — it's "when a user runs `dotenvx encrypt`, the server becomes the keystore, `.env.keys` is never written, and `dotenvx run` round-trips plaintext back." Everything else stops short of that seam.

## The seam that matters

```
dotenvx (OSS, MIT)           <- user runs this, never makes HTTP calls
  └─ subprocess: dotenvx-ops status         <- "on" = armor mode
  └─ subprocess: dotenvx-ops keypair [pub]  <- JSON {public_key, private_key}
                   └─ HTTP: POST /api/keypair to OUR server
```

If `dotenvx-ops status` returns `off`, `dotenvx encrypt` silently falls back to writing `.env.keys` locally. The test must *confirm* `on` before running encrypt, or a passing test can still miss the regression we care about.

## Preconditions (check before running)

1. **Binaries on PATH:** both `dotenvx-ops` (commercial, v0.37.9+) and `dotenvx` (OSS encrypt CLI).
   ```sh
   which dotenvx-ops && which dotenvx || echo MISSING
   ```
2. **Server running** on port 3100 with its migrations applied. Default harness:
   ```sh
   ENVELOPS_BASE_URL=http://localhost:3100 PORT=3100 npm run dev &
   ```
   Wait for `http://127.0.0.1:3100/` to 200 before proceeding.

3. **Vitest harness installed.** `npm install` completed. `npx vitest` resolves.

## The fast path: run the vitest

```sh
ENVELOPS_BASE_URL=http://localhost:3100 PORT=3100 npm run dev &
until curl -sf http://127.0.0.1:3100/ -o /dev/null; do sleep 0.3; done
npx vitest run -c vitest.e2e.config.ts test/armor.test.ts
```

Expected: `1 test passed` in ~3 seconds. That test covers the whole armor flow.

The full protocol-level suite:
```sh
npx vitest run -c vitest.e2e.config.ts
```
Expected: `6 tests passed` across `armor.test.ts`, `integration.test.ts`, `shim.test.ts`, `phase4.test.ts`.

## Running it manually (when vitest isn't enough or you're debugging)

Use a sandboxed `HOME` so the operator's real ops session isn't touched. This is the single biggest reason ad-hoc agent runs fail — setting only `DOTENVX_OPS_HOSTNAME` + `DOTENVX_OPS_TOKEN` env vars is **not** enough because `dotenvx encrypt` invokes `dotenvx-ops status`, which reads the *session file*, not env vars.

```sh
export SANDBOX_HOME=$(mktemp -d -t osops-e2e-XXXXX)

# Step 1: start a device-code login in the sandbox. Capture the user_code.
HOME=$SANDBOX_HOME dotenvx-ops login --hostname http://127.0.0.1:3100 &
LOGIN_PID=$!
# Wait for: "open [...] and enter code [XXXX-XXXX]" on stdout. Parse the 8 hex chars.
```

Step 2: approve the device code. You need an account to approve *as*. Two ways:

**Option A (preferred, no DB poking):** open the `verification_uri_complete` URL in a browser that's already signed in to the panel, click approve. Requires a human.

**Option B (automated):** use our service layer directly from a throwaway Node script:
```ts
import { findOrCreateAccountByEmail } from './lib/services/accounts'
import { approveDeviceCode, findPendingDeviceCodeByUserCode } from './lib/services/oauth'

const account = await findOrCreateAccountByEmail('test@example.com')  // auto-creates personal team
const pending = await findPendingDeviceCodeByUserCode('<8-char code>')
await approveDeviceCode(pending!.id, account.id)
```

Run that script via `npx tsx` in the same process/DB as the server.

Step 3: confirm armor is actually active.
```sh
HOME=$SANDBOX_HOME dotenvx-ops status
# MUST print: on
```
If this prints `off`, the login didn't complete — every downstream assertion is meaningless.

Step 4: the actual armor round-trip.
```sh
PROJECT=$(mktemp -d -t osops-e2e-proj-XXXXX)
echo "HELLO=$(date +%s)-sentinel" > $PROJECT/.env
HOME=$SANDBOX_HOME dotenvx encrypt -f $PROJECT/.env
```

Assertions (all four MUST hold, else armor is NOT working):
- encrypt output contains the phrase `armored key` (not `local key`)
- `$PROJECT/.env.keys` does not exist
- `$PROJECT/.env` contains `HELLO=encrypted:` (not the sentinel plaintext)
- `HOME=$SANDBOX_HOME dotenvx run -f $PROJECT/.env -- sh -c 'echo $HELLO'` prints the original sentinel

Step 5: cleanup.
```sh
kill $LOGIN_PID 2>/dev/null
rm -rf $SANDBOX_HOME $PROJECT
```

## Common pitfalls agents hit

- **Using env vars instead of a completed login.** `DOTENVX_OPS_TOKEN` alone does not enable `status: on`. The session file must be written by a successful `dotenvx-ops login`.
- **Reusing the operator's `$HOME`.** This pollutes their real session and may test against the wrong server. Always use a fresh `mktemp -d` HOME.
- **Approving the device code without a real account.** `approveDeviceCode` needs an `accountId` that has at least one org membership — `findOrCreateAccountByEmail` handles that (creates a personal org on first call).
- **Expecting `dotenvx-ops rotate --new-value`.** The commercial binary has no such flag. Use `dotenvx-ops set <uri> <value>` instead.
- **URI format.** Server regex is `dotenvx://<prefix>_<hex>`. Non-hex suffixes (e.g. `rot_apicheck`) are rejected with 400 by design.
- **Token revocation side effects.** If an earlier test revoked a seeded token, subsequent steps that reuse it will 401. Always mint a fresh token per test.

## Reporting a run

A complete E2E report from an agent should answer:
1. Did `dotenvx-ops status` print `on` in the sandbox? (Yes/no.)
2. After `dotenvx encrypt`, does `.env.keys` exist? (Must be no.)
3. Does `.env` contain ciphertext for the sentinel value? (Must be yes.)
4. Does `dotenvx run` round-trip the original plaintext? (Must be yes.)
5. Any HTTP logs on the server showing `POST /api/keypair` during the encrypt/run steps? (Must be yes — confirms the keystore call happened.)

If all five are yes, the armor flow works end-to-end. Anything else is a regression worth a line-number-specific bug report.

## Related files

- `test/armor.test.ts` — the reference automated implementation of everything above
- `test/integration.test.ts` — ops-only protocol-level tests
- `test/shim.test.ts` — OSS shim parity tests
- `test/phase4.test.ts` — invites + rotations service-level tests
- `lib/services/oauth.ts` — `approveDeviceCode`, `findPendingDeviceCodeByUserCode`
- `lib/services/accounts.ts` — `findOrCreateAccountByEmail`
- `docs/PROTOCOL.md` — wire contract this harness verifies
