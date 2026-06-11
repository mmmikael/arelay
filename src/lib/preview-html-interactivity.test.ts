import { afterEach, describe, expect, it, vi } from 'vitest';
import { openTrustedHtmlInNewTab } from './preview-html-interactivity';

describe('openTrustedHtmlInNewTab', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('opens a blob URL in a new tab and clears opener', () => {
		const tab = { closed: false, opener: {} as Window | null };
		const open = vi.fn(() => tab);
		vi.stubGlobal('window', { open });
		vi.stubGlobal('URL', {
			createObjectURL: vi.fn(() => 'blob:preview'),
			revokeObjectURL: vi.fn()
		});

		openTrustedHtmlInNewTab('<!doctype html><html><body>Hi</body></html>');

		expect(open).toHaveBeenCalledWith('blob:preview', '_blank');
		expect(tab.opener).toBeNull();
	});

	it('throws and revokes when pop-ups are blocked', () => {
		const revokeObjectURL = vi.fn();
		vi.stubGlobal('window', { open: vi.fn(() => null) });
		vi.stubGlobal('URL', {
			createObjectURL: vi.fn(() => 'blob:preview'),
			revokeObjectURL
		});

		expect(() => openTrustedHtmlInNewTab('<p>Hi</p>')).toThrow(/Pop-up blocked/);
		expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview');
	});
});
