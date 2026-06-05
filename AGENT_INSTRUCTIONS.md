# Agent Relay — instructions for AI agents

Use **Agent Relay** to deliver files and messages to the human user instead of email or chat attachments. Each delivery is grouped into a **session** (like one email thread). The human opens the web portal, sees new sessions in the sidebar, previews artifacts, and downloads them.

---

## Configuration

Store these in the agent environment (never commit them to git):

| Variable | Description |
|----------|-------------|
| `AGENT_RELAY_URL` | Base URL for Agent Relay. Production is `https://arelay.app` (no trailing slash). Before the custom domain is attached, use the exact Railway `RAILWAY_PUBLIC_DOMAIN`; do **not** guess the hostname because Railway adds a unique suffix and a wrong URL returns `404 Application not found`. |
| `AGENT_API_TOKEN` | Bearer token generated from the human user's Agent Relay account menu. Tokens are account-scoped; use a separate named token for each agent or integration. |

Every request must include:

```http
Authorization: Bearer <AGENT_API_TOKEN>
```

If this token is revoked, only this agent stops working. Other agents with their own tokens keep access to the same account inbox.

---

## When to send

Send to Agent Relay when you have **deliverables** for the human to review outside the chat:

- HTML pages, Markdown reports, plain text notes
- Images (PNG, JPG, WebP, …)
- PDFs and other binary files
- Multiple related files from one task → **one session**, several artifacts

Do **not** use Agent Relay for:

- Short replies that belong in the conversation
- Secrets the human did not ask you to store

---

## Standard workflow

1. **Create a session** with a clear `title` and optional `summary`.
2. **Upload one or more artifacts** to that session.
3. Optionally **PATCH** the session to update the summary when done.
4. Tell the human: *“Sent to Agent Relay — session: \<title\>”* (they do not need the UUID).

One session per logical delivery (e.g. one feature, one report, one debugging dump). Re-use the same `session_id` for all files in that delivery.

---

## API reference

Base: `{AGENT_RELAY_URL}`

### End-to-end encrypted mode

Before sending sensitive deliverables, check whether E2EE is configured:

```http
GET /api/agent/e2ee/config
```

If configured, the response is `200` with `{ "configured": true, "publicKeyJwk": { ... } }`. Encrypt session metadata and artifact bytes locally before upload. The server stores only ciphertext and cannot decrypt it.

Envelope format for encrypted strings and files:

```json
{
  "v": 1,
  "alg": "P-256-ECDH-A256GCM",
  "epk": { "kty": "EC", "crv": "P-256", "x": "...", "y": "..." },
  "iv": "base64url-no-padding",
  "ciphertext": "base64url-no-padding"
}
```

Use P-256 ECDH with the relay `publicKeyJwk`, derive an AES-256-GCM key, then encrypt each field/file with a fresh ephemeral key and IV.

Create an encrypted session:

```http
POST /api/agent/sessions
Content-Type: application/json

{
  "encrypted": true,
  "encrypted_title": { "...": "full title envelope" },
  "encrypted_summary": { "...": "optional summary envelope" }
}
```

Upload an encrypted artifact:

```http
POST /api/agent/sessions/<session_id>/artifacts
Content-Type: application/json

{
  "encrypted": true,
  "encrypted_filename": { "...": "full filename envelope" },
  "encrypted_content_type": { "...": "full content-type envelope" },
  "encrypted_payload": {
    "v": 1,
    "alg": "P-256-ECDH-A256GCM",
    "epk": { "...": "ephemeral public JWK" },
    "iv": "base64url-no-padding"
  },
  "ciphertext_base64": "base64url-no-padding",
  "size_bytes": 12345
}
```

`encrypted_payload` is the file envelope without `ciphertext`; put the file ciphertext in `ciphertext_base64`. If `/api/agent/e2ee/config` returns `404`, ask the human to set up encryption before sending sensitive content.

### 1. Create session

```http
POST /api/agent/sessions
Content-Type: application/json

{
  "title": "Short human-readable title",
  "summary": "Optional one-line description of what you sent and why"
}
```

**Response `201`:** `{ "session": { "id": "<uuid>", "title", "summary", "created_at", "updated_at" } }`

Save `session.id` for artifact uploads. If `title` is omitted, the server uses a timestamp.

---

### 2. Upload artifact — text / Markdown / HTML (JSON)

Best for generated source code, reports, and HTML built in memory.

```http
POST /api/agent/sessions/<session_id>/artifacts
Content-Type: application/json

{
  "filename": "report.md",
  "content_type": "text/markdown",
  "content": "# Title\n\nBody..."
}
```

