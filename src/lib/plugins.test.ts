import { describe, expect, it, vi } from 'vitest';

const { mockEnv } = vi.hoisted(() => ({
	mockEnv: {} as Record<string, string | undefined>
}));

vi.mock('$env/dynamic/private', () => ({
	env: mockEnv
}));

import {
	EMAIL_REVIEW_RELAY_PLUGIN_ID,
	getEnabledPlugins,
	isEmailReviewRelayEnabled,
	isPluginEnabled,
	isTruthyEnv
} from './plugins';

describe('isTruthyEnv', () => {
	it('treats common truthy strings as enabled', () => {
		expect(isTruthyEnv('true')).toBe(true);
		expect(isTruthyEnv(' TRUE ')).toBe(true);
		expect(isTruthyEnv('1')).toBe(true);
		expect(isTruthyEnv('yes')).toBe(true);
	});

	it('treats empty and falsey strings as disabled', () => {
		expect(isTruthyEnv(undefined)).toBe(false);
		expect(isTruthyEnv('')).toBe(false);
		expect(isTruthyEnv('false')).toBe(false);
		expect(isTruthyEnv('0')).toBe(false);
	});
});

describe('email-review-relay plugin', () => {
	it('is disabled when the env flag is unset', () => {
		delete mockEnv.EMAIL_REVIEW_RELAY_ENABLED;
		expect(isPluginEnabled(EMAIL_REVIEW_RELAY_PLUGIN_ID)).toBe(false);
		expect(isEmailReviewRelayEnabled()).toBe(false);
		expect(getEnabledPlugins()).toHaveLength(0);
	});

	it('is enabled when EMAIL_REVIEW_RELAY_ENABLED=true', () => {
		mockEnv.EMAIL_REVIEW_RELAY_ENABLED = 'true';
		expect(isPluginEnabled(EMAIL_REVIEW_RELAY_PLUGIN_ID)).toBe(true);
		expect(isEmailReviewRelayEnabled()).toBe(true);
		expect(getEnabledPlugins()).toHaveLength(1);
	});

	it('returns false for unknown plugin ids', () => {
		expect(isPluginEnabled('unknown-plugin')).toBe(false);
	});
});
