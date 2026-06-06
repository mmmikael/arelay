import { decryptSecret } from '$lib/server/secret-crypto';
import { sendViaCloudflare } from '$lib/server/email-send';
import { getUserCloudflareEmail } from './db';
import type { EmailDraftRecord, EmailDraftSendFields } from './types';

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

	const apiToken = decryptSecret(credentials.api_token_ciphertext);
	await sendViaCloudflare({
		accountId: credentials.account_id,
		apiToken,
		to: input.fields.to,
		from: {
			email: input.fields.from.email,
			name: input.fields.from.name
		},
		subject: input.fields.subject,
		html: input.fields.html,
		text: input.fields.text,
		headers: {
			'X-Agent-Relay-Origin': input.origin,
			'X-Agent-Relay-Draft-Id': input.draft.id
		}
	});
}

export function emailDraftSendFieldsFromRecord(draft: EmailDraftRecord): EmailDraftSendFields {
	if (
		!draft.to_address ||
		!draft.from_email ||
		!draft.subject ||
		!draft.html
	) {
		throw new Error('Email draft is missing plaintext send fields');
	}

	return {
		to: draft.to_address,
		from: {
			email: draft.from_email,
			name: draft.from_name ?? undefined
		},
		subject: draft.subject,
		html: draft.html,
		text: draft.text ?? undefined
	};
}
