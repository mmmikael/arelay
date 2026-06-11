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
	import {
		loadSidebarSessionTitles,
		type SidebarSessionMeta
	} from '$lib/portal/inbox-sidebar-titles';
	import {
		markSessionPrefetched,
		prefetchSessionPages,
		resetSessionPrefetch,
		toPrefetchSessions,
		warmPrefetchedSessions,
		warmSessionById
	} from '$lib/session-prefetch';
	import { onMount, setContext, untrack } from 'svelte';
	import type { LayoutData } from './$types';

	const POLL_MS = 5000;
	const POLL_MAX_BACKOFF_MS = 60_000;
	const NAV_PENDING_TIMEOUT_MS = 5_000;
	// Roughly one sidebar viewport of sessions; matches the sidebar's own hint.
	const INITIAL_DECRYPT_PRIORITY_COUNT = 8;

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	let e2eeShell: PortalE2eeShell | undefined = $state();
	let handleShieldClick = $state<() => void | Promise<void>>(() => {});
	let pendingSessionId = $state<string | null>(null);
	let visibleSessionIds = $state<string[]>([]);
	let decryptedSessions = $state<Record<string, SidebarSessionMeta>>({});

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
	// Navigation targets first, then whatever the sidebar reports as visible.
	const prioritySessionIds = $derived.by(() => {
		const ids = new Set<string>();
		const add = (id: string | null | undefined) => {
			if (id) ids.add(id);
		};
		add(activeSessionId);
		add(navigatingToSessionId);
		add(pendingSessionId);
		for (const id of visibleSessionIds) ids.add(id);
		return [...ids];
	});

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
		void prefetchSessionPages(prefetchSessions, prioritySessionIds);
	});

	$effect(() => {
		const privateKey = $e2eePrivateKey;
		const sessions = data.sessions;
		const emailDraftSummaries = data.emailDraftSummaries;
		if (!privateKey) {
			decryptedSessions = {};
			return;
		}

		// Snapshot at unlock/data refresh; avoid restarting decrypt on scroll.
		// Seed with the top of the session list: this effect runs before the
		// sidebar reports visibility, and the first rows are what's on screen.
		const priorities = untrack(() => [
			...prioritySessionIds,
			...sessions.slice(0, INITIAL_DECRYPT_PRIORITY_COUNT).map((session) => session.id)
		]);
		// Local accumulator: the callback must not read `decryptedSessions`,
		// or cached (synchronous) entries make this effect depend on its own output.
		const progressive = untrack(() => ({ ...decryptedSessions }));
		let cancelled = false;

		void (async () => {
			// Defer past a microtask so cache hits never run inside effect tracking.
			await Promise.resolve();
			if (cancelled) return;
			const next = await loadSidebarSessionTitles(sessions, emailDraftSummaries, privateKey, {
				prioritySessionIds: priorities,
				isCancelled: () => cancelled,
				onSessionDecrypted: (sessionId, meta) => {
					if (cancelled) return;
					progressive[sessionId] = meta;
					decryptedSessions = { ...progressive };
				}
			});
			if (!cancelled) decryptedSessions = next;
		})();

		return () => {
			cancelled = true;
		};
	});

	// Tracks priorities live (unlike the decrypt snapshot above) so scrolling
	// re-prioritizes metadata warming; warmed/in-flight guards keep re-runs cheap.
	$effect(() => {
		const privateKey = $e2eePrivateKey;
		if (!privateKey) return;
		void warmPrefetchedSessions(privateKey, prefetchSessions, prioritySessionIds, {
			warmArtifactBytes: false
		});
	});

	$effect(() => {
		const privateKey = $e2eePrivateKey;
		const sessionId = activeSessionId;
		if (!privateKey || !sessionId) return;
		void warmSessionById(sessionId, privateKey, { warmArtifactBytes: true });
	});

	// Baseline for the poll; kept in sync with layout reloads so a refetch
	// triggered elsewhere (mark read, delete, ...) does not re-invalidate.
	let lastInboxVersion: string | null = null;
	$effect(() => {
		lastInboxVersion = data.inboxVersion;
	});

	onMount(() => {
		void e2eeShell?.loadE2eeConfig();

		let timer: ReturnType<typeof setTimeout> | null = null;
		let stopped = false;
		let pollFailures = 0;

		// Poll a tiny version endpoint and only refetch the layout payload when
		// something changed; back off while the network is failing.
		const refresh = async () => {
			try {
				const response = await fetch('/api/inbox/version');
				if (!response.ok) throw new Error(`poll failed: ${response.status}`);
				const body = (await response.json()) as { version?: string };
				pollFailures = 0;
				const version = body.version ?? '';
				if (version === lastInboxVersion) return;
				await Promise.all([invalidate('inbox:sessions'), invalidate('account:storage')]);
				// $effect syncs lastInboxVersion from data.inboxVersion after reload.
			} catch {
				pollFailures += 1;
			}
		};

		const pollDelay = () =>
			Math.min(POLL_MS * 2 ** Math.min(pollFailures, 8), POLL_MAX_BACKOFF_MS);

		const schedule = () => {
			if (stopped || timer) return;
			timer = setTimeout(run, pollDelay());
		};

		const run = async () => {
			timer = null;
			if (!document.hidden) {
				await refresh();
			}
			if (!document.hidden) schedule();
		};

		const stop = () => {
			if (!timer) return;
			clearTimeout(timer);
			timer = null;
		};

		const onVisibility = () => {
			if (document.hidden) {
				stop();
				return;
			}
			stop();
			void run();
		};

		schedule();
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			stopped = true;
			stop();
			document.removeEventListener('visibilitychange', onVisibility);
		};
	});
</script>

<svelte:head>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

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
				bind:pendingSessionId
				bind:visibleSessionIds
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
