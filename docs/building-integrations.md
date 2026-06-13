# Building integrations: plugins & skills

Want to contribute to Agent Relay? Building an **integration** is the best place to start.
Most integrations talk to Agent Relay's HTTP API and never touch the core app — so you can
ship something useful without learning the whole codebase or the end-to-end-encryption
internals. This guide covers the four extension surfaces, from "an afternoon" to "a real
feature," with working examples.

> **The one rule that saves you:** don't hand-roll the crypto. The
> [`@arelay/cli`](../packages/arelay) package exposes an SDK that does P-256 ECDH +
> AES-256-GCM envelope encryption for you. Build on it and encryption is a non-issue.

## The mental model

Agent Relay is, at its core, *"deliver files and email drafts to a human's end-to-end
encrypted inbox over HTTP."* Everything you build is a client of that API:

```
your integration  →  @arelay/cli SDK (encrypts)  →  Agent Relay HTTP API  →  inbox
```

You authenticate with an **agent token** (`ar_...`, created in the portal under
**Account → Agent tokens**) and point at a deployment with a base URL (defaults to
`https://arelay.app`; self-hosters set their own).

## Pick your level

| Level | What it is | Touches core? | Good for |
| --- | --- | --- | --- |
| **1. Delivery integration** | Anything that calls the SDK to deliver | No | The fastest start — Slack/Discord notifier, GitHub Action, Raycast extension, a backend hook |
| **2. Agent skill** | A skill for Agent Skills hosts (Claude Code, Cursor, Codex, Hermes) | No | Teaching agents to deliver via natural language |
| **3. Platform plugin** | Native integration with a specific agent platform | No (separate repo) | Deep hooks into a host, e.g. cron delivery |
| **4. Core feature plugin** | Optional server-side feature, env-gated | Yes (this repo) | New capabilities like Email Review Relay |

Start at level 1 unless you have a specific reason to go deeper.

---

## Level 1 — A delivery integration (start here)

The SDK handles auth, sessions, encryption, and upload. A complete integration can be a
dozen lines.

```bash
npm install @arelay/cli
```

```typescript
import { ArelayClient } from '@arelay/cli';

const client = new ArelayClient({
  token: process.env.ARELAY_TOKEN!,
  // baseUrl defaults to https://arelay.app; set for self-hosted deployments
  // baseUrl: 'https://relay.example.com',
});

const result = await client.deliver({
  title: 'Nightly build report',
  summary: 'All green — 209 tests passed.',
  files: [
    { filename: 'report.md', content: '# Build report\n\nAll green.' },
    { filename: 'metrics.csv', content: csvBytes }, // string or Uint8Array
  ],
});

console.log(result.portalUrl); // share with the human; they unlock with a passkey
```

That's the whole thing. Titles, summaries, filenames, and file bytes are all encrypted
client-side before they leave your process.

Useful client methods:

- `deliver({ title, summary?, files, sessionId? })` — create a delivery (pass `sessionId`
  to add to an existing one).
- `listSessions()` / `getSession(id)` — read inbox sessions.
- `createEmailDraft(input)` — submit an outbound email draft for human approval (requires
  the Email Review Relay plugin on the deployment).
- `getE2eeConfig()` — check whether the account has completed encryption setup.

Verify a token and encryption setup from the shell at any time:

```bash
npx -y @arelay/cli check
```

**Ideas worth building:** a GitHub Action that delivers CI artifacts, a Slack/Discord/
Telegram notifier that posts when a delivery lands, a Raycast or Alfred command, a webhook
receiver that forwards payloads into the inbox.

---

## Level 2 — An agent skill

A skill teaches an [Agent Skills](https://agentskills.io/specification) host (Claude Code,
Cursor, Codex, Hermes, …) to deliver in plain language — *"send this report to my Agent
Relay inbox."* The reference is the [`agent-relay`](https://github.com/mmmikael/arelay-skills/tree/main/skills/agent-relay)
skill.

A skill is a folder with a `SKILL.md` manifest plus optional reference docs and scripts:

```
skills/your-skill/
  SKILL.md                  # manifest + instructions (required)
  references/
    api-reference.md        # detail the agent can pull in on demand
  scripts/
    deliver.mjs             # runnable helper (optional)
```

`SKILL.md` is Markdown with YAML frontmatter. The `description` is what the host uses to
decide when to trigger the skill, so make it specific:

```yaml
---
name: agent-relay
description: Deliver end-to-end encrypted files, reports, and email drafts to a human via
  the Agent Relay HTTP API. Use when sending deliverables outside chat, creating inbox
  sessions, uploading Markdown/HTML/images/PDFs, or when the user mentions Agent Relay,
  arelay, or agent inbox delivery.
license: MIT
metadata:
  author: your-handle
  version: "1.0.0"
---

# Agent Relay delivery

Instructions the agent follows — how to read ARELAY_TOKEN, call the API or the bundled
script, and what to return to the user.
```

Install for testing:

```bash
# global, for Claude Code / Cursor / Codex / etc.
npx skills add your-handle/your-repo --skill your-skill -g -y

# Hermes Agent
hermes skills tap add your-handle/your-repo
hermes skills install your-handle/your-repo/your-skill
```

The bundled scripts in the `agent-relay` skill (`scripts/e2ee-upload.mjs`,
`scripts/lib/e2ee.mjs`) are a good copy-paste starting point — or just call the
`@arelay/cli` SDK from your script.

---

## Level 3 — A platform plugin

