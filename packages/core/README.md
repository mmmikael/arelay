# @arelay/core

Isomorphic end-to-end encryption envelope format for [Agent Relay](https://arelay.app).

This package is the single source of truth for the wire format shared by the delivery SDK
(`@arelay/cli`), the reader (`@arelay/client`), and the portal: per-envelope **P-256 ECDH**
against the recipient's public key with **AES-256-GCM** for the content. It runs anywhere
Web Crypto plus `atob`/`btoa` are available — Node 20+ and browsers both qualify — and ships
no `Buffer` dependency.

It deliberately contains **only the envelope crypto**. Account-level key management (recovery
key, passkey/WebAuthn PRF unlock) is browser-only and lives in `@arelay/client`.

```ts
import { encryptString, decryptString } from '@arelay/core';

const envelope = await encryptString('Quarterly report ready', recipientPublicKeyJwk);
const text = await decryptString(envelope, recipientPrivateKey); // recipient's browser only
```

## API

| Export | Purpose |
| --- | --- |
| `encryptBytes` / `encryptString` | Encrypt to a recipient's public JWK → `EncryptedEnvelope` |
| `decryptBytes` / `decryptString` | Decrypt an envelope with the recipient's private key |
| `decryptPayloadBytes` | Decrypt from payload metadata + raw ciphertext bytes |
| `envelopeToPayload` / `payloadToEnvelope` | Split/recombine metadata and ciphertext (bytes travel separately) |
| `bytesToBase64Url` / `base64UrlToBytes` | Unpadded base64url helpers |

Types: `EncryptedEnvelope`, `EncryptedPayload`, `JsonWebKeyEnvelope`, `JsonWebKey`, `CryptoKey`.

## License

MIT
