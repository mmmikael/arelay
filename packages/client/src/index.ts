/**
 * @arelay/client — browser-side reader for an Agent Relay inbox.
 *
 * Two layers:
 *   - `ArelayReader`: a high-level client (unlock → list → decrypt), mirroring
 *     `@arelay/cli`'s delivery client.
 *   - the functional primitives below, for consumers managing their own key
 *     lifecycle and transport.
 */

// High-level reader
export {
	ArelayReader,
	ArelayReaderError,
	type ArelayReaderOptions,
	type FetchLike,
	type E2eeConfig,
	type DecryptedSession,
	type DecryptedArtifact,
	type DecryptedSessionDetail
} from './reader.js';

// Envelope crypto (re-exported from @arelay/core so consumers need one import)
export {
	decryptBytes,
	decryptString,
	decryptPayloadBytes,
	encryptBytes,
	encryptString,
	envelopeToPayload,
	payloadToEnvelope,
	bytesToBase64Url,
	base64UrlToBytes,
	type EncryptedEnvelope,
	type EncryptedPayload,
	type JsonWebKeyEnvelope
} from '@arelay/core';

// Keyring + unlock (browser-only)
export {
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
	usesDeterministicPasskeySalt,
	type EncryptedPrivateKey,
	type PasskeyEncryptedPrivateKey,
	type E2eeKeyring,
	type PrfEvaluationResult
} from './keyring.js';

export { DETERMINISTIC_PRF_SALT_B64URL, deterministicPrfSaltBytes } from './passkey-salt.js';
