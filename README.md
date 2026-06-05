# Agent Relay

[![CI](https://github.com/mmmikael/arelay/actions/workflows/ci.yml/badge.svg)](https://github.com/mmmikael/arelay/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/mmmikael/arelay)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Svelte](https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte&logoColor=white)](https://svelte.dev/)
[![Website](https://img.shields.io/badge/website-arelay.app-blue)](https://arelay.app)

Agent Relay is an open-source, end-to-end encrypted inbox for AI agents.

It gives agents a simple API for delivering files, reports, HTML previews, Markdown notes,
PDFs, images, and other artifacts to a human user. Instead of sending attachments through
email or leaving files scattered across chat threads, each agent delivery becomes a private
inbox message with preview, download, read/unread state, and artifact history.

Agent Relay is designed for people who want ownership of their workflow data. You can
self-host it under the MIT license from [github.com/mmmikael/arelay](https://github.com/mmmikael/arelay),
or use the commercial hosted version at [arelay.app](https://arelay.app) if you do not want to operate
the database, storage, deployment, updates, and backups yourself.

## Why Agent Relay?

- **End-to-end encrypted by design**: encrypted deliveries are decrypted in the browser,
  not on the server.
- **Built for AI agents**: agents authenticate with named API tokens and post sessions
  plus artifacts through a small HTTP API.
- **Passkey-only human login**: no passwords to remember, reset, leak, or store.
- **No social-login dependency**: passkeys use the browser's WebAuthn standard. Agent Relay
  does not require Google Login, Apple Login, Microsoft Login, or any other identity
  provider.
- **Self-hostable**: run it with PostgreSQL and S3-compatible object storage.
- **Hosted option**: use [arelay.app](https://arelay.app) if you prefer a managed service.

## End-to-end encryption

Agent Relay is built around end-to-end encryption for sensitive agent deliveries.

When encryption is set up, the browser creates an encryption key pair. The server stores
the public key and encrypted private-key wraps, but it does not receive the plaintext
private key. Agents can fetch the public key, encrypt message metadata and artifacts
locally, then upload only ciphertext. The web app decrypts the content locally in the
user's browser after the user unlocks their encryption key.

In practice:

- The server stores encrypted titles, summaries, filenames, content types, and file bytes.
- The server can route, store, and serve encrypted objects, but it cannot read encrypted
  delivery content.
- Decryption happens in the browser.
- Agent API tokens are hashed in the database. If encryption is configured, the dashboard
  can also store an encrypted copy of a token so the user can reveal it later after
  unlocking encryption.
- Recovery-key unlock is always available. Passkey PRF unlock is used where browser and
  authenticator support it. If the account passkey cannot provide PRF (for example some
  synced passkeys on Chromium), the app can register a separate encryption passkey.

For sensitive workflows, configure encryption before connecting agents and have agents use
the encrypted upload mode described in [AGENT_INSTRUCTIONS.md](./AGENT_INSTRUCTIONS.md).

## Why passkeys?

Agent Relay uses passkeys for human sign-in instead of passwords.

A passkey is a WebAuthn/FIDO credential based on public-key cryptography. The private key
stays in the user's authenticator, such as a device secure enclave, password manager, or
hardware security key. The server stores only the public key. To sign in, the user unlocks
the passkey locally with a device PIN, biometric prompt, password manager, phone approval,
or security key gesture.

This is a good fit for Agent Relay because:

- There is no password database for attackers to steal.
- There are no password reset flows to secure.
- Passkeys are phishing-resistant because the browser binds credentials to the relying
  party origin.
- Users can choose where their passkeys live: built-in device authenticators, synced
  password managers, or hardware security keys.
- It is not an OAuth/social-login system. Agent Relay does not depend on Google, Apple,
  Microsoft, GitHub, or any other account provider to authenticate users.

Useful passkey resources:

- [What are passkeys? - passkeys.dev](https://passkeys.dev/docs/intro/what-are-passkeys/)
- [Passkeys - MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/Security/Authentication/Passkeys)
- [Passkeys - FIDO Alliance](https://fidoalliance.org/passkeys-2/)
- [Create a passkey for passwordless logins - web.dev](https://web.dev/articles/passkey-registration)

## Hosted version

This repository is open source and self-hostable. A commercial hosted version is also
available at [arelay.app](https://arelay.app) for users who do not want to manage
infrastructure.

The hosted version is intended for convenience: managed deployment, database, object
storage, backups, upgrades, TLS, and operational monitoring. The security model remains
the same: encrypted deliveries are designed so content is decrypted client-side by the
user, not by the hosted service.

## Features

- Mobile-friendly email-style inbox UI
- Full-screen message view on mobile
- Read/unread message state
- Artifact preview and download
- Sandboxed preview for text, Markdown, and HTML (external links and media stripped)
- End-to-end encrypted delivery mode
- Passkey account creation and sign-in
- One passkey per account for sign-in
- Per-account storage limits (25 MB per artifact, 500 MB total) with usage in the account dialog
- Named agent API tokens per account
- Per-token revoke flow for compromised or retired agents
- Email verification before account creation
- PostgreSQL metadata storage
- S3-compatible artifact storage
- Railway-friendly deployment

## Tech stack

- SvelteKit 2
- Svelte 5
- TypeScript
- Tailwind CSS
- PostgreSQL
- S3-compatible object storage
- WebAuthn/passkeys

## Quick start

```bash
npm install
cp .env.example .env
npm run db:setup
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173) and create an account with a passkey. Without Cloudflare or SMTP configured, verification codes are printed to the server console.

The database setup command applies the current clean schema directly. This repository does not keep historical app migrations.

For production:

```bash
npm run build
npm start
```

Run unit tests:

```bash
npm test
```

## Environment variables

| Variable | Description |
| --- | --- |
| `SESSION_SECRET` | Secret for signing human session cookies. Generate with `openssl rand -hex 32`. |
| `SESSION_VERSION` | Bump this to invalidate existing human sessions. |
| `WEBAUTHN_RP_NAME` | Passkey relying party display name. Defaults to `Agent Relay`. |
| `WEBAUTHN_RP_ID` | Passkey relying party ID. For production on arelay.app, use `arelay.app`. |
| `WEBAUTHN_ORIGIN` | Expected passkey origin, for example `https://arelay.app`. |
| `DATABASE_URL` | PostgreSQL connection string. |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID for [Email Sending](https://developers.cloudflare.com/email-service/). Use when your sending domain is on Cloudflare DNS. |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Email Sending permission. |
| `EMAIL_FROM` | Required when Cloudflare or SMTP is configured. Sender address for verification emails, for example `Agent Relay <no-reply@yourdomain.com>`. |
| `SMTP_HOST` | SMTP host for account email verification. Used when Cloudflare Email Sending is not configured. |
| `SMTP_PORT` | SMTP port. Defaults to `587`, or `465` when `SMTP_SECURE=true`. |
| `SMTP_SECURE` | Set to `true` for implicit TLS SMTP. |
| `SMTP_USER` | SMTP username, if your provider requires authentication. |
| `SMTP_PASSWORD` | SMTP password, if your provider requires authentication. |
| `S3_ENDPOINT` | S3-compatible endpoint URL. |
| `S3_BUCKET` | S3 bucket name. |
| `S3_PREFIX` | Object key prefix. Defaults to `agent-relay`. |
| `S3_ACCESS_KEY` | S3 access key. |
| `S3_SECRET_KEY` | S3 secret key. |
| `S3_REGION` | S3 region. Defaults to `us-east-1`. |
| `PORT` | HTTP port for `npm start`. Defaults to `3000`. Railway sets this automatically. |
| `NODE_ENV` | Set to `production` in production so session and WebAuthn cookies use `Secure`. |

When both Cloudflare Email Sending and SMTP are configured, Cloudflare is used.

## Self-hosting notes

Agent Relay needs:

- PostgreSQL
- S3-compatible object storage (see `scripts/iam-agent-relay-s3-policy.json` for a minimal AWS IAM policy scoped to the `agent-relay/` prefix)
- Email delivery for production account verification ([Cloudflare Email Sending](https://developers.cloudflare.com/email-service/) or SMTP)
- A stable HTTPS origin for passkeys in production
- Correct WebAuthn RP settings for that origin

Railway works well:

1. Create a new service from [github.com/mmmikael/arelay](https://github.com/mmmikael/arelay).
2. Add PostgreSQL and link `DATABASE_URL`.
3. Add S3-compatible storage credentials.
4. Set `SESSION_SECRET`.
5. Set `WEBAUTHN_RP_ID` and `WEBAUTHN_ORIGIN` for your domain.
6. Configure email delivery: Cloudflare Email Sending (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `EMAIL_FROM`) or SMTP.
7. Set `NODE_ENV=production`.
8. Use `npm run build` as the build command.
9. Use `npm start` as the start command.

## Agent API

Agents authenticate with account-scoped bearer tokens:

```http
Authorization: Bearer <AGENT_API_TOKEN>
```

Create one named token per agent or integration. If one agent is compromised, revoke only
that token and the other agents keep working.

See [AGENT_INSTRUCTIONS.md](./AGENT_INSTRUCTIONS.md) for the agent-facing API guide,
including encrypted delivery mode and storage limits.

### Create a session

```http
POST /api/agent/sessions
Content-Type: application/json

{
  "title": "Weekly agent report",
  "summary": "Metrics and files for review"
}
```

### Upload a text artifact

```http
POST /api/agent/sessions/<session_id>/artifacts
Content-Type: application/json

{
  "filename": "report.md",
  "content_type": "text/markdown",
  "content": "# Weekly report\n\nAll good."
}
```

### Upload a file artifact

```http
POST /api/agent/sessions/<session_id>/artifacts
Content-Type: multipart/form-data

file=<binary>
filename=optional-name.png
```

## Security model

- Human login uses passkeys and signed session cookies.
- Agent access uses named bearer tokens.
- Agent token hashes are stored in PostgreSQL; plaintext token values are generated in the
  browser and shown to the user.
- Optional encrypted token reveal stores only an E2EE-encrypted copy of the token.
- Encrypted delivery mode uses P-256 ECDH and AES-256-GCM envelopes.
- HTML and Markdown previews render in sandboxed iframes; agent-authored external URLs are
  stripped before display.
- Artifact uploads are capped at 25 MB per file and 500 MB per account.
- Download and preview URLs are short-lived.

Report security issues privately as described in [SECURITY.md](./SECURITY.md).

## License

Agent Relay is released under the [MIT License](./LICENSE).
