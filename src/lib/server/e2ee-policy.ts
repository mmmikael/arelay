import { json } from '@sveltejs/kit';
import { getE2eeConfig, type E2eeConfig } from '$lib/server/db';
import { isEncryptedEnvelope } from '$lib/e2ee-envelope';

export const E2EE_REQUIRED_STATUS = 428;
export const E2EE_REQUIRED = 'e2ee_required';
export const PLAINTEXT_NOT_ALLOWED = 'plaintext_not_allowed';
export const E2EE_ONLY = 'e2ee_only';

export function e2eeRequiredResponse(): Response {
	return json(
		{
			error: E2EE_REQUIRED,
			message: 'End-to-end encryption must be configured in the portal before agent delivery.'
		},
		{ status: E2EE_REQUIRED_STATUS }
	);
}

export function rejectPlaintextPayload(): Response {
	return json(
		{
			error: PLAINTEXT_NOT_ALLOWED,
			message: 'Plaintext agent payloads are not allowed. Send encrypted envelopes only.'
		},
		{ status: 400 }
	);
}

export function e2eeOnlyResponse(message = 'Use client-side decrypt.'): Response {
	return json({ error: E2EE_ONLY, message }, { status: 400 });
}

export async function requireOwnerE2eeForAgent(
	userId: string
): Promise<E2eeConfig | Response> {
	const config = await getE2eeConfig(userId);
	if (!config) {
		return e2eeRequiredResponse();
	}
	return config;
}

export function isE2eePolicyResponse(value: E2eeConfig | Response): value is Response {
	return value instanceof Response;
}

export { isEncryptedEnvelope };
