import { prepareHtmlBodyForEmail } from '$lib/preview-doc';
import { decryptSecret } from '$lib/server/secret-crypto';
import { sendViaCloudflare } from '$lib/server/email-send';
import { decryptCloudflareAccountId, isUserCloudflareEmailConfigured } from './credentials';
import { getUserCloudflareEmail } from './db';
import type { EmailDraftRecord, EmailDraftSendFields } from './types';

/** Sanitize HTML so outbound email matches the portal preview. */
export function prepareEmailDraftSendFields(fields: EmailDraftSendFields): EmailDraftSendFields {
	return {
		...fields,
		html: prepareHtmlBodyForEmail(fields.html)
	};
}

/** Split a normalized "a@b.com, c@d.com" recipient list into an address array. */
function recipientList(value: string | undefined): string[] | undefined {
	if (!value) return undefined;
	const list = value
		.split(/[,;]/)
		.map((part) => part.trim())
		.filter((part) => part.length > 0);
	return list.length > 0 ? list : undefined;
}

export async function sendApprovedEmailDraft(input: {
	userId: string;
	draft: EmailDraftRecord;
	fields: EmailDraftSendFields;
	origin: string;
}): Promise<void> {
	const credentials = await getUserCloudflareEmail(input.userId);
	if (!isUserCloudflareEmailConfigured(credentials)) {
		throw new Error(
			'Cloudflare Email Sending is not configured for this account. Re-save your Account ID and API token in Account settings.'
		);
	}

	const fields = prepareEmailDraftSendFields(input.fields);
	const accountId = decryptCloudflareAccountId(credentials);
	if (!accountId) {
		throw new Error(
			'Cloudflare Account ID could not be read. Re-save your Account ID and API token in Account settings.'
		);
	}
	const apiToken = decryptSecret(credentials.api_token_ciphertext);
	await sendViaCloudflare({
		accountId,
		apiToken,
		to: fields.to,
		cc: recipientList(fields.cc),
		bcc: recipientList(fields.bcc),
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
