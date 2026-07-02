import type { JsonObject } from '$lib/server/db';

export type SpendRequestStatus = 'pending' | 'approved' | 'rejected' | 'paid' | 'failed';

export type SpendRequestRecord = {
	id: string;
	session_id: string;
	owner_user_id: string;
	encryption_version: string;
	encrypted_payee: JsonObject;
	encrypted_amount: JsonObject;
	encrypted_currency: JsonObject;
	encrypted_description: JsonObject;
	encrypted_metadata: JsonObject | null;
	encrypted_receipt: JsonObject | null;
	idempotency_key: string | null;
	status: SpendRequestStatus;
	payment_intent_id: string | null;
	reviewed_at: Date | null;
	paid_at: Date | null;
	charge_error: string | null;
	created_at: Date;
	updated_at: Date;
};

export type UserStripeCredentialsRecord = {
	user_id: string;
	secret_key_ciphertext: string;
	created_at: Date;
	updated_at: Date;
};

export type EncryptedSpendRequestPayload = {
	encrypted_payee: JsonObject;
	encrypted_amount: JsonObject;
	encrypted_currency: JsonObject;
	encrypted_description: JsonObject;
	encrypted_metadata?: JsonObject;
	encrypted_session_summary?: JsonObject;
	idempotency_key?: string;
};

/** Plaintext fields the reviewer's browser sends when approving (used to charge). */
export type SpendRequestChargeFields = {
	payee: string;
	amount_minor: number;
	currency: string;
	description: string;
};

export type SpendRequestApproveFields = SpendRequestChargeFields & {
	encrypted_receipt?: JsonObject;
};

export type StripeChargeResult = {
	/** Which Stripe rail executed: a captured PaymentIntent, or a minted ACP Shared Payment Token. */
	kind: 'payment_intent' | 'shared_payment_token';
	/** Stripe reference id — a `pi_…` PaymentIntent or an `spt_…` Shared Payment Token. */
	payment_intent_id: string;
	status: string;
	amount_minor: number;
	currency: string;
};

export function isEncryptedSpendRequest(request: SpendRequestRecord): boolean {
	return request.encryption_version === 'e2ee-v1';
}

export function toAgentSpendRequestView(request: SpendRequestRecord) {
	return {
		id: request.id,
		session_id: request.session_id,
		encryption_version: request.encryption_version,
		status: request.status,
		payment_intent_id: request.payment_intent_id,
		reviewed_at: request.reviewed_at,
		paid_at: request.paid_at,
		charge_error: request.charge_error
	};
}
