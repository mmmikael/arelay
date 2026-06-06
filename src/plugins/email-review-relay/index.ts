import { EMAIL_REVIEW_RELAY_SCHEMA_SQL } from './schema';

export const EMAIL_REVIEW_RELAY_PLUGIN_ID = 'email-review-relay';

export const emailReviewRelayPlugin = {
	id: EMAIL_REVIEW_RELAY_PLUGIN_ID,
	envFlag: 'EMAIL_REVIEW_RELAY_ENABLED',
	schemaSql: EMAIL_REVIEW_RELAY_SCHEMA_SQL
};
