import { describe, expect, it, vi, beforeEach } from 'vitest';
import { POST as postAgentSession } from '../../routes/api/agent/sessions/+server';
import { POST as postAgentArtifact } from '../../routes/api/agent/sessions/[id]/artifacts/+server';
import { GET as getArchive } from '../../routes/api/sessions/[id]/archive/+server';
import { GET as getCiphertext } from '../../routes/api/artifacts/[id]/ciphertext/+server';
import { GET as getAgentE2eeConfig } from '../../routes/api/agent/e2ee/config/+server';

vi.mock('$lib/server/db', () => ({
	createEncryptedSession: vi.fn(),
	createArtifact: vi.fn(),
	deleteArtifact: vi.fn(),
	getArtifact: vi.fn(),
	getE2eeConfig: vi.fn(),
	getSession: vi.fn(),
	listSessions: vi.fn()
}));

vi.mock('$lib/server/s3', () => ({
	buildStorageKey: vi.fn(() => 'agent-relay/session/artifact/encrypted'),
	isS3Configured: vi.fn(() => true),
	putObject: vi.fn(),
	deleteObject: vi.fn(),
	getObjectBytes: vi.fn()
}));

vi.mock('$lib/server/storage-quota', () => ({
	validateArtifactStorageUpload: vi.fn(async () => ({ ok: true }))
}));

import {
	createEncryptedSession,
	createArtifact,
	deleteArtifact,
	getArtifact,
	getE2eeConfig,
	getSession
} from '$lib/server/db';
import { putObject } from '$lib/server/s3';
import { MAX_ARTIFACT_UPLOAD_BODY_BYTES } from '$lib/storage-limits';

const envelope = {
	v: 1,
	alg: 'P-256-ECDH-A256GCM',
	epk: { kty: 'EC', crv: 'P-256', x: 'abc', y: 'def' },
	iv: 'iv',
	ciphertext: 'cipher'
};

