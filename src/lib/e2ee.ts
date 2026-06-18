// The portal's E2EE crypto now lives in the published packages — this module
// is a thin compatibility barrel so existing `$lib/e2ee` imports keep working
// while the implementation is sourced from a single place:
//
//   @arelay/core   — isomorphic envelope crypto (encrypt/decrypt/payload)
//   @arelay/client — browser keyring: recovery-key + passkey (WebAuthn PRF) unlock
//
// This is the dogfooding step (#54 phase 4): the portal consumes the exact same
// reader/crypto code it ships to third parties, so the envelope and key-wrapping
// formats can only ever drift in one direction — they can't.

export {
	// envelope crypto (from @arelay/core, re-exported by @arelay/client)
	encryptBytes,
	decryptBytes,
	decryptPayloadBytes,
	encryptString,
	decryptString,
	envelopeToPayload,
	payloadToEnvelope,
	// keyring / unlock (browser-only)
	generateRecoveryKey,
	createE2eeKeyring,
	unlockPrivateKey,
	unlockPrivateKeyWithPasskey,
	unlockPrivateKeyWithPrfOutput,
	unlockPrivateKeyWithLoginPrfOutputs,
	unlockPrivateKeyWithPasskeyMigration,
	wrapPrivateKeyWithPasskey,
	wrapPrivateKeyWithPrfOutput,
	createEncryptionPasskeyPrivateKey,
	canAttemptPasskeyPrf,
	usesDeterministicPasskeySalt
} from '@arelay/client';

export type {
	EncryptedEnvelope,
	EncryptedPayload,
	EncryptedPrivateKey,
	PasskeyEncryptedPrivateKey,
	E2eeKeyring,
	JsonWebKeyEnvelope,
	PrfEvaluationResult
} from '@arelay/client';
