import { describe, expect, it } from 'vitest';
import { isEncryptedArtifactPayload, isEncryptedEnvelope } from './e2ee-envelope';

const envelope = {
	v: 1,
	alg: 'P-256-ECDH-A256GCM',
	epk: { kty: 'EC', crv: 'P-256', x: 'abc', y: 'def' },
	iv: 'iv',
	ciphertext: 'cipher'
};

describe('isEncryptedEnvelope', () => {
	it('accepts valid envelopes', () => {
		expect(isEncryptedEnvelope(envelope)).toBe(true);
	});

	it('rejects invalid envelopes', () => {
		expect(isEncryptedEnvelope(null)).toBe(false);
		expect(isEncryptedEnvelope({ ...envelope, alg: 'bad' })).toBe(false);
	});

	it('caps the ciphertext at the default field length unless a larger cap is given', () => {
		const oversized = { ...envelope, ciphertext: 'c'.repeat(512 * 1024 + 1) };
		expect(isEncryptedEnvelope(oversized)).toBe(false);
		expect(isEncryptedEnvelope(oversized, 1024 * 1024)).toBe(true);
		expect(isEncryptedEnvelope(oversized, 10)).toBe(false);
	});

	it('accepts artifact payload envelopes without inline ciphertext', () => {
		const { ciphertext: _ciphertext, ...payload } = envelope;
		expect(isEncryptedArtifactPayload(payload)).toBe(true);
		expect(isEncryptedArtifactPayload(envelope)).toBe(false);
	});
});
