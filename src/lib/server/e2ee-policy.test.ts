import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
	E2EE_REQUIRED,
	E2EE_REQUIRED_STATUS,
	PLAINTEXT_NOT_ALLOWED,
	e2eeOnlyResponse,
	e2eeRequiredResponse,
	isE2eePolicyResponse,
	rejectPlaintextPayload,
	requireOwnerE2eeForAgent
} from './e2ee-policy';

vi.mock('$lib/server/db', () => ({
	getE2eeConfig: vi.fn()
}));

import { getE2eeConfig } from '$lib/server/db';

const mockConfig = {
	id: 'e2ee-1',
	user_id: 'user-1',
	public_key_jwk: { kty: 'EC' },
	encrypted_private_key: { v: 1 },
	passkey_credential_id: 'cred-1',
	passkey_encrypted_private_key: null,
	recovery_hint: null,
	created_at: new Date(),
	updated_at: new Date()
};

describe('e2ee-policy', () => {
	beforeEach(() => {
		vi.mocked(getE2eeConfig).mockReset();
	});

	it('e2eeRequiredResponse returns 428 with stable error code', async () => {
		const res = e2eeRequiredResponse();
		expect(res.status).toBe(E2EE_REQUIRED_STATUS);
		expect(await res.json()).toMatchObject({ error: E2EE_REQUIRED });
	});

	it('rejectPlaintextPayload returns 400 with stable error code', async () => {
		const res = rejectPlaintextPayload();
		expect(res.status).toBe(400);
		expect(await res.json()).toMatchObject({ error: PLAINTEXT_NOT_ALLOWED });
	});

	it('e2eeOnlyResponse returns 400 e2ee_only', async () => {
		const res = e2eeOnlyResponse();
		expect(res.status).toBe(400);
		expect(await res.json()).toMatchObject({ error: 'e2ee_only' });
	});

	it('requireOwnerE2eeForAgent returns config when configured', async () => {
		vi.mocked(getE2eeConfig).mockResolvedValue(mockConfig);
		const result = await requireOwnerE2eeForAgent('user-1');
		expect(isE2eePolicyResponse(result)).toBe(false);
		if (!isE2eePolicyResponse(result)) {
			expect(result.user_id).toBe('user-1');
		}
	});

	it('requireOwnerE2eeForAgent returns 428 when not configured', async () => {
		vi.mocked(getE2eeConfig).mockResolvedValue(null);
		const result = await requireOwnerE2eeForAgent('user-1');
		expect(isE2eePolicyResponse(result)).toBe(true);
		if (isE2eePolicyResponse(result)) {
			expect(result.status).toBe(428);
		}
	});
});
