import { emailReviewRelayPlugin } from '../plugins/email-review-relay';
import { spendReviewRelayPlugin } from '../plugins/spend-review-relay';

export type Plugin = {
	id: string;
	envFlag: string;
};

export const PLUGINS: Plugin[] = [emailReviewRelayPlugin, spendReviewRelayPlugin];

export function isTruthyEnv(value: string | undefined): boolean {
	if (!value) return false;
	const normalized = value.trim().toLowerCase();
	return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

export function getEnabledPluginsFromEnv(
	env: Record<string, string | undefined>
): Plugin[] {
	return PLUGINS.filter((plugin) => isTruthyEnv(env[plugin.envFlag]));
}