A platform plugin hooks natively into a specific agent platform. The reference is
[`arelay-hermes-plugin`](https://github.com/mmmikael/arelay-hermes-plugin), which lets
Hermes deliver to Agent Relay.

A Hermes platform plugin is declared with a `plugin.yaml` manifest and a small adapter:

```yaml
name: agent-relay-platform
label: Agent Relay
kind: platform
version: 1.0.0
description: Delivers output to the Agent Relay encrypted inbox.
author: your-handle
requires_env:
  - name: AGENT_API_TOKEN
    description: "Token from Agent Relay Account -> Agent tokens"
    prompt: "Agent Relay API token"
    password: true
optional_env:
  - name: AGENT_RELAY_URL
    description: "Base URL (default: https://arelay.app)"
    prompt: "Agent Relay URL"
    password: false
```

```
your-plugin/
  plugin.yaml             # manifest: env vars, kind, version
  __init__.py             # entry point exporting register()
  adapter.py              # implements the host's platform interface
  deliver.mjs             # Node helper that encrypts + uploads (use @arelay/cli)
```

The adapter implements the host's lifecycle hooks (e.g. `check_requirements()` to verify
Node + token) and shells out to a Node helper for the actual encrypted delivery. The
manifest format and adapter interface are host-specific — follow the conventions of the
platform you're targeting.

> **Tip:** deliver *files directly* via the SDK rather than piping the host's console
> output. That way you can send HTML, PDFs, and images, not just text.

---

## Level 4 — A core feature plugin

Some capabilities live in the server itself — new API routes, database tables, portal UI.
These ship as **feature plugins**: they're in this repo but gated behind an environment
flag so minimal self-hosts stay lean. The reference is **Email Review Relay**
([`src/plugins/email-review-relay`](../src/plugins/email-review-relay)).

The pattern:

1. **Register the flag** in [`src/lib/plugin-registry.ts`](../src/lib/plugin-registry.ts):

   ```typescript
   export const PLUGINS: Plugin[] = [
     { id: 'email-review-relay', envFlag: 'EMAIL_REVIEW_RELAY_ENABLED' },
     { id: 'your-plugin',        envFlag: 'YOUR_PLUGIN_ENABLED' },
   ];
   ```

2. **Guard your routes** so they 404 when the plugin is disabled:

   ```typescript
   import { requirePlugin } from '$lib/plugins';

   export const POST: RequestHandler = async ({ locals, request }) => {
     requirePlugin('your-plugin'); // 404 if YOUR_PLUGIN_ENABLED is not set
     // ...
   };
   ```

3. **Add tables via Drizzle migrations.** Plugin tables ship in the standard migrations so
   there's no schema drift between enabled and disabled deployments — they just sit empty
   when the plugin is off. Edit the schema, run `npm run db:generate`, review the SQL, then
   `npm run db:migrate:local`.

4. **Add portal UI** behind the same flag.

This is the deepest contribution type and the one most worth discussing in an issue first —
open one before building so we can align on the design.

**Idea worth building:** an additional email-sending backend for Email Review Relay (it
currently sends via Cloudflare; SMTP or another provider would be a natural feature plugin).

---

## The HTTP API & encryption (reference)

If you can't use the SDK (different language, constrained runtime), you can call the API
directly. The full reference lives in the skill repo's
[api-reference.md](https://github.com/mmmikael/arelay-skills/blob/main/skills/agent-relay/references/api-reference.md).
Endpoints (all under `/api/agent`, `Authorization: Bearer <token>`):

| Method & path | Purpose |
| --- | --- |
| `GET /e2ee/config` | Fetch the recipient public key (`428` if E2EE isn't set up) |
| `POST /sessions` | Create a session (encrypted title/summary) |
| `POST /sessions/{id}/artifacts` | Upload an encrypted file |
| `GET /sessions` · `GET /sessions/{id}` | List / read sessions |
| `POST /email-drafts` | Submit an email draft (Email Review Relay) |
| `GET /email-drafts/{id}` | Poll draft status |

All agent payloads must be end-to-end encrypted; plaintext is rejected (`400`). Each
encrypted field is an envelope:

```json
{
  "v": 1,
  "alg": "P-256-ECDH-A256GCM",
  "epk": { "kty": "EC", "crv": "P-256", "x": "...", "y": "..." },
  "iv": "base64url",
  "ciphertext": "base64url"
}
```

A fresh ephemeral key + IV is used per envelope, encrypted against the recipient's public
key from `GET /e2ee/config`. For file uploads the envelope and ciphertext are sent
separately (`encrypted_payload` without ciphertext + `ciphertext_base64`). The SDK's
`encryptString` / `encryptBytes` / `envelopeToPayload` helpers implement this exactly —
read [`packages/arelay/src/e2ee.ts`](../packages/arelay/src/e2ee.ts) if you're porting it.

## Wanted integrations

Looking for a first contribution? These are all level-1 or level-2 and genuinely useful:

- Slack / Discord / Telegram delivery or notification bridges
- A GitHub Action for delivering CI artifacts
- A Raycast / Alfred command
- Platform plugins for other agent runners
- An SMTP backend for Email Review Relay (level 4 — open an issue first)

## Contributing back

- **Skills** can live in your own repo (installable via `npx skills add your/repo`) or be
  proposed for [arelay-skills](https://github.com/mmmikael/arelay-skills).
- **Integrations** of any kind: open a PR or an issue, and we'll link it from the docs.
- Get your MCP server or skill listed where people browse — see the existing entries on the
  [MCP Registry](https://registry.modelcontextprotocol.io/) and the awesome-lists.

Questions? Open an issue — early, rough ideas welcome. See also
[CONTRIBUTING.md](../CONTRIBUTING.md).
