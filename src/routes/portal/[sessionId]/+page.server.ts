import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { isEmailReviewRelayEnabled, isSpendReviewRelayEnabled } from '$lib/plugins';
import { getSession, listArtifacts } from '$lib/server/db';
import {
	getEmailDraftBySessionId,
	getSessionDeliveryType,
	getUserCloudflareEmail,
	isUserCloudflareEmailConfigured
} from '$plugins/email-review-relay/server';
import {
	getSpendRequestBySessionId,
	getUserStripeCredentials,
	isUserStripeConfigured
} from '$plugins/spend-review-relay/server';

export const load: PageServerLoad = async ({ locals, params, depends }) => {
	depends('inbox:session');

	const [session, artifacts] = await Promise.all([
		getSession(params.sessionId, locals.user!.id),
		listArtifacts(params.sessionId, locals.user!.id)
	]);

	if (!session) {
		throw error(404, 'Session not found');
	}

	const mappedArtifacts = artifacts.map((artifact) => ({
		...artifact,
		size_bytes: Number(artifact.size_bytes),
		previewKind: 'none' as const
	}));

	const emailReviewRelayEnabled = isEmailReviewRelayEnabled();
	const spendReviewRelayEnabled = isSpendReviewRelayEnabled();

	let emailDraft = null;
	let cloudflareEmailConfigured = false;
	let spendRequest = null;
	let stripeConfigured = false;

	if (emailReviewRelayEnabled || spendReviewRelayEnabled) {
		const deliveryType = await getSessionDeliveryType(params.sessionId, locals.user!.id);

		if (emailReviewRelayEnabled) {
			if (deliveryType === 'email_draft') {
				emailDraft = await getEmailDraftBySessionId(params.sessionId, locals.user!.id);
			}
			cloudflareEmailConfigured = isUserCloudflareEmailConfigured(
				await getUserCloudflareEmail(locals.user!.id)
			);
		}

		if (spendReviewRelayEnabled) {
			if (deliveryType === 'spend_request') {
				spendRequest = await getSpendRequestBySessionId(params.sessionId, locals.user!.id);
			}
			stripeConfigured = isUserStripeConfigured(await getUserStripeCredentials(locals.user!.id));
		}
	}

	return {
		session,
		artifacts: mappedArtifacts,
		plugins: {
			emailReviewRelay: emailReviewRelayEnabled,
			spendReviewRelay: spendReviewRelayEnabled
		},
		emailDraft,
		cloudflareEmailConfigured,
		spendRequest,
		stripeConfigured
	};
};
