import { sanitizePreviewHtml } from '$lib/preview-sanitize';
import { decryptSecret } from '$lib/server/secret-crypto';
import { sendViaCloudflare } from '$lib/server/email-send';
import { getUserCloudflareEmail } from './db';
import type { EmailDraftRecord, EmailDraftSendFields } from './types';

/** Sanitize HTML so outbound email matches the portal preview. */
export function prepareEmailDraftSendFields(fields: EmailDraftSendFields): EmailDraftSendFields {
	return {
		...fields,
		html: sanitizePreviewHtml(fields.html)
	};
}

export async function sendApprovedEmailDraft(input: {
	userId: string;
	draft: EmailDraftRecord;
	fields: EmailDraftSendFields;
	origin: string;
}): Promise<void> {
	const credentials = await getUserCloudflareEmail(input.userId);
	if (!credentials) {
		throw new Error('Cloudflare Email Sending is not configured for this account.');
	}

	const fields = prepareEmailDraftSendFields(input.fields);
	const apiToken = decryptSecret(credentials.api_token_ciphertext);
	await sendViaCloudflare({
		accountId: credentials.account_id,
		apiToken,
		to: fields.to,
		from: {
			email: fields.from.email,
			name: fields.from.name
		},
		subject: fields.subject,
		html: fields.html,
		text: fields.text,
		headers: {
			'X-Agent-Relay-Origin': input.origin,
			'X-Agent-Relay-Draft-Id': input.draft.id
		}
	});
}