const mockE2eeConfig = {
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

function agentLocals() {
	return { agentUser: { id: 'user-1' } } as App.Locals;
}

function humanLocals() {
	return { user: { id: 'user-1' } } as App.Locals;
}

describe('E2EE route enforcement', () => {
	beforeEach(() => {
		vi.mocked(getE2eeConfig).mockReset();
		vi.mocked(getSession).mockReset();
		vi.mocked(getArtifact).mockReset();
		vi.mocked(createEncryptedSession).mockReset();
	});

	it('rejects plaintext agent session POST', async () => {
		vi.mocked(getE2eeConfig).mockResolvedValue(mockE2eeConfig);
		const response = await postAgentSession({
			locals: agentLocals(),
			request: new Request('http://localhost/api/agent/sessions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: 'Plaintext title' })
			})
		} as Parameters<typeof postAgentSession>[0]);

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: 'plaintext_not_allowed' });
	});

	it('returns 428 when owner has no E2EE config on agent session POST', async () => {
		vi.mocked(getE2eeConfig).mockResolvedValue(null);
		const response = await postAgentSession({
			locals: agentLocals(),
			request: new Request('http://localhost/api/agent/sessions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					encrypted: true,
					encrypted_title: envelope
				})
			})
		} as Parameters<typeof postAgentSession>[0]);

		expect(response.status).toBe(428);
		expect(await response.json()).toMatchObject({ error: 'e2ee_required' });
	});

	it('rejects multipart artifact uploads with 415', async () => {
		vi.mocked(getE2eeConfig).mockResolvedValue(mockE2eeConfig);
		vi.mocked(getSession).mockResolvedValue({
			id: 'session-1',
			owner_user_id: 'user-1'
		} as Awaited<ReturnType<typeof getSession>>);

		const response = await postAgentArtifact({
			locals: agentLocals(),
			params: { id: 'session-1' },
			request: new Request('http://localhost/api/agent/sessions/session-1/artifacts', {
				method: 'POST',
				headers: { 'Content-Type': 'multipart/form-data; boundary=test' },
				body: 'ignored'
			})
		} as Parameters<typeof postAgentArtifact>[0]);

		expect(response.status).toBe(415);
	});

	it('returns 413 when Content-Length exceeds artifact upload limit', async () => {
		vi.mocked(getE2eeConfig).mockResolvedValue(mockE2eeConfig);
		vi.mocked(getSession).mockResolvedValue({
			id: 'session-1',
			owner_user_id: 'user-1'
		} as Awaited<ReturnType<typeof getSession>>);

		const response = await postAgentArtifact({
			locals: agentLocals(),
			params: { id: 'session-1' },
			request: new Request('http://localhost/api/agent/sessions/session-1/artifacts', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Content-Length': String(MAX_ARTIFACT_UPLOAD_BODY_BYTES + 1)
				},
				body: '{}'
			})
		} as Parameters<typeof postAgentArtifact>[0]);

		expect(response.status).toBe(413);
	});

	it('persists server-measured artifact size and rolls back on storage failure', async () => {
		vi.mocked(getE2eeConfig).mockResolvedValue(mockE2eeConfig);
		vi.mocked(getSession).mockResolvedValue({
			id: 'session-1',
			owner_user_id: 'user-1'
		} as Awaited<ReturnType<typeof getSession>>);
		vi.mocked(createArtifact).mockResolvedValue({
			id: 'artifact-1',
			size_bytes: 3
		} as Awaited<ReturnType<typeof createArtifact>>);
		vi.mocked(putObject).mockRejectedValue(new Error('S3 unavailable'));

		const response = await postAgentArtifact({
			locals: { ...agentLocals(), log: { warn: vi.fn(), error: vi.fn() } },
			params: { id: 'session-1' },
			request: new Request('http://localhost/api/agent/sessions/session-1/artifacts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					encrypted: true,
					encrypted_filename: envelope,
					encrypted_content_type: envelope,
					encrypted_payload: { v: 1, alg: 'P-256-ECDH-A256GCM', epk: envelope.epk, iv: 'iv' },
					ciphertext_base64: 'Zm9v',
					size_bytes: 0
				})
			})
		} as Parameters<typeof postAgentArtifact>[0]);

		expect(response.status).toBe(503);
		expect(createArtifact).toHaveBeenCalledWith(
			expect.objectContaining({ sizeBytes: 3 })
		);
		expect(deleteArtifact).toHaveBeenCalledWith(expect.any(String), 'session-1');
	});

	it('returns 404 for archive on unknown session', async () => {
		vi.mocked(getSession).mockResolvedValue(null);
		const response = await getArchive({
			locals: humanLocals(),
			params: { id: 'missing-session' }
		} as Parameters<typeof getArchive>[0]);

		expect(response.status).toBe(404);
	});

	it('returns e2ee_only for archive on valid session', async () => {
		vi.mocked(getSession).mockResolvedValue({
			id: 'session-1',
			owner_user_id: 'user-1'
		} as Awaited<ReturnType<typeof getSession>>);

		const response = await getArchive({
			locals: humanLocals(),
			params: { id: 'session-1' }
		} as Parameters<typeof getArchive>[0]);

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: 'e2ee_only' });
	});

	it('rejects ciphertext fetch for non-E2EE artifacts', async () => {
		vi.mocked(getArtifact).mockResolvedValue({
			id: 'artifact-1',
			encryption_version: 'none',
			encrypted_payload: null,
			storage_key: 'key'
		} as Awaited<ReturnType<typeof getArtifact>>);

		const response = await getCiphertext({
			locals: humanLocals(),
			params: { id: 'artifact-1' }
		} as Parameters<typeof getCiphertext>[0]);

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: 'Artifact is not end-to-end encrypted' });
	});

	it('returns 428 when agent E2EE config is missing', async () => {
		vi.mocked(getE2eeConfig).mockResolvedValue(null);
		const response = await getAgentE2eeConfig({
			locals: agentLocals()
		} as Parameters<typeof getAgentE2eeConfig>[0]);

		expect(response.status).toBe(428);
		expect(await response.json()).toMatchObject({ configured: false, error: 'e2ee_required' });
	});
});
