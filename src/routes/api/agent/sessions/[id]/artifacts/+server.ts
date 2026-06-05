import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createArtifact, getSession, type JsonObject } from '$lib/server/db';
import { validateArtifactStorageUpload } from '$lib/server/storage-quota';
import { buildStorageKey, isS3Configured, putObject } from '$lib/server/s3';
import { sanitizeFilename } from '$lib/artifacts';

function base64UrlToBytes(value: string): Uint8Array {
	const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
	const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
	return new Uint8Array(Buffer.from(padded, 'base64'));
}

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const sessionId = params.id;
	if (!sessionId) {
		return json({ error: 'Session id required' }, { status: 400 });
	}

	if (!isS3Configured()) {
		return json({ error: 'Storage not configured' }, { status: 503 });
	}

	const session = await getSession(sessionId, locals.agentUser!.id);
	if (!session) {
		return json({ error: 'Session not found' }, { status: 404 });
	}

	const contentType = request.headers.get('content-type') ?? '';

	if (contentType.includes('multipart/form-data')) {
		const formData = await request.formData();
		const file = formData.get('file');
		if (!(file instanceof File)) {
			return json({ error: 'Missing file field' }, { status: 400 });
		}

		const filename = sanitizeFilename(
			(formData.get('filename') as string | null) || file.name || 'artifact.bin'
		);
		const quota = await validateArtifactStorageUpload(locals.agentUser!.id, file.size);
		if (!quota.ok) {
			return json({ error: quota.error }, { status: quota.status });
		}
		const bytes = new Uint8Array(await file.arrayBuffer());
		const artifactId = crypto.randomUUID();
		const storageKey = buildStorageKey(sessionId, artifactId, filename);

		await putObject(storageKey, bytes, file.type || 'application/octet-stream');
		const artifact = await createArtifact({
			id: artifactId,
			sessionId,
			filename,
			contentType: file.type || 'application/octet-stream',
			sizeBytes: bytes.byteLength,
			storageKey
		});

		return json({ artifact }, { status: 201 });
	}

	if (contentType.includes('application/json')) {
		const body = (await request.json()) as {
			encrypted?: boolean;
			filename?: string;
			content?: string;
			content_type?: string;
			encrypted_filename?: JsonObject;
			encrypted_content_type?: JsonObject;
			encrypted_payload?: JsonObject;
			ciphertext_base64?: string;
			size_bytes?: number;
		};

		if (body.encrypted) {
			if (
				!body.encrypted_filename ||
				!body.encrypted_content_type ||
				!body.encrypted_payload ||
				!body.ciphertext_base64
			) {
				return json(
					{
						error:
							'encrypted_filename, encrypted_content_type, encrypted_payload, and ciphertext_base64 are required'
					},
					{ status: 400 }
				);
			}

			const bytes = base64UrlToBytes(body.ciphertext_base64);
			const quota = await validateArtifactStorageUpload(locals.agentUser!.id, bytes.byteLength);
			if (!quota.ok) {
				return json({ error: quota.error }, { status: quota.status });
			}
			const artifactId = crypto.randomUUID();
			const storageKey = buildStorageKey(sessionId, artifactId, `${artifactId}.encrypted`);

			await putObject(storageKey, bytes, 'application/octet-stream');
			const artifact = await createArtifact({
				id: artifactId,
				sessionId,
				filename: 'encrypted-artifact.bin',
				contentType: 'application/octet-stream',
				sizeBytes: Number(body.size_bytes ?? bytes.byteLength),
				storageKey,
				encryptionVersion: 'e2ee-v1',
				encryptedFilename: body.encrypted_filename,
				encryptedContentType: body.encrypted_content_type,
				encryptedPayload: body.encrypted_payload
			});

			return json({ artifact }, { status: 201 });
		}

		if (!body.content) {
			return json({ error: 'Missing content' }, { status: 400 });
		}

		const filename = sanitizeFilename(body.filename || 'artifact.txt');
		const resolvedType = body.content_type || 'text/plain';
		const bytes = new TextEncoder().encode(body.content);
		const quota = await validateArtifactStorageUpload(locals.agentUser!.id, bytes.byteLength);
		if (!quota.ok) {
			return json({ error: quota.error }, { status: quota.status });
		}
		const artifactId = crypto.randomUUID();
		const storageKey = buildStorageKey(sessionId, artifactId, filename);

		await putObject(storageKey, bytes, resolvedType);
		const artifact = await createArtifact({
			id: artifactId,
			sessionId,
			filename,
			contentType: resolvedType,
			sizeBytes: bytes.byteLength,
			storageKey
		});

		return json({ artifact }, { status: 201 });
	}

	return json({ error: 'Use multipart/form-data or application/json' }, { status: 415 });
};
