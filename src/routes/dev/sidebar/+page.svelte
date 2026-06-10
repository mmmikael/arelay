<script lang="ts">
	import PortalInboxSidebar from '$lib/components/portal/PortalInboxSidebar.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { ENSURE_E2EE_UNLOCK_KEY } from '$lib/portal-context';
	import { DEV_SIDEBAR_FIXTURES, fixturesToSidebarProps } from '$lib/portal/sidebar-fixtures';
	import { setContext } from 'svelte';

	const { sessions, decryptedSessions } = fixturesToSidebarProps(DEV_SIDEBAR_FIXTURES);
	const emailDraftSummaries = {
		'session-email-draft': { status: 'pending', updated_at: new Date().toISOString() }
	};

	setContext(ENSURE_E2EE_UNLOCK_KEY, async () => true);
</script>

<svelte:head>
	<title>Sessions sidebar preview</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="flex h-[100dvh] bg-white dark:bg-slate-950" style="--sidebar-width: 400px;">
	<div class="absolute right-4 top-4 z-40">
		<ThemeToggle />
	</div>
	<PortalInboxSidebar
		{sessions}
		{emailDraftSummaries}
		{decryptedSessions}
		activeSessionId="session-docker"
		navigatingToSessionId={null}
		showMobileDetail={false}
	/>
	<div class="hidden min-w-0 flex-1 bg-slate-50 dark:bg-slate-950 sm:block"></div>
</div>
