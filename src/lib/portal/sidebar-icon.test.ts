import { describe, expect, it } from 'vitest';
import { inferSidebarIconFromTitle, resolveSidebarSessionIcon } from './sidebar-icon';

describe('inferSidebarIconFromTitle', () => {
	it('maps common delivery titles to topical icons', () => {
		expect(inferSidebarIconFromTitle('Daily Docker Monitoring')).toBe('server');
		expect(inferSidebarIconFromTitle('Gateway shutdown warning')).toBe('warning');
		expect(inferSidebarIconFromTitle('Daily French News Brief')).toBe('document');
		expect(inferSidebarIconFromTitle('Weekly Sales Summary')).toBe('chart');
		expect(inferSidebarIconFromTitle('Apple Ads Portfolio')).toBe('chart');
		expect(inferSidebarIconFromTitle('Customer onboarding packet')).toBe('document');
	});

	it('prefers explicit icons when provided', () => {
		expect(resolveSidebarSessionIcon('warning', 'Weekly Sales Summary')).toBe('warning');
	});

	it('falls back to default when title has no topical keywords', () => {
		expect(inferSidebarIconFromTitle('Encrypted delivery')).toBe('default');
		expect(resolveSidebarSessionIcon(undefined, 'Encrypted delivery')).toBe('default');
	});
});
