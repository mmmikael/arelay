export const TERMS_VERSION = '2026-06-07';
export const PRIVACY_VERSION = '2026-06-07';
export const LEGAL_EFFECTIVE_DATE = 'June 7, 2026';

export function isCurrentLegalAcceptance(input: {
	termsAccepted?: unknown;
	termsVersion?: unknown;
	privacyVersion?: unknown;
}): boolean {
	return (
		input.termsAccepted === true &&
		input.termsVersion === TERMS_VERSION &&
		input.privacyVersion === PRIVACY_VERSION
	);
}

export function hasCurrentLegalVersions(input: {
	terms_version?: string | null;
	privacy_version?: string | null;
}): boolean {
	return input.terms_version === TERMS_VERSION && input.privacy_version === PRIVACY_VERSION;
}
