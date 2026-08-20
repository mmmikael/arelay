import { describe, expect, it } from 'vitest';
import { encryptBytes, encryptString, envelopeToPayload } from '@arelay/core';
import { createE2eeKeyring, type E2eeKeyring } from './keyring.js';
import { ArelayReader, ArelayReaderError } from './reader.js';

/**
 * Build a fake same-origin server backed by a real keyring, so the reader
 * exercises the genuine fetch → decrypt path against representative wire shapes.
 */
async function fakeServer(keyring: E2eeKeyring) {
	const pub = keyring.publicKeyJwk;

	const sessionTitle = await encryptString('Quarterly report', pub);
	const sessionSummary = await encryptString('Q2 numbers', pub);

	const fileBytes = new TextEncoder().encode('# Hello\n\nBody');
	const fileEnvelope = await encryptBytes(fileBytes, pub);
	const { payload, ciphertextBytes } = envelopeToPayload(fileEnvelope);
	const filename = await encryptString('report.md', pub);
	const contentType = await encryptString('text/markdown', pub);

	const session = {
		id: 'sess-1',
		is_read: false,
		created_at: '2026-06-17T00:00:00.000Z',
		updated_at: '2026-06-17T00:00:00.000Z',
		read_at: null,
		encrypted_title: sessionTitle,
		encrypted_summary: sessionSummary,
		artifact_count: 1
	};
	const artifact = {
		id: 'art-1',
		size_bytes: ciphertextBytes.length,
		encrypted_filename: filename,
		encrypted_content_type: contentType,
		encrypted_payload: payload
	};

	const jsonRes = (body: unknown) =>
		new Response(JSON.stringify(body), {
			status: 200,
			headers: { 'content-type': 'application/json' }
		});

	const fetchImpl = async (input: string): Promise<Response> => {
		const path = input.replace(/^https?:\/\/[^/]+/, '');
		if (path === '/api/e2ee/config') {
			return jsonRes({
				configured: true,
				publicKeyJwk: pub,
				encryptedPrivateKey: keyring.encryptedPrivateKey,
				passkeyCredentialId: null,
				passkeyEncryptedPrivateKey: null,
				recoveryHint: null
			});
		}
		if (path === '/api/sessions') return jsonRes({ sessions: [session] });
		if (path === '/api/sessions/sess-1') return jsonRes({ session, artifacts: [artifact] });
		if (path === '/api/artifacts/art-1/ciphertext') {
			return new Response(ciphertextBytes, { status: 200 });
		}
		return new Response('not found', { status: 404 });
	};

	return { fetchImpl };
}

describe('ArelayReader', () => {
	it('lists, reads, and decrypts an inbox over a same-origin transport', async () => {
		const keyring = await createE2eeKeyring();
		const { fetchImpl } = await fakeServer(keyring);
		const reader = new ArelayReader({ baseUrl: 'https://inbox.example', fetch: fetchImpl });

		expect(reader.unlocked).toBe(false);
		await reader.unlockWithRecoveryKey(keyring.recoveryKey);
		expect(reader.unlocked).toBe(true);

		const sessions = await reader.listSessions();
		expect(sessions).toHaveLength(1);
		expect(sessions[0]).toMatchObject({ id: 'sess-1', title: 'Quarterly report', summary: 'Q2 numbers', isRead: false });

		const detail = await reader.getSession('sess-1');
		expect(detail.session.title).toBe('Quarterly report');
		expect(detail.artifacts).toHaveLength(1);
		expect(detail.artifacts[0]).toMatchObject({ filename: 'report.md', contentType: 'text/markdown' });

		const bytes = await reader.getArtifactBytes(detail.artifacts[0]!);
		expect(new TextDecoder().decode(bytes)).toBe('# Hello\n\nBody');
	});

	it('refuses to read while locked', async () => {
		const keyring = await createE2eeKeyring();
		const { fetchImpl } = await fakeServer(keyring);
		const reader = new ArelayReader({ baseUrl: 'https://inbox.example', fetch: fetchImpl });
		await expect(reader.listSessions()).rejects.toThrow(/locked/);
	});

	it('surfaces HTTP failures as ArelayReaderError', async () => {
		const reader = new ArelayReader({
			baseUrl: 'https://inbox.example',
			fetch: async () => new Response('nope', { status: 401 })
		});
		await expect(reader.getE2eeConfig()).rejects.toBeInstanceOf(ArelayReaderError);
	});
});
