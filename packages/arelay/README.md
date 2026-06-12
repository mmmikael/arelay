# arelay

CLI, SDK, and MCP server for [Agent Relay](https://arelay.app) — an open-source, end-to-end
encrypted inbox for AI agents. Deliver reports, files, and finished work to a human's
private inbox; everything is encrypted on the agent's machine and decrypted only in the
recipient's browser.

## Setup

1. Sign in at [arelay.app](https://arelay.app) (or your self-hosted relay) and finish the
   one-time encryption setup.
2. Create an agent API token in the portal under **Account → Agent API tokens**.
3. Export it: `export ARELAY_TOKEN=ar_...` (self-hosters also set `ARELAY_URL`).

Verify everything is wired up:

```sh
npx -y arelay check
```

## Deliver files from the command line

```sh
npx -y arelay send report.md --title "Q2 revenue report"
npx -y arelay send build/report.pdf metrics.csv --title "Nightly metrics" --summary "All checks green"
```

Prints JSON with `session_id` and `portal_url`. Titles, summaries, filenames, content
types, and file bytes are all encrypted client-side before upload.

## MCP server

Give any MCP-capable agent (Claude Code, Cursor, Claude Desktop, ...) the ability to
deliver work directly:

```sh
# Claude Code
claude mcp add arelay --env ARELAY_TOKEN=ar_... -- npx -y arelay mcp
```

Or in JSON MCP config:

```json
{
	"mcpServers": {
		"arelay": {
			"command": "npx",
			"args": ["-y", "arelay", "mcp"],
			"env": { "ARELAY_TOKEN": "ar_..." }
		}
	}
}
```

Tools:

- **`deliver_to_inbox`** — deliver files (by path or inline content) into a new or existing session.
- **`list_inbox_sessions`** — list session ids, timestamps, and read state (titles are E2EE and unreadable by agents).
- **`submit_email_draft`** — submit an outbound email for human approval (Email Review Relay plugin; nothing is sent until the human approves it in the portal).

## SDK

```ts
import { ArelayClient } from 'arelay';

const client = new ArelayClient({ token: process.env.ARELAY_TOKEN! });

const result = await client.deliver({
	title: 'Q2 revenue report',
	summary: 'Revenue up 14% QoQ.',
	files: [
		{ filename: 'report.md', content: '# Q2 report\n...' },
		{ filename: 'data.csv', content: csvBytes }
	]
});
console.log(result.portalUrl);
```

Lower-level methods: `createSession`, `updateSession`, `uploadArtifact`, `listSessions`,
`getSession`, `createEmailDraft`, `getE2eeConfig`. Envelope crypto primitives
(`encryptBytes`, `encryptString`) are exported for custom integrations.

## Environment

| Variable | Meaning |
| --- | --- |
| `ARELAY_TOKEN` | Agent API token (`ar_...`) from the portal |
| `ARELAY_URL` | Relay base URL; defaults to `https://arelay.app` |

Limits: 25 MB per file, 500 MB per account.

## Security model

The agent encrypts every field and file with the recipient's public key
(P-256 ECDH → AES-256-GCM, one ephemeral key per envelope) before anything leaves the
process. The relay server stores ciphertext it cannot read. See the
[security model](https://github.com/mmmikael/arelay#security-model) for details.

MIT licensed. Source lives in [mmmikael/arelay](https://github.com/mmmikael/arelay)
under `packages/arelay`.
