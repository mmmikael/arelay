import { describe, expect, it } from 'vitest';
import {
	parseSpendRequestApproveFields,
	parseSpendRequestBody,
	parseSpendRequestChargeFields
} from './validate';

const envelope = {
	v: 1,
	alg: 'P-256-ECDH-A256GCM',
	epk: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y' },
	iv: 'aaaa',
	ciphertext: 'bbbb'
};

const encryptedBody = {
	encrypted: true,
	encrypted_payee: envelope,
	encrypted_amount: envelope,
	encrypted_currency: envelope,
	encrypted_description: envelope
};

describe('parseSpendRequestBody', () => {
	it('accepts a fully-formed encrypted spend request', () => {
		const result = parseSpendRequestBody(encryptedBody);
		expect(result.ok).toBe(true);
	});

	it('rejects plaintext spend requests', () => {
		const result = parseSpendRequestBody({ payee: 'Acme', amount_minor: 100 });
		expect(result.ok).toBe(false);
	});

	it('requires every mandatory envelope', () => {
		const { encrypted_amount, ...missingAmount } = encryptedBody;
		void encrypted_amount;
		const result = parseSpendRequestBody(missingAmount);
		expect(result.ok).toBe(false);
	});

	it('accepts optional metadata and session summary envelopes', () => {
		const result = parseSpendRequestBody({
			...encryptedBody,
			encrypted_metadata: envelope,
			encrypted_session_summary: envelope
		});
		expect(result.ok).toBe(true);
	});
});

describe('parseSpendRequestChargeFields', () => {
	const base = { payee: 'OpenAI', amount_minor: 4900, currency: 'usd', description: 'API credits' };

	it('accepts valid charge fields and normalizes currency', () => {
		const result = parseSpendRequestChargeFields({ ...base, currency: 'USD' });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.currency).toBe('usd');
			expect(result.value.amount_minor).toBe(4900);
		}
	});

	it('rejects non-integer or non-positive amounts', () => {
		expect(parseSpendRequestChargeFields({ ...base, amount_minor: 0 }).ok).toBe(false);
		expect(parseSpendRequestChargeFields({ ...base, amount_minor: -10 }).ok).toBe(false);
		expect(parseSpendRequestChargeFields({ ...base, amount_minor: 49.5 }).ok).toBe(false);
	});

	it('rejects malformed currency codes', () => {
		expect(parseSpendRequestChargeFields({ ...base, currency: 'dollars' }).ok).toBe(false);
		expect(parseSpendRequestChargeFields({ ...base, currency: 'us' }).ok).toBe(false);
	});

	it('requires payee and description', () => {
		expect(parseSpendRequestChargeFields({ ...base, payee: '' }).ok).toBe(false);
		expect(parseSpendRequestChargeFields({ ...base, description: '   ' }).ok).toBe(false);
	});
});

describe('parseSpendRequestApproveFields', () => {
	const base = { payee: 'OpenAI', amount_minor: 4900, currency: 'usd', description: 'API credits' };

	it('accepts charge fields with an optional encrypted receipt', () => {
		const result = parseSpendRequestApproveFields({ ...base, encrypted_receipt: envelope });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.encrypted_receipt).toEqual(envelope);
		}
	});

	it('rejects an invalid encrypted receipt envelope', () => {
		const result = parseSpendRequestApproveFields({ ...base, encrypted_receipt: { bad: true } });
		expect(result.ok).toBe(false);
	});
});
