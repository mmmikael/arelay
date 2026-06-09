<script lang="ts">
	import { afterNavigate, goto, invalidate } from '$app/navigation';
	import { navigating, page } from '$app/stores';
	import { clearE2eePasskeyHint } from '$lib/e2ee-passkey-hint';
	import { clearLoginHints } from '$lib/login-hint';
	import { e2eePrivateKey, resetE2eeClientState } from '$lib/e2ee-store';
	import PortalE2eeShell from '$lib/components/portal/PortalE2eeShell.svelte';
	import PortalInboxSidebar from '$lib/components/portal/PortalInboxSidebar.svelte';
	import PortalShellHeader from '$lib/components/portal/PortalShellHeader.svelte';
	import { SESSION_UPDATED_AT_LOOKUP_KEY, type SessionUpdatedAtLookup } from '$lib/portal-context';
	import { loadSidebarSessionTitles } from '$lib/portal/inbox-sidebar-titles';
	import {
		markSessionPrefetched,
		prefetchSessionPages,
		resetSessionPrefetch,
		toPrefetchSessions,
		warmPrefetchedSessions
	} from '$lib/session-prefetch';
	import { onMount, setContext } from 'svelte';
	import type { LayoutData } from './$types';

	const POLL_MS = 5000;
	const NAV_PENDING_TIMEOUT_MS = 5_000;

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	let e2eeShell: PortalE2eeShell | undefined = $state();
	let handleShieldClick = $state<() => void | Promise<void>>(() => {});
	let pendingSessionId = $state<string | null>(null);
	let decryptedSessions = $state<Record<string, { title: string; summary: string | null }>>({});

	const activeSessionId = $derived($page.params.sessionId ?? null);
	const isAccountPage = $derived($page.url.pathname === '/portal/account');
	const isSetupPage = $derived($page.url.pathname === '/portal/setup');
	const showMobileDetail = $derived(Boolean(activeSessionId) || isAccountPage || isSetupPage);
	const navigatingToSessionId = $derived.by(() => {
		const pathname = $navigating?.to?.url.pathname;
		if (!pathname?.startsWith('/portal/')) return null;
		const sessionId = pathname.slice('/portal/'.length).split('/')[0];
		return sessionId || null;
	});
	const unreadCount = $derived(data.sessions.filter((session) => !session.is_read).length);
	const prefetchSessions = $derived(
		toPrefetchSessions(data.sessions, data.emailDraftSummaries)
	);

	const sessionUpdatedAtLookup: SessionUpdatedAtLookup = (sessionId) =>
		data.sessions.find((entry) => entry.id === sessionId)?.updated_at;
	setContext(SESSION_UPDATED_AT_LOOKUP_KEY, sessionUpdatedAtLookup);

	async function logout() {
		await fetch('/api/logout', { method: 'POST' });
		clearE2eePasskeyHint();
		clearLoginHints();
		resetE2eeClientState();
		resetSessionPrefetch();
		goto('/', { replaceState: true });
	}

	afterNavigate(({ to }) => {
		pendingSessionId = null;
		const sessionId = to?.params?.sessionId;
		if (typeof sessionId === 'string') {
			const session = data.sessions.find((entry) => entry.id === sessionId);
			markSessionPrefetched(sessionId, session?.updated_at);
		}
	});

	$effect(() => {
		if (pendingSessionId && activeSessionId === pendingSessionId) {
			pendingSessionId = null;
		}
	});

	$effect(() => {
		const pendingId = pendingSessionId;
		if (!pendingId || activeSessionId === pendingId) return;

		const timer = setTimeout(() => {
			if (pendingSessionId === pendingId) {
				pendingSessionId = null;
			}
		}, NAV_PENDING_TIMEOUT_MS);

		return () => clearTimeout(timer);
	});

	$effect(() => {
		void prefetchSessionPages(prefetchSessions);
	});

	$effect(() => {
		const privateKey = $e2eePrivateKey;
		if (!privateKey) {
			decryptedSessions = {};
			return;
		}

		let cancelled = false;
		const warmAndDecryptSidebar = async () => {
			await warmPrefetchedSessions(privateKey, prefetchSessions);
			const next = await loadSidebarSessionTitles(
				data.sessions,
				data.emailDraftSummaries,
				privateKey
			);
			if (!cancelled) decryptedSessions = next;
		};

		void warmAndDecryptSidebar();
		return () => {
			cancelled = true;
		};
	});

	onMount(() => {
		void e2eeShell?.loadE2eeConfig();

		let timer: ReturnType<typeof setInterval> | null = null;

		const refresh = () => {
			if (document.hidden) return;
			void Promise.all([invalidate('inbox:sessions'), invalidate('account:storage')]);
		};

		const start = () => {
			if (timer) return;
			timer = setInterval(refresh, POLL_MS);
		};

		const stop = () => {
			if (!timer) return;
			clearInterval(timer);
			timer = null;
		};

		const onVisibility = () => {
			if (document.hidden) {
				stop();
				return;
			}
			refresh();
			start();
		};

		start();
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			stop();
			document.removeEventListener('visibilitychange', onVisibility);
		};
	});
</script>

<PortalE2eeShell
	bind:this={e2eeShell}
	passkeys={data.passkeys}
	{isSetupPage}
	onShieldClickChange={(handler) => {
		handleShieldClick = handler;
	}}
>
	<div class="flex h-[100dvh] min-h-screen flex-col overflow-hidden bg-white sm:bg-slate-50 dark:bg-slate-950">
		<PortalShellHeader
			currentUserEmail={data.currentUser?.email}
			{unreadCount}
			sessionCount={data.sessions.length}
			{showMobileDetail}
			{isAccountPage}
			onShieldClick={handleShieldClick}
			onLogout={logout}
		/>

		<div class="relative flex min-h-0 flex-1 overflow-hidden">
			<PortalInboxSidebar
				sessions={data.sessions}
				emailDraftSummaries={data.emailDraftSummaries}
				{decryptedSessions}
				{activeSessionId}
				{navigatingToSessionId}
				{showMobileDetail}
				{unreadCount}
				bind:pendingSessionId
			/>

			<main
				class="min-w-0 overflow-y-auto bg-slate-50 dark:bg-slate-950 {showMobileDetail
					? 'flex-1'
					: 'hidden sm:block sm:flex-1'} sm:p-6"
			>
				{@render children()}
			</main>
		</div>
	</div>
</PortalE2eeShell>
