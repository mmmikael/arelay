import type { SidebarSessionIcon } from '$lib/portal/sidebar-types';

/** Best-effort icon from session title until the API stores an explicit icon. */
export function inferSidebarIconFromTitle(title: string): SidebarSessionIcon {
	const normalized = title.toLowerCase();

	if (
		/\b(docker|server|monitor|deploy|staging|infra|host)\b/.test(normalized)
	) {
		return 'server';
	}
	if (/\b(warning|shutdown|alert|security|scan|vulnerab)\b/.test(normalized)) {
		return 'warning';
	}
	if (
		/\b(sales|report|weekly|inventory|reconcil|ads|portfolio|apple|marketing|performance)\b/.test(
			normalized
		)
	) {
		return 'chart';
	}
	if (/\b(news|brief|onboarding|packet|digest)\b/.test(normalized)) {
		return 'document';
	}

	return 'default';
}

export function resolveSidebarSessionIcon(
	explicit: SidebarSessionIcon | undefined,
	title: string
): SidebarSessionIcon {
	return explicit ?? inferSidebarIconFromTitle(title);
}
