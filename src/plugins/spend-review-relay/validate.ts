import { isEncryptedEnvelope } from '$lib/e2ee-envelope';
import type { JsonObject } from '$lib/server/db';
import type {
	EncryptedSpendRequestPayload,
	SpendRequestApproveFields,
	SpendRequestChargeFields
} from './types';

const MAX_PAYEE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;
// Cap a single request at 1,000,000.00 in a two-decimal currency. Guards against
// fat-fingered or runaway-agent amounts; the human still approves every charge.
const MAX_AMOUNT_MINOR = 100_000_000;
const CURRENCY_PATTERN = /^[a-z]{3}$/;

export type ParsedEncryptedSpendRequestPayload = EncryptedSpendRequestPayload;

export { isEncryptedEnvelope };

function parseIdempotencyKey(
	record: Record<string, unknown>
): { ok: true; value?: string } | { ok: false; error: string } {
	if (record.idempotency_key === undefined) {
		return { ok: true };
	}
	if (typeof record.idempotency_key !== 'string' || !record.idempotency_key.trim()) {
		return { ok: false, error: 'idempotency_key must be a non-empty string when provided' };
	}
	return {
		ok: true,
		value: record.idempotency_key.trim().slice(0, MAX_IDEMPOTENCY_KEY_LENGTH)
	};
}

function requireEncryptedField(
	record: Record<string, unknown>,
	field: string
): { ok: true; value: JsonObject } | { ok: false; error: string } {
	const value = record[field];
	if (!isEncryptedEnvelope(value)) {
		return { ok: false, error: `${field} envelope required` };
	}
	return { ok: true, value };
}

function optionalEncryptedField(
	record: Record<string, unknown>,
	field: string
): { ok: true; value?: JsonObject } | { ok: false; error: string } {
	const value = record[field];
	if (value === undefined) {
		return { ok: true };
	}
	if (!isEncryptedEnvelope(value)) {
		return { ok: false, error: `${field} must be a valid envelope when provided` };
	}
	return { ok: true, value };
}

export function parseEncryptedSpendRequestPayload(body: unknown):
	| { ok: true; value: ParsedEncryptedSpendRequestPayload }
	| { ok: false; error: string } {
	if (!body || typeof body !== 'object') {
		return { ok: false, error: 'JSON body required' };
	}

	const record = body as Record<string, unknown>;
	if (record.encrypted !== true) {
		return { ok: false, error: 'encrypted must be true for encrypted spend requests' };
	}

	const encryptedPayee = requireEncryptedField(record, 'encrypted_payee');
	if (!encryptedPayee.ok) return encryptedPayee;
	const encryptedAmount = requireEncryptedField(record, 'encrypted_amount');
	if (!encryptedAmount.ok) return encryptedAmount;
	const encryptedCurrency = requireEncryptedField(record, 'encrypted_currency');
	if (!encryptedCurrency.ok) return encryptedCurrency;
	const encryptedDescription = requireEncryptedField(record, 'encrypted_description');
	if (!encryptedDescription.ok) return encryptedDescription;

	const encryptedMetadata = optionalEncryptedField(record, 'encrypted_metadata');
	if (!encryptedMetadata.ok) return encryptedMetadata;
	const encryptedSessionSummary = optionalEncryptedField(record, 'encrypted_session_summary');
	if (!encryptedSessionSummary.ok) return encryptedSessionSummary;

	const idempotency = parseIdempotencyKey(record);
	if (!idempotency.ok) return idempotency;

	return {
		ok: true,
		value: {
			encrypted_payee: encryptedPayee.value,
			encrypted_amount: encryptedAmount.value,
			encrypted_currency: encryptedCurrency.value,
			encrypted_description: encryptedDescription.value,
			encrypted_metadata: encryptedMetadata.value,
			encrypted_session_summary: encryptedSessionSummary.value,
			idempotency_key: idempotency.value
		}
	};
}

export function parseSpendRequestBody(body: unknown):
	| { ok: true; value: ParsedEncryptedSpendRequestPayload }
	| { ok: false; error: string } {
	if (!body || typeof body !== 'object') {
		return { ok: false, error: 'JSON body required' };
	}

	const record = body as Record<string, unknown>;
	if (record.encrypted !== true) {
		return {
			ok: false,
			error: 'encrypted must be true; plaintext spend requests are not allowed'
		};
	}

	return parseEncryptedSpendRequestPayload(body);
}

function parsePlaintextChargeFields(
	record: Record<string, unknown>
): { ok: true; value: SpendRequestChargeFields } | { ok: false; error: string } {
	const payee = typeof record.payee === 'string' ? record.payee.trim() : '';
	if (!payee) {
		return { ok: false, error: 'payee required' };
	}
	if (payee.length > MAX_PAYEE_LENGTH) {
		return { ok: false, error: `payee must be at most ${MAX_PAYEE_LENGTH} characters` };
	}

	const amountMinor = record.amount_minor;
	if (typeof amountMinor !== 'number' || !Number.isInteger(amountMinor) || amountMinor <= 0) {
		return { ok: false, error: 'amount_minor must be a positive integer (smallest currency unit)' };
	}
	if (amountMinor > MAX_AMOUNT_MINOR) {
		return { ok: false, error: `amount_minor must be at most ${MAX_AMOUNT_MINOR}` };
	}

	const currency = typeof record.currency === 'string' ? record.currency.trim().toLowerCase() : '';
	if (!CURRENCY_PATTERN.test(currency)) {
		return { ok: false, error: 'currency must be a three-letter ISO code (e.g. "usd")' };
	}

	const description = typeof record.description === 'string' ? record.description.trim() : '';
	if (!description) {
		return { ok: false, error: 'description required' };
	}
	if (description.length > MAX_DESCRIPTION_LENGTH) {
		return { ok: false, error: `description must be at most ${MAX_DESCRIPTION_LENGTH} characters` };
	}

	return {
		ok: true,
		value: { payee, amount_minor: amountMinor, currency, description }
	};
}

export function parseSpendRequestChargeFields(body: unknown):
	| { ok: true; value: SpendRequestChargeFields }
	| { ok: false; error: string } {
	if (!body || typeof body !== 'object') {
		return { ok: false, error: 'JSON body required' };
	}
	return parsePlaintextChargeFields(body as Record<string, unknown>);
}

export function parseSpendRequestApproveFields(body: unknown):
	| { ok: true; value: SpendRequestApproveFields }
	| { ok: false; error: string } {
	if (!body || typeof body !== 'object') {
		return { ok: false, error: 'JSON body required' };
	}

	const record = body as Record<string, unknown>;
	const parsed = parsePlaintextChargeFields(record);
	if (!parsed.ok) return parsed;

	const encryptedReceipt = optionalEncryptedField(record, 'encrypted_receipt');
	if (!encryptedReceipt.ok) return encryptedReceipt;

	return {
		ok: true,
		value: {
			...parsed.value,
			encrypted_receipt: encryptedReceipt.value
		}
	};
}
