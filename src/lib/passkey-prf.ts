import type {
	AuthenticationResponseJSON,
	PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON
} from '@simplewebauthn/browser';

type PasskeyPrfRegistrationOptions = PublicKeyCredentialCreationOptionsJSON & {
	extensions?: PublicKeyCredentialCreationOptionsJSON['extensions'] & {
		prf?: Record<string, never>;
	};
};

type PasskeyPrfAuthenticationOptions = PublicKeyCredentialRequestOptionsJSON & {
	extensions?: PublicKeyCredentialRequestOptionsJSON['extensions'] & {
		prf?: {
			eval?: {
				first: string;
			};
		};
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

export function withPasskeyPrfAuthExtension(
	optionsJSON: PublicKeyCredentialRequestOptionsJSON,
	saltBase64Url: string
): PasskeyPrfAuthenticationOptions {
	return {
		...optionsJSON,
		extensions: {
			...optionsJSON.extensions,
			prf: {
				eval: {
					first: saltBase64Url
				}
			}
		}
	};
}

type PrfAuthExtensionResults = {
	prf?: {
		results?: {
			first?: ArrayBuffer;
		};
	};
};

export function getPrfFromAuthResponse(response: AuthenticationResponseJSON): Uint8Array | null {
	const extensions = response.clientExtensionResults as PrfAuthExtensionResults | undefined;
	const first = extensions?.prf?.results?.first;
	if (!first) return null;
	return new Uint8Array(first);
}
