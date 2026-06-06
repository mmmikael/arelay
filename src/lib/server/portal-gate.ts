export const PORTAL_E2EE_SETUP_EXEMPT_PATHS = new Set(['/portal/setup', '/portal/account']);

export function resolvePortalE2eeRedirect(
	pathname: string,
	e2eeConfigured: boolean
): string | null {
	if (e2eeConfigured && pathname === '/portal/setup') {
		return '/portal';
	}
	if (!e2eeConfigured && !PORTAL_E2EE_SETUP_EXEMPT_PATHS.has(pathname)) {
		return '/portal/setup';
	}
	return null;
}
