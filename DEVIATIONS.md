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
