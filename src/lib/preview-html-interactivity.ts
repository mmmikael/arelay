/**
 * Open decrypted HTML in a new browser tab without iframe sandbox restrictions.
 * Caller must only invoke this after explicit user action on content they trust.
 */
export function openTrustedHtmlInNewTab(html: string): void {
	try {
		const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		// Do not pass noopener here — browsers return null even on success, which looks like a block.
		const tab = window.open(url, '_blank');

		if (!tab) {
			URL.revokeObjectURL(url);
			throw new Error('Pop-up blocked. Allow pop-ups for this site and try again.');
		}

		tab.opener = null;
	} catch (err) {
		console.warn('[preview] open trusted HTML in new tab failed:', err);
		throw err instanceof Error ? err : new Error('Could not open HTML in a new tab');
	}
}
