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
				second?: string;
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
	saltBase64Url: string,
	secondSaltBase64Url?: string
): PasskeyPrfAuthenticationOptions {
	return {
		...optionsJSON,
		extensions: {
			...optionsJSON.extensions,
			prf: {
				eval: {
					first: saltBase64Url,
					...(secondSaltBase64Url ? { second: secondSaltBase64Url } : {})
				}
			}
		}
	};
}

type PrfAuthExtensionResults = {
	prf?: {
		results?: {
			first?: ArrayBuffer;
			second?: ArrayBuffer;
		};
	};
};

export type PrfAuthOutputs = {
	first: Uint8Array;
	second: Uint8Array | null;
};

export function getPrfOutputsFromAuthResponse(
	response: AuthenticationResponseJSON
): PrfAuthOutputs | null {
	const extensions = response.clientExtensionResults as PrfAuthExtensionResults | undefined;
	const first = extensions?.prf?.results?.first;
	if (!first) return null;
	const second = extensions?.prf?.results?.second;
	return {
		first: new Uint8Array(first),
		second: second ? new Uint8Array(second) : null
	};
}

export function getPrfFromAuthResponse(response: AuthenticationResponseJSON): Uint8Array | null {
	return getPrfOutputsFromAuthResponse(response)?.first ?? null;
}
