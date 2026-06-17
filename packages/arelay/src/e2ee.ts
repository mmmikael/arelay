/**
 * Envelope encryption for Agent Relay deliveries.
 *
 * The crypto itself lives in `@arelay/core` (the single source of truth shared
 * with the portal and the reader). This module re-exports the encrypt surface
 * the CLI needs and adds the wire-oriented `envelopeToPayload` flavor the
 * delivery client uses (base64url ciphertext + byte count for the HTTP body).
 * Agents only ever encrypt — decryption happens in the recipient's browser.
 */

import {
	bytesToBase64Url,
	envelopeToPayload as splitEnvelope,
	type EncryptedEnvelope,
	type EncryptedPayload
} from '@arelay/core';

export {
	bytesToBase64Url,
	base64UrlToBytes,
	encryptBytes,
	encryptString,
	type EncryptedEnvelope,
	type EncryptedPayload,
	type JsonWebKey,
	type JsonWebKeyEnvelope
} from '@arelay/core';

/**
 * Split an envelope into payload metadata plus the ciphertext encoded for the
 * delivery HTTP body. `sizeBytes` is the decoded artifact size (plaintext +
 * the 16-byte AES-GCM tag), reported to the server alongside the upload.
 */
export function envelopeToPayload(envelope: EncryptedEnvelope): {
	payload: EncryptedPayload;
	ciphertextBase64Url: string;
	sizeBytes: number;
} {
	const { payload, ciphertextBytes } = splitEnvelope(envelope);
	return {
		payload,
		ciphertextBase64Url: bytesToBase64Url(ciphertextBytes),
		sizeBytes: ciphertextBytes.length
	};
}
