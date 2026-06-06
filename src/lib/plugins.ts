import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { EMAIL_REVIEW_RELAY_PLUGIN_ID } from '../plugins/email-review-relay';
import {
	getEnabledPluginsFromEnv,
	getPluginSchemaSqlFromEnv,
	isTruthyEnv,
	PLUGINS,
	type Plugin
} from './plugin-registry';

export type { Plugin };
export { EMAIL_REVIEW_RELAY_PLUGIN_ID, isTruthyEnv };

function runtimeEnv(): Record<string, string | undefined> {
	return env as Record<string, string | undefined>;
}

export function isPluginEnabled(id: string): boolean {
	return getEnabledPluginsFromEnv(runtimeEnv()).some((plugin) => plugin.id === id);
}

export function isEmailReviewRelayEnabled(): boolean {
	return isPluginEnabled(EMAIL_REVIEW_RELAY_PLUGIN_ID);
}

export function requirePlugin(id: string): void {
	if (!isPluginEnabled(id)) {
		throw error(404, 'Plugin not enabled');
	}
}

export function getEnabledPlugins(): Plugin[] {
	return getEnabledPluginsFromEnv(runtimeEnv());
}

export function getPluginSchemaSql(): string {
	return getPluginSchemaSqlFromEnv(runtimeEnv());
}

export function isPluginRegistered(id: string): boolean {
	return PLUGINS.some((plugin) => plugin.id === id);
}
