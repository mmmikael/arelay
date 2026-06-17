# @arelay/client

Browser-side **reader** for [Agent Relay](https://arelay.app). The consumer-side mirror of
[`@arelay/cli`](../arelay): where the CLI encrypts and delivers, the client unlocks your E2EE
private key in the browser and fetches + decrypts what arrived — so you can build your own
inbox frontend instead of using the stock portal.

All decryption happens in memory in the browser. The server only ever returns ciphertext and
the *encrypted* private key, so a custom frontend is exactly as trustworthy as the official one.

## Install

```bash
npm install @arelay/client
```

## High-level: `ArelayReader`

```ts
import { ArelayReader } from '@arelay/client';

const reader = new ArelayReader({ baseUrl: window.location.origin });

// 1. Unlock the private key (one of)
await reader.unlockWithPasskey();                  // WebAuthn PRF — one tap
await reader.unlockWithRecoveryKey('ABCD-EFGH-…'); // PBKDF2

reader.unlocked; // boolean

// 2. Read + decrypt (everything comes back already decrypted)
const sessions = await reader.listSessions();
//   → [{ id, title, summary, isRead, createdAt, … }]

const { session, artifacts } = await reader.getSession(sessions[0].id);
const bytes = await reader.getArtifactBytes(artifacts[0]); // Uint8Array
```

A runnable version of exactly this lives in the repo at
[`src/routes/examples/reader`](../../src/routes/examples/reader) — a dev-only page in the
portal. Run `npm run dev`, sign in, and open `/examples/reader`.

## Same-origin only (for now)

The read endpoints (`/api/e2ee/config`, `/api/sessions`, `/api/artifacts/[id]/ciphertext`)
are authenticated by the **portal session cookie**, so `baseUrl` must be the origin the user
is logged into — the portal itself, or a self-hoster's own deployment. A different-origin
frontend can decrypt but can't fetch until a human-session auth path is added to those
endpoints. Pass your own `fetch` via `options.fetch` if you need to customize the transport.

## Low-level functional API

For consumers managing their own key lifecycle and transport, the primitives are exported
directly — envelope crypto (re-exported from [`@arelay/core`](../core)) plus keyring/unlock:

```ts
import {
  unlockPrivateKeyWithPasskey, unlockPrivateKey,
  decryptString, decryptBytes, decryptPayloadBytes,
  generateRecoveryKey, createE2eeKeyring, canAttemptPasskeyPrf,
} from '@arelay/client';

const privateKey = await unlockPrivateKey(encryptedPrivateKey, recoveryKey);
const title = await decryptString(titleEnvelope, privateKey);
```

`ArelayReader` is a thin wrapper over these plus the fetch calls.

## License

MIT
