import type { EmailDraftBundle } from '$lib/email-draft-bundle';
import type { EncryptedEnvelope, encryptString } from '$lib/e2ee';
import { prepareHtmlBodyForEmail } from '$lib/preview-doc';

type RecipientPublicKey = Parameters<typeof encryptString>[1];
type EncryptStringFn = typeof encryptString;

export function buildEditableBundle(input: {
	to: string;
	from_email: string;
	from_name: string | null;
	subject: string;
	html: string;
}): EmailDraftBundle {
	return {
		to: input.to.trim(),
		from_email: input.from_email.trim(),
		from_name: input.from_name?.trim() ? input.from_name.trim() : null,
		subject: input.subject.trim(),
		html: input.html
	};
}

export function reviewPayloadNeeded(
	agentBundle: EmailDraftBundle,
	editableBundle: EmailDraftBundle,
	bundleMatchesAgent: (a: EmailDraftBundle, b: EmailDraftBundle) => boolean
): EmailDraftBundle | null {
	return bundleMatchesAgent(editableBundle, agentBundle) ? null : editableBundle;
}

export async function persistEmailDraftReview(input: {
	sessionId: string;
	payload: EmailDraftBundle | null;
	publicKeyJwk: RecipientPublicKey;
	encryptString: EncryptStringFn;
}): Promise<void> {
	const body =
		input.payload === null
			? { encrypted: true, encrypted_review: null }
			: {
					encrypted: true,
					encrypted_review: await input.encryptString(JSON.stringify(input.payload), input.publicKeyJwk)
				};

	const res = await fetch(`/api/sessions/${input.sessionId}/email/review`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	const result = await res.json();
	if (!res.ok) {
		throw new Error(result.error || 'Could not save draft');
	}
}

export function buildSentEmailBundle(
	editableBundle: EmailDraftBundle,
	html: string
): EmailDraftBundle {
	return {
		...editableBundle,
		html: prepareHtmlBodyForEmail(html)
	};
}

export async function buildApproveRequestInit(input: {
	sentBundle: EmailDraftBundle;
	plainText?: string | null;
	encryptionVersion: string;
	publicKeyJwk: RecipientPublicKey | null;
	encryptString: EncryptStringFn;
}): Promise<RequestInit> {
	const init: RequestInit = { method: 'POST' };
	if (input.encryptionVersion !== 'e2ee-v1') {
		return init;
	}

	const payload: Record<string, unknown> = {
		to: input.sentBundle.to,
		from: {
			email: input.sentBundle.from_email,
			name: input.sentBundle.from_name ?? undefined
		},
		subject: input.sentBundle.subject,
		html: input.sentBundle.html,
		text: input.plainText?.trim() ? input.plainText : undefined
	};
	if (input.publicKeyJwk) {
		payload.encrypted_sent = await input.encryptString(
			JSON.stringify(input.sentBundle),
			input.publicKeyJwk
		);
	}
	init.headers = { 'Content-Type': 'application/json' };
	init.body = JSON.stringify(payload);
	return init;
}
