import { describe, expect, it } from 'vitest';
import { emailDraftStatusLabel } from './email-draft-status';

describe('emailDraftStatusLabel', () => {
	it('uses compact pending label in the sidebar', () => {
		expect(emailDraftStatusLabel('pending', 'sidebar')).toBe('Pending');
	});

	it('uses action-oriented pending label in the detail panel', () => {
		expect(emailDraftStatusLabel('pending', 'detail')).toBe('Needs your approval');
	});
});