| Field | Required | Notes |
|-------|----------|--------|
| `content` | yes | UTF-8 string |
| `filename` | no | Default `artifact.txt` |
| `content_type` | no | Default `text/plain` |

Common `content_type` values:

| Type | `content_type` |
|------|----------------|
| Markdown | `text/markdown` |
| HTML | `text/html` |
| Plain text | `text/plain` |
| JSON | `application/json` |
| CSS | `text/css` |

**Response `201`:** `{ "artifact": { "id", "session_id", "filename", "content_type", "size_bytes", "created_at" } }`

---

### 3. Upload artifact — binary file (multipart)

Best for images, PDFs, and files already on disk.

```http
POST /api/agent/sessions/<session_id>/artifacts
Content-Type: multipart/form-data

file=<binary>
filename=optional-override.png
```

| Field | Required | Notes |
|-------|----------|--------|
| `file` | yes | The file bytes |
| `filename` | no | Defaults to uploaded file name |

**Response `201`:** same artifact shape as JSON upload.

---

### 4. Update session (optional)

```http
PATCH /api/agent/sessions/<session_id>
Content-Type: application/json

{
  "title": "Updated title",
  "summary": "Final summary after all uploads"
}
```

---

### 5. List sessions (optional)

```http
GET /api/agent/sessions
```

Returns `{ "sessions": [ ... ] }` ordered by most recently updated.

---

## Complete examples

### curl — Markdown + image

```bash
BASE="$AGENT_RELAY_URL"
TOKEN="$AGENT_API_TOKEN"

SESSION=$(curl -s -X POST "$BASE/api/agent/sessions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Weekly report","summary":"Metrics and chart"}' \
  | jq -r '.session.id')

curl -s -X POST "$BASE/api/agent/sessions/$SESSION/artifacts" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"filename":"report.md","content_type":"text/markdown","content":"# Weekly report\n\nAll good."}'

curl -s -X POST "$BASE/api/agent/sessions/$SESSION/artifacts" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./chart.png"
```

### Python

```python
import os
import requests

BASE = os.environ["AGENT_RELAY_URL"].rstrip("/")
HEADERS = {"Authorization": f"Bearer {os.environ['AGENT_API_TOKEN']}"}

# 1. Create session
r = requests.post(
    f"{BASE}/api/agent/sessions",
    headers={**HEADERS, "Content-Type": "application/json"},
    json={"title": "API design draft", "summary": "OpenAPI + notes"},
    timeout=60,
)
r.raise_for_status()
session_id = r.json()["session"]["id"]

# 2. Upload markdown
requests.post(
    f"{BASE}/api/agent/sessions/{session_id}/artifacts",
    headers={**HEADERS, "Content-Type": "application/json"},
    json={
        "filename": "design.md",
        "content_type": "text/markdown",
        "content": "# API design\n\n...",
    },
    timeout=60,
).raise_for_status()

# 3. Upload image
with open("diagram.png", "rb") as f:
    requests.post(
        f"{BASE}/api/agent/sessions/{session_id}/artifacts",
        headers=HEADERS,
        files={"file": ("diagram.png", f, "image/png")},
        timeout=120,
    ).raise_for_status()
```

---

## Storage limits

Each account has a **500 MB** total storage cap across all sessions. Each artifact (plaintext or encrypted) must be **25 MB** or smaller.

When a limit is exceeded, artifact upload returns `413` (per-file too large) or `507` (account quota full) with `{ "error": "..." }`.

---

## Errors

| Status | Meaning |
|--------|---------|
| `401` | Missing, wrong, or revoked `AGENT_API_TOKEN` |
| `404` | Unknown `session_id` |
| `413` | Single artifact exceeds 25 MB |
| `415` | Artifact POST must be `application/json` or `multipart/form-data` |
| `507` | Account storage quota (500 MB) exceeded |
| `503` | S3 storage not configured on server |

On failure, read the JSON body `{ "error": "..." }` and retry or report to the human.

---

## Agent checklist

Before finishing a task that produces deliverables:

- [ ] Session `title` describes the delivery in plain language
- [ ] `summary` explains what to look at first
- [ ] Every file has a sensible `filename` extension (`.md`, `.html`, `.png`, …)
- [ ] Text/HTML uses JSON upload; binaries use multipart
- [ ] Human is told the session title (portal auto-refreshes within ~5 seconds)

---

## Human portal (for your reference)

- URL: `{AGENT_RELAY_URL}/` → passkey sign-in → `/portal`
- Sessions appear in the left sidebar; click to preview
- Human can download individual files or **Download all (.zip)**

Agents only use `/api/agent/*` routes. Do not use human passkeys or portal cookies.
