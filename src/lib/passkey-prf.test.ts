import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { describe, expect, it } from 'vitest';
import { DETERMINISTIC_PRF_SALT_B64URL } from './e2ee-passkey-salt';
import { preparePasskeyAuthOptionsForBrowser } from './passkey-prf';

describe('preparePasskeyAuthOptionsForBrowser', () => {
	it('converts PRF eval salts from base64url strings to ArrayBuffers', () => {
		const prepared = preparePasskeyAuthOptionsForBrowser({
			challenge: 'test',
			extensions: {
				prf: {
					eval: {
						first: DETERMINISTIC_PRF_SALT_B64URL
					}
				}
			} as PublicKeyCredentialRequestOptionsJSON['extensions']
		});

		const evalInput = (
			prepared.extensions as {
				prf?: { eval?: { first: ArrayBuffer } };
			}
		)?.prf?.eval;

		expect(evalInput?.first).toBeInstanceOf(ArrayBuffer);
		expect(evalInput?.first.byteLength).toBe(32);
	});
});
