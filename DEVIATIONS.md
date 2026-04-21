# Deviations from `dotenvx-ops`

The goal of this project is **wire-protocol** compatibility with the commercial `dotenvx-ops` CLI — point the CLI at your envelops server and everything works. It is **not** a line-for-line clone of the commercial panel's UX. This file tracks places where the behavior intentionally differs from the commercial product, why we made the call, and how to push back if you disagree.

Think of this as an open dialogue. If one of these choices is wrong for your team, open an issue — a per-deployment toggle is reasonable when there's demand.

---

## 1. Private-key visibility is scoped to owners and admins

The panel's Reveal button is gated to owners and admins. Members can no longer click-to-exfiltrate a private key from the browser; every CLI fetch is audit-logged.

> "Under the commercial model, every invited member is one click away from walking off with any private key on the team."

### What `dotenvx-ops` (commercial) does

Any member you invite to a team can see every keypair on the team from the web panel. They click **Reveal** on a private key, copy it out of the browser, and paste it into their local environment (for example `.env.keys`) so that `dotenvx run` can decrypt `.env.vault` / `.env` files.

### What envelops does

- **Panel "reveal" button:** restricted to team **owners** and **admins**. A regular **member** sees no reveal affordance — the button is replaced with a `[locked]` indicator.
- **Public keys in the panel for members:** only the first **5 bytes** (10 hex characters) of each public key are sent to the browser for members. Full public keys are only returned to owners and admins. This is enforced server-side in the panel page — the full material never leaves the server for a member session.
- **CLI (`POST /api/keypair`):** unchanged from the commercial protocol. A member with a valid bearer token who already knows a full public key (typically because they have the project's encrypted `.env` file locally) can fetch the corresponding private key, which is what `dotenvx run` needs to function. Every fetch is audit-logged as `keypair.fetch` with the device id, CLI version, and account.

So the practical guarantees:

- There is **no browser-clickable path** for a regular member to copy a private key onto the clipboard.
- A member **cannot learn a full public key from the panel alone** — the panel surfaces only a prefix. To exfiltrate a key via the CLI endpoint, a member would need the full public key delivered by some other channel (a project file they've been given access to, a ciphertext `.env` shared with them, etc.). For keys tied to environments or projects they were never granted access to, the panel gives them no way to discover the matching public key in the first place.
- The **common case** (`dotenvx run` on a project you have access to) works identically for all roles. The CLI picks up the public key from the project's local files and fetches the private key automatically — no copy/paste, no `.env.keys` on the developer's laptop by default.

### Why

1. **Smaller blast radius on casual exfiltration.** Under the commercial model, every invited member is one click away from walking off with any private key on the team — the panel reveal + clipboard path is entirely self-serve. Our model requires both (a) a bearer token *and* (b) foreknowledge of the full public key, and logs every fetch to a specific device. A member who was accidentally shared a project file can still pull the matching private key; a member who was just added to the team has no way to enumerate keys out of the panel.
2. **Better team CLI ergonomics.** Onboarding a new developer is `dotenvx-ops login` and nothing else. You don't need a side-channel to hand them private keys. Key rotation doesn't require redistributing anything.

### Caveats / edge cases

- This is **defense in depth**, not a hard cryptographic boundary. A malicious member who has been sent a project's ciphertext `.env` (or any other source carrying the full public key) can `curl POST /api/keypair` and obtain the private key. If your threat model needs per-project access control, you'll want per-project RBAC (not yet shipped) — or simply not invite users you don't trust with decryption.
- Owners and admins see full public keys in the panel and retain both the **Reveal** UI and the CLI flow, so manual export and break-glass still work.
- If your workflow depends on every member being able to reveal from the web UI, promote them to admin, or open an issue and we'll discuss a per-team "members can reveal" toggle.

### This may change

This is a deliberate deviation, not a closed decision. If community sentiment lands strongly on matching the commercial default, or if upstream `dotenvx-ops` changes how reveal works in a way that makes this posture awkward, we'll revisit. Happy to be argued out of it.

---

## 2. `dotenvx-ops set` / `get` are first-class with an `envelops://` URI scheme

Commercial `dotenvx-ops` tags `set` and `get` as **`[INTERNAL]`** — present in the binary, not part of the documented surface, and not really meant for end users. Envelops treats them as first-class commands and gives them a URI shape that makes per-team secrets actually usable from the CLI.

> "If the binary already ships the verb and people already reach for it, the right move is to make it work properly — not to pretend it isn't there."

### What `dotenvx-ops` (commercial) does

`dotenvx-ops set` and `dotenvx-ops get` exist but are marked `[INTERNAL]` in `--help` and aren't part of the supported workflow. The intended path is `dotenvx set` (local file) plus `dotenvx-ops sync` / `backup` to push the encrypted file up. Direct server-side key/value storage isn't the headline feature.

### What envelops does

- **`set` and `get` are supported, documented, and surfaced in the panel.** The secrets page shows live `dotenvx-ops set <uri> <value>` / `get <uri>` examples for the team you're viewing.
- **Any non-whitespace string is a valid URI.** `/api/set` and `/api/get` accept bare names (`LASTPASS_PASSWORD`), namespaced names (`stripe/prod/key`), legacy `dotenvx://…` / `rot_…` / `env_…` URIs, and the new `envelops://…` scheme — all uniformly.
- **`envelops://<slug>/<key>` routes to a specific team.** Membership is checked server-side; if the caller isn't a member of that team, the request returns `404 not_found` with no description. That single response covers "the slug doesn't exist," "the slug exists but you aren't a member," and "the slug exists, you're a member, but the key isn't set" — all indistinguishable from the outside, so you can't probe team or key existence by guessing URIs.
- **Bare names route to the caller's personal org.** Same shape as local `dotenvx set`, no ceremony required to start storing things.
- **Lookups are scoped `(org_id, key)`.** Two users can use the same human name (`OPENAI_API_KEY`) in their respective personal orgs without collision; teammates can use the same name across teams.

### Why

1. **The verb is already there and people already reach for it.** Hiding `set` behind `[INTERNAL]` means users either don't discover it or use it without a real contract. Embracing it lets us give them a stable URI scheme, a real access-control story, and audit logs.
2. **Server-side key/value storage is a useful primitive on its own.** Not every secret belongs in a `.env` file synced to a project — sometimes you just want a named, encrypted value that any teammate can pull on demand. Sharing a `LASTPASS_PASSWORD` with the team shouldn't require minting a project first.
3. **`envelops://<slug>/<key>` makes the routing readable.** When a teammate sees `dotenvx-ops get envelops://acme/STRIPE_KEY` in a runbook or a script, the destination is obvious. 
4. **Leak-safe by construction.** Every "I can't give you that" path on `envelops://…` returns the same opaque `404 not_found`. Existence of the team, your membership in it, and existence of the secret all collapse into one response, so probing the URI namespace tells an outsider nothing.

### Caveats / edge cases

- Because we're greenfielding the URI scheme, a future commercial release that defines its own first-class shape for `set` may diverge from `envelops://`. If that happens we'll add support for both rather than break existing scripts. (If possible; else we will alert the community as soon as possible about the change and add a panel side solution to maintain access to the secrets that were created.)
- Cross-org access still requires explicit membership; there is no "share a single secret with one outside account" flow. If you need that, open an issue.
    
### This may change

If upstream `dotenvx-ops` promotes `set` / `get` to a documented surface with its own URI conventions, we'll align where it makes sense — without removing `envelops://` for users who've baked it into their tooling.
