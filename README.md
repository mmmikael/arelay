# Agent Relay

[![CI](https://github.com/mmmikael/arelay/actions/workflows/ci.yml/badge.svg)](https://github.com/mmmikael/arelay/actions/workflows/ci.yml)
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
- [Encryption (optional)](#encryption-optional)
- [Features](#features)

### Self-hosting

- [Development setup](#development-setup)
- [Environment variables](#environment-variables)
- [Deploy to production](#deploy-to-production)
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
3. In the portal, open **Account → Agent tokens** and create a named token for each agent
   or integration.
4. Copy the token once — it is shown only at creation time.
5. Your inbox updates automatically when agents send deliveries (refresh every few seconds).

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

More install options are in the
[arelay-skills README](https://github.com/mmmikael/arelay-skills). Curated listing on
skills.sh is pending merge of
[vercel-labs/agent-skills#284](https://github.com/vercel-labs/agent-skills/pull/284); until
then, install from `mmmikael/arelay-skills` (not `skills.sh/mmmikael/arelay-skills`, which
is not live yet).

Set these on the machine where your agent runs — **never commit tokens**:

| Variable | Value for hosted |
| --- | --- |
| `AGENT_RELAY_URL` | `https://arelay.app` |
| `AGENT_API_TOKEN` | Token from Account → Agent tokens |

Every agent request uses `Authorization: Bearer <AGENT_API_TOKEN>`. Revoke one token if
an agent is compromised; other tokens keep working.

### Encryption (optional)

For sensitive deliveries, set up encryption in the portal before connecting agents:

1. Open **Account → Encryption** and create a recovery key (store it safely).
2. Unlock encryption when viewing encrypted sessions.
3. Install the **agent-relay-e2ee** skill so agents encrypt locally before upload.

The server stores only ciphertext. Your browser decrypts titles, filenames, and file
content after you unlock. Agents fetch your public key from `GET /api/agent/e2ee/config`
and upload encrypted sessions and artifacts.

### Features

- Mobile-friendly email-style inbox
- Artifact preview and download (text, Markdown, HTML, PDF, images)
- Sandboxed HTML/Markdown preview (external links and media stripped)
- End-to-end encrypted delivery mode
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
not keep historical app migrations.

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

### Tech stack

- SvelteKit 2, Svelte 5, TypeScript, Tailwind CSS
- PostgreSQL, S3-compatible object storage
- WebAuthn/passkeys

---

## Security model

- Human login uses passkeys and signed session cookies.
- Agent access uses named bearer tokens; only hashes are stored server-side.
- Optional encrypted token reveal stores an E2EE-encrypted copy of the token in the browser.
- Encrypted delivery uses P-256 ECDH and AES-256-GCM envelopes; decryption happens client-side.
- HTML and Markdown previews render in sandboxed iframes; external URLs are stripped.
- Artifact uploads are capped at 25 MB per file and 500 MB per account.
- Download and preview URLs are short-lived.

Report security issues privately as described in [SECURITY.md](./SECURITY.md).

## License

Agent Relay is released under the [MIT License](./LICENSE).
