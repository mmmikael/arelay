import { describe, expect, it } from 'vitest';
import { DETERMINISTIC_PRF_SALT_B64URL, deterministicPrfSaltBytes } from './e2ee-passkey-salt';

describe('deterministic passkey PRF salt', () => {
	it('stays stable so already-wrapped private keys remain unlockable', () => {
		expect(DETERMINISTIC_PRF_SALT_B64URL).toBe('MNenXh_BrX2B04t4zsKc-hylKPhogXf3SuRzgON9V14');
		expect(deterministicPrfSaltBytes()).toHaveLength(32);
	});
});
