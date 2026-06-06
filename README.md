# Agent Relay

[![CI](https://github.com/mmmikael/arelay/actions/workflows/ci.yml/badge.svg)](https://github.com/mmmikael/arelay/actions/workflows/ci.yml)
[![CodeQL](https://github.com/mmmikael/arelay/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/mmmikael/arelay/actions/workflows/github-code-scanning/codeql)
[![License: MIT](https://img.shields.io/github/license/mmmikael/arelay)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Svelte](https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte&logoColor=white)](https://svelte.dev/)
[![Website](https://img.shields.io/badge/website-arelay.app-blue)](https://arelay.app)

Agent Relay is an open-source, end-to-end encrypted inbox for AI agents. Agents deliver
files, reports, HTML, Markdown, PDFs, and images through a small HTTP API; you review them
in a private web inbox with preview, download, and read/unread state.

**Two ways to use it:**

- **[arelay.app](https://arelay.app)** — hosted service; sign up and connect your agents
  (no deployment).
- **Self-host** — run this repo on your own infrastructure under the MIT license.

## Contents

### Using [arelay.app](https://arelay.app)

- [Get started](#get-started)
- [Connect your AI agent](#connect-your-ai-agent)
- [Encryption (required)](#encryption-required)
- [Features](#features)

### Self-hosting

- [Development setup](#development-setup)
- [Environment variables](#environment-variables)
- [Deploy to production](#deploy-to-production)
- [Plugins](#plugins)
- [Tech stack](#tech-stack)

### Reference

- [Security model](#security-model)
- [Terms of Service](https://arelay.app/terms) · [Privacy Policy](https://arelay.app/privacy)
- [Contributing](./CONTRIBUTING.md)
- [License](#license)

---

## Using [arelay.app](https://arelay.app)

The hosted service at [arelay.app](https://arelay.app) handles deployment, database,
storage, backups, TLS, and updates. The security model is the same as self-hosting:
encrypted deliveries are decrypted in your browser, not on the server.

### Get started

1. Open **[arelay.app](https://arelay.app)** and create an account with a passkey.
2. Accept the [Terms of Service](https://arelay.app/terms) and
   [Privacy Policy](https://arelay.app/privacy) during signup (required on the hosted
   service).
3. Complete **Set up encryption** on first portal visit (passkey + recovery key).
4. In the portal, open **Account → Agent tokens** and create a named token for each agent
   or integration.
5. Copy the token once — it is shown only at creation time.
6. Your inbox updates automatically when agents send deliveries (refresh every few seconds).

Sign-in uses passkeys (WebAuthn), not passwords or social login. No Google, Apple, or
Microsoft account is required. If terms or privacy are updated later, existing accounts are
prompted to accept the new versions before continuing.

### Connect your AI agent

Install the official [Agent Skills](https://agentskills.io/) from
[mmmikael/arelay-skills](https://github.com/mmmikael/arelay-skills):

```bash
npx skills add mmmikael/arelay-skills --all -g -y
```

Hermes Agent:

```bash
hermes skills tap add mmmikael/arelay-skills
hermes skills install mmmikael/arelay-skills/agent-relay-api
hermes skills install mmmikael/arelay-skills/agent-relay-e2ee
```

| Skill | Use when |
| --- | --- |
| [agent-relay-api](https://github.com/mmmikael/arelay-skills/tree/main/skills/agent-relay-api) | Deliver Markdown, HTML, images, PDFs, and other artifacts |
| [agent-relay-e2ee](https://github.com/mmmikael/arelay-skills/tree/main/skills/agent-relay-e2ee) | Send sensitive content with end-to-end encryption |
| [agent-relay-railway](https://github.com/mmmikael/arelay-skills/tree/main/skills/agent-relay-railway) | Deploy or operate a self-hosted instance on Railway |

Set these on the machine where your agent runs — **never commit tokens**:

| Variable | Value for hosted |
| --- | --- |
| `AGENT_RELAY_URL` | `https://arelay.app` |
| `AGENT_API_TOKEN` | Token from Account → Agent tokens |

Every agent request uses `Authorization: Bearer <AGENT_API_TOKEN>`. Revoke one token if
an agent is compromised; other tokens keep working.

### Encryption (required)

All agent deliveries must be end-to-end encrypted:

1. Complete **Set up encryption** on first portal visit (passkey + recovery key).
2. Unlock encryption when viewing deliveries in the browser.
3. Install the **agent-relay-e2ee** skill so agents encrypt locally before upload.

The server stores only ciphertext. Your browser decrypts titles, filenames, and file
content after you unlock. Agents fetch your public key from `GET /api/agent/e2ee/config`
and upload encrypted sessions and artifacts. Plaintext agent payloads return `400`
(`plaintext_not_allowed`). If encryption is not configured for the account, agent writes
and `GET /api/agent/e2ee/config` return `428` (`e2ee_required`).

### Features

- Mobile-friendly email-style inbox
- Artifact preview and download (text, Markdown, HTML, PDF, images)
- Sandboxed HTML/Markdown preview (external links and media stripped)
- End-to-end encrypted deliveries only
- Passkey sign-in (one passkey per account)
- Named agent API tokens with per-token revoke
- Storage limits: 25 MB per artifact, 500 MB per account

---

## Self-hosting

Run Agent Relay on your own PostgreSQL and S3-compatible storage. Useful when you need full
data residency control or a private deployment.

### Development setup

```bash
npm install
cp .env.example .env
npm run db:setup
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173) and create an account with a passkey.
Without Cloudflare or SMTP configured, verification codes are printed to the server
console.

The database setup command applies the current clean schema directly. This repository does
not keep historical app migrations. Agent content tables default to `encryption_version =
e2ee-v1`; email drafts store encrypted envelope columns only (plaintext draft columns are
dropped on setup).

Run unit tests:

```bash
npm test
```

### Environment variables

| Variable | Description |
| --- | --- |
| `SESSION_SECRET` | Secret for signing human session cookies. Generate with `openssl rand -hex 32`. |
| `SESSION_VERSION` | Bump this to invalidate existing human sessions. |
| `ORIGIN` | Public site URL for CSRF checks and absolute links. In production, set to your canonical URL, for example `https://arelay.app`. |
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
| `EMAIL_REVIEW_RELAY_ENABLED` | Optional plugin. Set to `true` to enable Email Review Relay (off by default). |

When both Cloudflare Email Sending and SMTP are configured, Cloudflare is used.

### Deploy to production

**Requirements:**

- PostgreSQL
- S3-compatible object storage (see `scripts/iam-agent-relay-s3-policy.json` for a minimal
  AWS IAM policy scoped to the `agent-relay/` prefix)
- Email delivery for account verification ([Cloudflare Email Sending](https://developers.cloudflare.com/email-service/) or SMTP)
- A stable HTTPS origin with correct WebAuthn RP settings

**Build and run:**

```bash
npm run build
npm start
```

**Railway** (or use the **agent-relay-railway** skill):

1. Create a new service from [github.com/mmmikael/arelay](https://github.com/mmmikael/arelay).
2. Add PostgreSQL and link `DATABASE_URL`.
3. Add S3-compatible storage credentials.
4. Set `SESSION_SECRET`.
5. Set `WEBAUTHN_RP_ID` and `WEBAUTHN_ORIGIN` for your domain.
6. Configure email delivery: Cloudflare Email Sending (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `EMAIL_FROM`) or SMTP.
7. Set `NODE_ENV=production`.
8. Use `npm run build` as the build command and `npm start` as the start command.

Point agents at your deployment URL: `AGENT_RELAY_URL=https://your-domain.example`.

### Plugins

Optional features ship as plugins so minimal self-hosts stay lean. Enable each plugin with
an environment variable, then run `npm run db:setup` so plugin tables are created.

#### Email Review Relay

Set `EMAIL_REVIEW_RELAY_ENABLED=true` to let agents submit outbound email drafts for human
review before send. When the plugin is disabled, its APIs return `404` and the portal UI
is hidden.

**Account setup (portal):** open **Account** (`/portal/account`) → **Email sending (Cloudflare API)**
and paste your Cloudflare Account ID and API token.
These per-user credentials are encrypted server-side and used only when you approve a draft.
System `CLOUDFLARE_*` env vars remain for signup verification only.

**Agent API:** authenticated agents POST encrypted drafts to `/api/agent/email-drafts`
(`encrypted: true` with envelope fields). Plaintext drafts are rejected.

```json
{
  "encrypted": true,
  "encrypted_to": { "v": 1, "alg": "P-256-ECDH-A256GCM", "...": "..." },
  "encrypted_from_email": { "...": "..." },
  "encrypted_subject": { "...": "..." },
  "encrypted_html": { "...": "..." },
  "idempotency_key": "optional-stable-key"
}
```

The response includes the inbox session and draft (`status: pending`). Poll draft status
with `GET /api/agent/email-drafts/{id}` or `GET /api/agent/sessions/{id}` (includes
`email_draft` when applicable).

**Human review (portal):** open the session, decrypt and preview the HTML, then **Approve**
(sends via your Cloudflare credentials) or **Reject** (no send). Approve sends decrypted
fields in the request body so mail can be sent without storing plaintext server-side.
Approve requires Cloudflare Email Sending to be configured on the account.

### Tech stack

- SvelteKit 2, Svelte 5, TypeScript, Tailwind CSS
- PostgreSQL, S3-compatible object storage
- WebAuthn/passkeys

---

## Security model

- Human login uses passkeys and signed session cookies.
- Agent access uses named bearer tokens; only hashes are stored server-side.
- Agent tokens require E2EE setup; an encrypted copy of each token is stored for reveal in the browser.
- All agent content uses P-256 ECDH and AES-256-GCM envelopes; decryption happens client-side.
- Server preview/download/archive APIs return `e2ee_only`; the portal decrypts via ciphertext endpoints.
- HTML and Markdown previews render in sandboxed iframes; external URLs are stripped.
- Artifact uploads are capped at 25 MB per file and 500 MB per account.
- Download and preview URLs are short-lived.

Report security issues privately as described in [SECURITY.md](./SECURITY.md).

## License

Agent Relay is released under the [MIT License](./LICENSE).
