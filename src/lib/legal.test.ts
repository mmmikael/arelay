import { describe, expect, it } from 'vitest';
import {
	PRIVACY_VERSION,
	TERMS_VERSION,
	hasCurrentLegalVersions,
	isCurrentLegalAcceptance
} from './legal';

describe('isCurrentLegalAcceptance', () => {
	it('accepts the current document versions', () => {
		expect(
			isCurrentLegalAcceptance({
				termsAccepted: true,
				termsVersion: TERMS_VERSION,
				privacyVersion: PRIVACY_VERSION
			})
		).toBe(true);
	});

	it('rejects missing consent or stale versions', () => {
		expect(
			isCurrentLegalAcceptance({
				termsAccepted: false,
				termsVersion: TERMS_VERSION,
				privacyVersion: PRIVACY_VERSION
			})
		).toBe(false);
		expect(
			isCurrentLegalAcceptance({
				termsAccepted: true,
				termsVersion: 'old',
				privacyVersion: PRIVACY_VERSION
			})
		).toBe(false);
	});
});

describe('hasCurrentLegalVersions', () => {
	it('requires both current versions', () => {
		expect(
			hasCurrentLegalVersions({
				terms_version: TERMS_VERSION,
				privacy_version: PRIVACY_VERSION
			})
		).toBe(true);
		expect(
			hasCurrentLegalVersions({
				terms_version: TERMS_VERSION,
				privacy_version: null
			})
		).toBe(false);
	});
});
