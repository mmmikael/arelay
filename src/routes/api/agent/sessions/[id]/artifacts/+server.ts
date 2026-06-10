import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	AGENT_ARTIFACT_LIMIT_ERROR,
	reserveAgentArtifactCreate
} from '$lib/server/agent-rate-limit';
import { routeLogAndJsonError, routeRateLimitResponse } from '$lib/server/api-error';
import { base64UrlToBytes } from '$lib/server/base64url';
import { createArtifact, deleteArtifact, getSession, type JsonObject } from '$lib/server/db';
import { isEncryptedArtifactPayload, isEncryptedEnvelope } from '$lib/e2ee-envelope';
import {
	isE2eePolicyResponse,
	rejectPlaintextPayload,
	requireOwnerE2eeForAgent
} from '$lib/server/e2ee-policy';
import { artifactUploadBodyTooLarge } from '$lib/storage-limits';
import { validateArtifactStorageUpload } from '$lib/server/storage-quota';
import { buildStorageKey, deleteObject, isS3Configured, putObject } from '$lib/server/s3';

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const sessionId = params.id;
	if (!sessionId) {
		return json({ error: 'Session id required' }, { status: 400 });
	}

	const policy = await requireOwnerE2eeForAgent(locals.agentUser!.id);
	if (isE2eePolicyResponse(policy)) {
		return policy;
	}

	if (!isS3Configured()) {
		return json({ error: 'Storage not configured' }, { status: 503 });
	}

	const session = await getSession(sessionId, locals.agentUser!.id);
	if (!session) {
		return json({ error: 'Session not found' }, { status: 404 });
	}

	const contentType = request.headers.get('content-type') ?? '';
	if (!contentType.includes('application/json')) {
		return json(
			{ error: 'application/json with encrypted artifact payload required' },
			{ status: 415 }
		);
	}

	if (artifactUploadBodyTooLarge(request.headers.get('content-length'))) {
		return json({ error: 'Request body too large for artifact upload.' }, { status: 413 });
	}

	const body = (await request.json()) as {
		encrypted?: boolean;
		encrypted_filename?: JsonObject;
		encrypted_content_type?: JsonObject;
		encrypted_payload?: JsonObject;
		ciphertext_base64?: string;
	};

	if (!body.encrypted) {
		return rejectPlaintextPayload();
	}

	if (
		!isEncryptedEnvelope(body.encrypted_filename) ||
		!isEncryptedEnvelope(body.encrypted_content_type) ||
		!isEncryptedArtifactPayload(body.encrypted_payload) ||
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
	const sizeBytes = bytes.byteLength;

	const artifactLimit = await reserveAgentArtifactCreate(locals.agentUser!.id);
	if (!artifactLimit.ok) {
		return routeRateLimitResponse(locals, artifactLimit.retryAfterSeconds, AGENT_ARTIFACT_LIMIT_ERROR);
	}

	const quota = await validateArtifactStorageUpload(locals.agentUser!.id, sizeBytes);
	if (!quota.ok) {
		return json({ error: quota.error }, { status: quota.status });
	}
	const artifactId = crypto.randomUUID();
	const storageKey = buildStorageKey(sessionId, artifactId, `${artifactId}.encrypted`);

	const artifact = await createArtifact({
		id: artifactId,
		sessionId,
		filename: 'encrypted-artifact.bin',
		contentType: 'application/octet-stream',
		sizeBytes,
		storageKey,
		encryptionVersion: 'e2ee-v1',
		encryptedFilename: body.encrypted_filename,
		encryptedContentType: body.encrypted_content_type,
		encryptedPayload: body.encrypted_payload
	});

	try {
		await putObject(storageKey, bytes, 'application/octet-stream');
	} catch (err) {
		const deleted = await deleteArtifact(artifactId, sessionId);
		if (!deleted) {
			locals.log.warn({ artifactId, sessionId }, 'Artifact DB rollback failed after storage error');
		}
		try {
			await deleteObject(storageKey);
		} catch {
			// Best-effort cleanup if S3 partially wrote the object.
		}
		return routeLogAndJsonError(locals, 503, 'Could not store artifact.', err);
	}

	return json({ artifact }, { status: 201 });
};
