import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser';

type PasskeyPrfRegistrationOptions = PublicKeyCredentialCreationOptionsJSON & {
	extensions?: PublicKeyCredentialCreationOptionsJSON['extensions'] & {
		prf?: Record<string, never>;
	};
};

export function withPasskeyPrfExtension(
	optionsJSON: PublicKeyCredentialCreationOptionsJSON
): PasskeyPrfRegistrationOptions {
	return {
		...optionsJSON,
		extensions: {
			...optionsJSON.extensions,
			prf: {}
		}
	};
}
