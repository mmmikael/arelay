<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { e2eeConfig, e2eePrivateKey } from '$lib/e2ee-store';
	import { emailDraftStatusClass, emailDraftStatusLabel } from '$lib/email-draft-status';
	import { ENSURE_E2EE_UNLOCK_KEY, type EnsureE2eeUnlock } from '$lib/portal-context';
	import { resolveSidebarSessionIcon } from '$lib/portal/sidebar-icon';
	import {
		EMAIL_DRAFT_SIDEBAR_DESCRIPTION,
		SIDEBAR_ARCHIVE_FILTER_ENABLED,
		type SidebarDecryptedMeta,
		type SidebarFilter,
		type SidebarSessionIcon
	} from '$lib/portal/sidebar-types';
	import {
		forgetSessionPrefetch,
		prefetchSessionOnIntent,
		warmSessionById
	} from '$lib/session-prefetch';
	import Archive from '@lucide/svelte/icons/archive';
	import BarChart3 from '@lucide/svelte/icons/bar-chart-3';
	import Check from '@lucide/svelte/icons/check';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import FileText from '@lucide/svelte/icons/file-text';
	import Inbox from '@lucide/svelte/icons/inbox';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Mail from '@lucide/svelte/icons/mail';
	import MailOpen from '@lucide/svelte/icons/mail-open';
	import Server from '@lucide/svelte/icons/server';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import { getContext, onMount } from 'svelte';

	const VISIBLE_SESSION_ROOT_MARGIN = '80px 0px';
	const INITIAL_VISIBLE_SESSION_HINT = 8;

	const SIDEBAR_KEY = 'agentRelay:sidebarCollapsed';
	const SIDEBAR_WIDTH_KEY = 'agentRelay:sidebarWidth';
	const SIDEBAR_MIN_WIDTH = 300;
	const SIDEBAR_MAX_WIDTH = 560;
	const SIDEBAR_DEFAULT_WIDTH = 380;
	const TAP_MOVE_THRESHOLD = 10;
	const CLICK_SUPPRESS_MS = 450;

	type SessionRow = {
		id: string;
		updated_at: string | Date;
		encryption_version: string;
		encrypted_title?: unknown;
		encrypted_summary?: unknown;
		is_read: boolean;
		artifact_count?: number;
		is_archived?: boolean;
	};

	type EmailDraftSummary = {
		status: string;
		updated_at?: string | Date;
	};

	type SessionPointer = {
		id: string;
		x: number;
		y: number;
		moved: boolean;
	};

	type SuppressedSessionClick = {
		id: string;
		until: number;
	};

	const FILTER_OPTIONS: { id: SidebarFilter; label: string; icon?: 'mail' }[] = [
		{ id: 'all', label: 'All' },
		{ id: 'unread', label: 'Unread' },
		{ id: 'email', label: 'Email', icon: 'mail' },
		{ id: 'files', label: 'Files' },
		...(SIDEBAR_ARCHIVE_FILTER_ENABLED ? [{ id: 'archived' as const, label: 'Archived' }] : [])
	];

	let {
		sessions,
		emailDraftSummaries,
		decryptedSessions,
		activeSessionId,
		navigatingToSessionId,
		showMobileDetail,
		pendingSessionId = $bindable<string | null>(null),
		visibleSessionIds = $bindable<string[]>([])
	}: {
		sessions: SessionRow[];
		emailDraftSummaries: Record<string, EmailDraftSummary | undefined>;
		decryptedSessions: Record<string, SidebarDecryptedMeta>;
		activeSessionId: string | null;
		navigatingToSessionId: string | null;
		showMobileDetail: boolean;
		pendingSessionId?: string | null;
		visibleSessionIds?: string[];
	} = $props();

	const ensureE2eeUnlocked = getContext<EnsureE2eeUnlock>(ENSURE_E2EE_UNLOCK_KEY);

	let deleteDialogOpen = $state(false);
	let deleteTargetIds = $state<string[]>([]);
	let deleting = $state(false);
	let removedSessionIds = $state<Set<string>>(new Set());
	let selectionMode = $state(false);
	let selectedIds = $state<Set<string>>(new Set());
	let markingReadSessionId = $state<string | null>(null);
	let sessionPointer = $state<SessionPointer | null>(null);
	let suppressedSessionClick = $state<SuppressedSessionClick | null>(null);
	let sidebarCollapsed = $state(false);
	let sidebarWidth = $state(SIDEBAR_DEFAULT_WIDTH);
	let isResizing = $state(false);
	let isDesktop = $state(false);
	let activeFilter = $state<SidebarFilter>('all');
	let sessionScrollEl = $state<HTMLDivElement | undefined>(undefined);

	const effectiveSidebarCollapsed = $derived(isDesktop && sidebarCollapsed);

	// Sessions the server still reports but that the user has already deleted in
	// this session are hidden immediately (optimistic removal); the actual DELETE
	// runs in the background. Everything visible derives from this list.
	const availableSessions = $derived(
		sessions.filter((session) => !removedSessionIds.has(session.id))
	);

	const activeSessionCount = $derived(
		availableSessions.filter((session) => !session.is_archived).length
	);

	const filteredSessions = $derived.by(() => {
		switch (activeFilter) {
			case 'unread':
				return availableSessions.filter((session) => !session.is_read && !session.is_archived);
			case 'email':
				return availableSessions.filter(
					(session) => Boolean(emailDraftSummaries[session.id]) && !session.is_archived
				);
			case 'files':
				return availableSessions.filter(
					(session) => (session.artifact_count ?? 0) > 0 && !session.is_archived
				);
			case 'archived':
				return availableSessions.filter((session) => session.is_archived);
			default:
				return availableSessions.filter((session) => !session.is_archived);
		}
	});

	const allFilteredSelected = $derived(
		filteredSessions.length > 0 && filteredSessions.every((session) => selectedIds.has(session.id))
	);

	// Once the server load reflects a deletion (the id is gone from `sessions`),
	// drop it from the optimistic-removal and selection sets so they don't grow
	// unbounded and so a future session reusing the id wouldn't stay hidden.
	$effect(() => {
		const present = new Set(sessions.map((session) => session.id));
		let removedChanged = false;
		for (const id of removedSessionIds) {
			if (!present.has(id)) removedChanged = true;
		}
		if (removedChanged) {
			removedSessionIds = new Set([...removedSessionIds].filter((id) => present.has(id)));
		}
		let selectedChanged = false;
		for (const id of selectedIds) {
			if (!present.has(id)) selectedChanged = true;
		}
		if (selectedChanged) {
			selectedIds = new Set([...selectedIds].filter((id) => present.has(id)));
		}
	});

	function sessionMeta(session: SessionRow): SidebarDecryptedMeta {
		return (
			decryptedSessions[session.id] ?? {
				title: displaySessionTitle(session),
				summary: displaySessionSummary(session)
			}
		);
	}

	function sessionIconKind(
		session: SessionRow,
		emailDraft: EmailDraftSummary | undefined
	): SidebarSessionIcon {
		if (emailDraft) return 'email';
		const meta = sessionMeta(session);
		return resolveSidebarSessionIcon(meta.icon, meta.title);
	}

	function displaySessionCardSummary(
		session: SessionRow,
		emailDraft: EmailDraftSummary | undefined
	): string | null {
		if (emailDraft) return EMAIL_DRAFT_SIDEBAR_DESCRIPTION;
		return sessionMeta(session).summary;
	}

	function iconContainerClass(iconKind: SidebarSessionIcon): string {
		switch (iconKind) {
			case 'server':
				return 'bg-blue-50 text-[#2563eb] dark:bg-blue-950/60 dark:text-blue-300';
			case 'warning':
				return 'bg-orange-50 text-orange-500 dark:bg-orange-950/40 dark:text-orange-400';
			case 'document':
				return 'bg-violet-50 text-violet-500 dark:bg-violet-950/40 dark:text-violet-400';
			case 'chart':
				return 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400';
			case 'email':
				return 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400';
			default:
				return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
		}
	}

	function formatRelativeSessionDate(iso: string | Date): string {
		const date = new Date(iso);
		const now = new Date();
		const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
		const dayDiff = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86_400_000);
		const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

		if (dayDiff === 0) return `Today ${time}`;
		if (dayDiff === 1) return 'Yesterday';
		if (dayDiff > 1) return `${dayDiff} days ago`;
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function formatFileCount(count: number): string {
		return `${count} file${count === 1 ? '' : 's'}`;
	}

	type MetadataPart =
		| { kind: 'text'; text: string; unread?: boolean }
		| { kind: 'email-draft'; status: string };

	function sessionMetadataParts(
		session: SessionRow,
		emailDraft: EmailDraftSummary | undefined
	): MetadataPart[] {
		const parts: MetadataPart[] = [
			{ kind: 'text', text: formatRelativeSessionDate(session.updated_at) }
		];
		const fileCount = session.artifact_count ?? 0;
		if (fileCount > 0) {
			parts.push({ kind: 'text', text: formatFileCount(fileCount) });
		}
		if (emailDraft) {
			parts.push({ kind: 'email-draft', status: emailDraft.status });
		}
		if (!session.is_read) {
			parts.push({ kind: 'text', text: 'Unread', unread: true });
		}
		return parts;
	}

	function filterEmptyState(filter: SidebarFilter): { title: string; description: string } {
		switch (filter) {
			case 'unread':
				return {
					title: 'No unread sessions',
					description: 'You are caught up. New deliveries will appear here when they arrive.'
				};
			case 'email':
				return {
					title: 'No email drafts',
					description: 'Outbound email drafts awaiting review will show up here.'
				};
			case 'files':
				return {
					title: 'No file deliveries',
					description: 'Sessions with attached files will appear in this filter.'
				};
			case 'archived':
				return {
					title: 'No archived sessions',
					description: 'Archived sessions will appear here once archiving is available.'
				};
			default:
				return {
					title: 'No sessions yet',
					description: 'New agent deliveries will show up here as sessions.'
				};
		}
	}

	const emptyState = $derived(filterEmptyState(activeFilter));

	function isEncryptedSession(session: SessionRow): boolean {
		return session.encryption_version === 'e2ee-v1';
	}

	function displaySessionTitle(session: SessionRow): string {
		return decryptedSessions[session.id]?.title ?? 'Encrypted delivery';
	}

	function displaySessionSummary(session: SessionRow): string | null {
		return decryptedSessions[session.id]?.summary ?? 'Unlock encryption to view this session.';
	}

	function beginSessionNavigation(id: string, event?: PointerEvent | MouseEvent) {
		if (event && event.button !== 0) return;
		if (activeSessionId === id) return;
		pendingSessionId = id;
		const session = sessions.find((entry) => entry.id === id);
		if (session) {
			const prefetchSession = {
				id: session.id,
				updated_at: session.updated_at,
				email_draft_updated_at: emailDraftSummaries[session.id]?.updated_at ?? null
			};
			prefetchSessionOnIntent(prefetchSession, [session.id]);
			const privateKey = $e2eePrivateKey;
			if (privateKey) {
				void warmSessionById(session.id, privateKey, { warmArtifactBytes: false });
			}
		}
	}

	function confirmDeleteSession(id: string, event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		deleteTargetIds = [id];
		deleteDialogOpen = true;
	}

	function enterSelectionMode() {
		selectionMode = true;
		selectedIds = new Set();
	}

	function exitSelectionMode() {
		selectionMode = false;
		selectedIds = new Set();
	}

	function toggleSessionSelected(id: string) {
		const next = new Set(selectedIds);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		selectedIds = next;
	}

	function toggleSelectAll() {
		if (allFilteredSelected) {
			selectedIds = new Set();
		} else {
			selectedIds = new Set(filteredSessions.map((session) => session.id));
		}
	}

	function confirmDeleteSelected() {
		if (selectedIds.size === 0) return;
		deleteTargetIds = [...selectedIds];
		deleteDialogOpen = true;
	}

	function startSessionPointer(id: string, event: PointerEvent) {
		if (selectionMode) return;
		if (event.button !== 0) return;
		sessionPointer = {
			id,
			x: event.clientX,
			y: event.clientY,
			moved: false
		};
	}

	function moveSessionPointer(event: PointerEvent) {
		if (!sessionPointer) return;

		const moved =
			Math.abs(event.clientX - sessionPointer.x) > TAP_MOVE_THRESHOLD ||
			Math.abs(event.clientY - sessionPointer.y) > TAP_MOVE_THRESHOLD;
		if (moved && !sessionPointer.moved) {
			sessionPointer = { ...sessionPointer, moved: true };
		}
	}

	function suppressSessionClick(id: string) {
		suppressedSessionClick = { id, until: Date.now() + CLICK_SUPPRESS_MS };
	}

	function finishSessionPointer(id: string, event: PointerEvent) {
		if (selectionMode) return;
		if (event.button !== 0) return;

		const start = sessionPointer;
		sessionPointer = null;
		if (!start || start.id !== id) return;

		if (start.moved) {
			suppressSessionClick(id);
			return;
		}

		beginSessionNavigation(id, event);
	}

	function cancelSessionPointer() {
		if (sessionPointer?.moved) {
			suppressSessionClick(sessionPointer.id);
		}
		sessionPointer = null;
	}

	async function handleSessionClick(id: string, event: MouseEvent) {
		if (selectionMode) {
			event.preventDefault();
			toggleSessionSelected(id);
			return;
		}

		if (suppressedSessionClick) {
			if (suppressedSessionClick.until < Date.now()) {
				suppressedSessionClick = null;
			} else if (suppressedSessionClick.id === id) {
				suppressedSessionClick = null;
				return;
			}
		}

		const session = sessions.find((entry) => entry.id === id);
		const needsUnlock =
			session &&
			isEncryptedSession(session) &&
			!$e2eePrivateKey &&
			$e2eeConfig.configured;

		if (needsUnlock) {
			event.preventDefault();
			const unlocked = await ensureE2eeUnlocked();
			if (!unlocked) {
				pendingSessionId = null;
				return;
			}
			if (activeSessionId !== id) {
				pendingSessionId = id;
				await goto(`/portal/${id}`);
			}
			return;
		}

		beginSessionNavigation(id, event);
	}

	async function setSessionReadState(id: string, isRead: boolean, event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		if (markingReadSessionId) return;

		markingReadSessionId = id;
		try {
			const res = await fetch(`/api/sessions/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ is_read: isRead })
			});
			if (!res.ok) throw new Error(isRead ? 'Mark read failed' : 'Mark unread failed');
			await Promise.all([invalidate('inbox:sessions'), invalidate('account:storage')]);
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Could not update read state');
		} finally {
			markingReadSessionId = null;
		}
	}

	async function doDeleteSessions() {
		const ids = deleteTargetIds;
		if (ids.length === 0 || deleting) return;

		// Hide the sessions from the UI right away, then delete in the background —
		// the list updates instantly instead of waiting on the network round-trip.
		removedSessionIds = new Set([...removedSessionIds, ...ids]);
		for (const id of ids) forgetSessionPrefetch(id);
		selectionMode = false;
		selectedIds = new Set();
		deleteDialogOpen = false;
		deleteTargetIds = [];

		// If the open session was deleted, leave the detail view.
		if (activeSessionId && ids.includes(activeSessionId)) {
			await goto('/portal', { replaceState: true });
		}

		const results = await Promise.allSettled(
			ids.map((id) => fetch(`/api/sessions/${id}`, { method: 'DELETE' }))
		);

		// Restore any sessions whose deletion failed so they reappear in the list.
		const failedIds = ids.filter((_, index) => {
			const result = results[index];
			return result.status === 'rejected' || !result.value.ok;
		});
		if (failedIds.length > 0) {
			const restored = new Set(removedSessionIds);
			for (const id of failedIds) restored.delete(id);
			removedSessionIds = restored;
			alert(
				failedIds.length === ids.length
					? 'Delete failed'
					: `Failed to delete ${failedIds.length} of ${ids.length} sessions`
			);
		}

		await Promise.all([invalidate('inbox:sessions'), invalidate('account:storage')]);
	}

	function toggleSidebar() {
		sidebarCollapsed = !sidebarCollapsed;
		try {
			localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed ? '1' : '0');
		} catch {}
	}

	function clampSidebarWidth(width: number): number {
		return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
	}

	function saveSidebarWidth() {
		try {
			localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
		} catch {}
	}

	function startSidebarResize(event: PointerEvent) {
		if (effectiveSidebarCollapsed || !isDesktop) return;

		const handle = event.currentTarget as HTMLElement;
		handle.setPointerCapture(event.pointerId);
		isResizing = true;

		const startX = event.clientX;
		const startWidth = sidebarWidth;

		const onMove = (ev: PointerEvent) => {
			sidebarWidth = clampSidebarWidth(startWidth + (ev.clientX - startX));
		};

		const onEnd = (ev: PointerEvent) => {
			isResizing = false;
			handle.releasePointerCapture(ev.pointerId);
			handle.removeEventListener('pointermove', onMove);
			handle.removeEventListener('pointerup', onEnd);
			handle.removeEventListener('pointercancel', onEnd);
			document.body.style.cursor = '';
			document.body.style.userSelect = '';
			saveSidebarWidth();
		};

		document.body.style.cursor = 'col-resize';
		document.body.style.userSelect = 'none';
		handle.addEventListener('pointermove', onMove);
		handle.addEventListener('pointerup', onEnd);
		handle.addEventListener('pointercancel', onEnd);
	}

	const sidebarStyle = $derived.by(() => {
		if (effectiveSidebarCollapsed) return 'width: 0px';
		return `--sidebar-width: ${sidebarWidth}px`;
	});

	function initialVisibleSessionIds(sessions: SessionRow[]): string[] {
		const ids: string[] = [];
		for (const session of sessions) {
			ids.push(session.id);
			if (ids.length >= INITIAL_VISIBLE_SESSION_HINT) break;
		}
		return ids;
	}

	$effect(() => {
		const scrollRoot = sessionScrollEl;
		const sessions = filteredSessions;
		const sidebarVisible = !effectiveSidebarCollapsed && (!showMobileDetail || isDesktop);

		if (!scrollRoot || !sidebarVisible || sessions.length === 0) {
			visibleSessionIds = [];
			return;
		}

		visibleSessionIds = initialVisibleSessionIds(sessions);

		const visibility = new Map<string, boolean>();
		for (const session of sessions) {
			visibility.set(session.id, false);
		}

		const observer = new IntersectionObserver(
			(entries) => {
				let changed = false;
				for (const entry of entries) {
					const sessionId = entry.target.getAttribute('data-session-id');
					if (!sessionId || !visibility.has(sessionId)) continue;
					const nextVisible = entry.isIntersecting;
					if (visibility.get(sessionId) === nextVisible) continue;
					visibility.set(sessionId, nextVisible);
					changed = true;
				}
				if (changed) {
					// Use the effect-local snapshot, not live `filteredSessions`,
					// so a late observer callback can't emit IDs from a newer filter.
					visibleSessionIds = sessions
						.filter((session) => visibility.get(session.id))
						.map((session) => session.id);
				}
			},
			{
				root: scrollRoot,
				rootMargin: VISIBLE_SESSION_ROOT_MARGIN,
				threshold: 0
			}
		);

		const items = scrollRoot.querySelectorAll<HTMLElement>('[data-session-id]');
		for (const item of items) observer.observe(item);

		return () => observer.disconnect();
	});

	onMount(() => {
		try {
			sidebarCollapsed = localStorage.getItem(SIDEBAR_KEY) === '1';
			const savedWidth = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
			if (Number.isFinite(savedWidth)) {
				sidebarWidth = clampSidebarWidth(savedWidth);
			}
		} catch {}

		const desktopQuery = window.matchMedia('(min-width: 640px)');
		const updateDesktop = () => {
			isDesktop = desktopQuery.matches;
		};
		updateDesktop();
		desktopQuery.addEventListener('change', updateDesktop);
		return () => desktopQuery.removeEventListener('change', updateDesktop);
	});
</script>

{#if effectiveSidebarCollapsed && isDesktop}
	<button
		type="button"
		onclick={toggleSidebar}
		title="Show sessions"
		aria-label="Show sessions"
		aria-expanded={false}
		class="absolute left-4 top-4 z-30 hidden items-center gap-2 rounded-lg border border-slate-200 bg-white/95 px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-md backdrop-blur-sm transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-200 dark:hover:border-blue-900 dark:hover:bg-blue-950/80 dark:hover:text-slate-100 sm:inline-flex"
	>
		<Inbox class="h-4 w-4 text-[#2563eb] dark:text-blue-300" />
		<span>Sessions</span>
		<span
			class="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-[#2563eb] dark:bg-blue-950/60 dark:text-blue-300"
		>
			{activeSessionCount} active
		</span>
		<ChevronRight class="h-4 w-4 text-slate-400 dark:text-slate-500" />
	</button>
{/if}

<div
	class="relative flex shrink-0 flex-col min-h-0 overflow-hidden border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950
		{showMobileDetail ? 'hidden sm:flex' : 'flex w-full'}
		{effectiveSidebarCollapsed ? 'sm:w-0 sm:border-0' : 'w-full sm:w-[var(--sidebar-width)] sm:border-r'}
		{!isResizing && !effectiveSidebarCollapsed
		? 'transition-[width,border-color] duration-300 ease-in-out'
		: ''}"
	style={sidebarStyle}
	aria-hidden={effectiveSidebarCollapsed || (!isDesktop && showMobileDetail)}
>
	<div class="min-w-0 border-b border-slate-200 px-4 pb-3.5 pt-4 dark:border-slate-800 sm:px-4">
		<div class="flex items-center justify-between gap-2">
			<div class="flex min-w-0 items-center gap-2">
				<h2 class="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
					Sessions
				</h2>
				<span
					class="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-[#2563eb] dark:bg-blue-950/60 dark:text-blue-300"
				>
					{activeSessionCount} active
				</span>
			</div>
			<button
				type="button"
				onclick={toggleSidebar}
				title="Hide sessions"
				aria-label="Hide sessions"
				aria-expanded={true}
				class="hidden shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-slate-800 dark:hover:text-slate-300 sm:block"
			>
				<ChevronLeft class="h-4 w-4" />
			</button>
		</div>
		<p class="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">
			Work delivered by your agents
		</p>

		<div class="mt-3.5 flex items-center gap-2">
			<div
				class="flex min-w-0 flex-1 flex-nowrap gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
			>
				{#each FILTER_OPTIONS as filter (filter.id)}
					<button
						type="button"
						onclick={() => {
							activeFilter = filter.id;
						}}
						class="inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[13px] font-medium transition-colors {activeFilter ===
						filter.id
							? 'border-[#2563eb] bg-blue-50 text-[#2563eb] dark:border-blue-400 dark:bg-blue-950/50 dark:text-blue-300'
							: 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600'}"
					>
						{#if filter.icon === 'mail'}
							<Mail class="h-3 w-3 shrink-0" aria-hidden="true" />
						{/if}
						{filter.label}
					</button>
				{/each}
			</div>
			{#if availableSessions.length > 0 && !selectionMode}
				<button
					type="button"
					onclick={enterSelectionMode}
					class="shrink-0 whitespace-nowrap border-l border-slate-200 pl-2.5 text-[13px] font-medium text-slate-600 transition-colors hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:text-slate-100"
				>
					Select
				</button>
			{/if}
		</div>

		{#if availableSessions.length > 0 && selectionMode}
			<div class="mt-3 flex min-h-[28px] items-center justify-between gap-2">
					<div class="flex min-w-0 items-center gap-2 text-[13px]">
						<span class="shrink-0 whitespace-nowrap font-medium text-slate-700 dark:text-slate-200">
							{selectedIds.size} selected
						</span>
						<button
							type="button"
							onclick={toggleSelectAll}
							class="shrink-0 whitespace-nowrap text-[#2563eb] transition-colors hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200"
						>
							{allFilteredSelected ? 'Clear' : 'Select all'}
						</button>
					</div>
					<div class="flex shrink-0 items-center gap-1.5">
						<button
							type="button"
							onclick={confirmDeleteSelected}
							disabled={selectedIds.size === 0}
							class="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-[13px] font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-300 dark:hover:bg-red-950/40"
						>
							<Trash2 class="h-3.5 w-3.5" />
							Delete
						</button>
						<button
							type="button"
							onclick={exitSelectionMode}
							class="shrink-0 rounded-md px-2 py-1 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
						>
							Cancel
						</button>
					</div>
			</div>
		{/if}
	</div>

	<div
		bind:this={sessionScrollEl}
		class="min-w-0 flex-1 overflow-y-auto px-3 py-2.5 sm:px-3"
	>
		{#if filteredSessions.length === 0}
			<div class="px-1 py-6">
				<p class="text-sm font-medium text-slate-700 dark:text-slate-200">{emptyState.title}</p>
				<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
					{emptyState.description}
				</p>
			</div>
		{:else}
			<ul class="space-y-1.5">
				{#each filteredSessions as session (session.id)}
					{@const isCurrent = activeSessionId === session.id}
					{@const isPending =
						activeSessionId !== session.id &&
						(pendingSessionId === session.id || navigatingToSessionId === session.id)}
					{@const meta = sessionMeta(session)}
					{@const title = meta.title}
					{@const emailDraft = emailDraftSummaries[session.id]}
					{@const summary = displaySessionCardSummary(session, emailDraft)}
					{@const agentName = emailDraft ? null : meta.agentName}
					{@const iconKind = sessionIconKind(session, emailDraft)}
					{@const isSelected = selectedIds.has(session.id)}
					<li data-session-id={session.id}>
						<div
							class="group relative rounded-[10px] border transition-colors {selectionMode && isSelected
								? 'border-[#2563eb]/60 bg-[#eff6ff] dark:border-blue-400/50 dark:bg-blue-950/40'
								: isCurrent || isPending
									? 'border-[#2563eb]/35 bg-[#eff6ff] dark:border-blue-400/40 dark:bg-blue-950/40'
									: 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800/60'}"
						>
							<a
								href="/portal/{session.id}"
								data-sveltekit-preload-data="hover"
								aria-current={isCurrent ? 'page' : undefined}
								aria-busy={isPending}
								onpointerdown={(event) => startSessionPointer(session.id, event)}
								onpointermove={moveSessionPointer}
								onpointerup={(event) => finishSessionPointer(session.id, event)}
								onpointercancel={cancelSessionPointer}
								onclick={(event) => handleSessionClick(session.id, event)}
								class="flex items-start gap-3 px-3 py-2.5 pr-10 text-left"
							>
								{#if selectionMode}
									<span
										class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center"
										aria-hidden="true"
									>
										<span
											class="flex h-5 w-5 items-center justify-center rounded-[6px] border-2 transition-colors {isSelected
												? 'border-[#2563eb] bg-[#2563eb] text-white dark:border-blue-400 dark:bg-blue-500'
												: 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900'}"
										>
											{#if isSelected}
												<Check class="h-3.5 w-3.5" />
											{/if}
										</span>
									</span>
								{:else}
									<span
										class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] {iconContainerClass(
											iconKind
										)}"
										aria-hidden="true"
									>
										{#if iconKind === 'server'}
											<Server class="h-4 w-4" />
										{:else if iconKind === 'warning'}
											<TriangleAlert class="h-4 w-4" />
										{:else if iconKind === 'document'}
											<FileText class="h-4 w-4" />
										{:else if iconKind === 'chart'}
											<BarChart3 class="h-4 w-4" />
										{:else if iconKind === 'email'}
											<Mail class="h-4 w-4" />
										{:else}
											<Inbox class="h-4 w-4" />
										{/if}
									</span>
								{/if}

								<span class="min-w-0 flex-1">
									<span
										class="block truncate text-[14px] font-semibold leading-5 text-slate-900 dark:text-slate-100"
										title={title}
									>
										{title}
									</span>
									{#if agentName}
										<span class="mt-0.5 block truncate text-[12px] text-slate-500 dark:text-slate-400"
											>{agentName}</span
										>
									{/if}
									{#if summary}
										<span
											class="mt-0.5 block truncate text-[13px] leading-5 text-slate-600 dark:text-slate-300"
											>{summary}</span
										>
									{/if}
									<span
										class="mt-1.5 inline-flex min-w-0 flex-wrap items-center text-[12px] text-slate-500 dark:text-slate-400"
									>
										{#each sessionMetadataParts(session, emailDraft) as part, index (index)}
											{#if index > 0}
												<span
													class="shrink-0 px-1 text-[10px] leading-none text-slate-300 dark:text-slate-600"
													aria-hidden="true">·</span
												>
											{/if}
											{#if part.kind === 'email-draft'}
												<span class="inline-flex shrink-0 items-center">
													<span>Email</span>
													<span
														class="px-1 text-[10px] leading-none text-slate-300 dark:text-slate-600"
														aria-hidden="true">·</span
													>
													<span class={emailDraftStatusClass(part.status)}
														>{emailDraftStatusLabel(part.status)}</span
													>
												</span>
											{:else}
												<span
													class="shrink-0 {part.unread
														? 'font-medium text-[#2563eb] dark:text-blue-300'
														: ''}">{part.text}</span
												>
											{/if}
										{/each}
									</span>
								</span>
							</a>

							{#if !session.is_read}
								<span
									class="absolute right-4 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#2563eb] dark:bg-blue-400"
									aria-hidden="true"
								></span>
							{/if}

							{#if !selectionMode}
							<div
								class="absolute bottom-2 right-2 flex shrink-0 items-center gap-0.5 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
							>
								{#if isPending}
									<span
										class="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white/90 text-[#2563eb] shadow-sm dark:bg-slate-900/90 dark:text-blue-300"
										aria-label="Loading session"
									>
										<LoaderCircle class="h-3.5 w-3.5 animate-spin" />
									</span>
								{:else}
									<button
										type="button"
										class="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-blue-50 hover:text-[#2563eb] disabled:opacity-50 dark:text-slate-500 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"
										title={session.is_read ? 'Mark as unread' : 'Mark as read'}
										aria-label={session.is_read ? 'Mark as unread' : 'Mark as read'}
										disabled={markingReadSessionId === session.id}
										onclick={(event) => setSessionReadState(session.id, !session.is_read, event)}
									>
										{#if session.is_read}
											<Mail class="h-3.5 w-3.5" />
										{:else}
											<MailOpen class="h-3.5 w-3.5" />
										{/if}
									</button>
									<button
										type="button"
										class="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-950/40 dark:hover:text-red-300"
										title="Delete session"
										aria-label="Delete session"
										onclick={(event) => confirmDeleteSession(session.id, event)}
									>
										<Trash2 class="h-3.5 w-3.5" />
									</button>
								{/if}
							</div>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	{#if SIDEBAR_ARCHIVE_FILTER_ENABLED}
		<div
			class="border-t border-slate-200 bg-white px-4 py-2.5 dark:border-slate-800 dark:bg-slate-950 sm:px-4"
		>
			<button
				type="button"
				onclick={() => {
					activeFilter = 'archived';
				}}
				class="flex w-full items-center justify-between gap-2 text-[13px] text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
			>
				<span class="flex items-center gap-2">
					<Archive class="h-4 w-4 text-slate-400 dark:text-slate-500" />
					View archived sessions
				</span>
				<ChevronRight class="h-4 w-4 text-slate-400 dark:text-slate-500" />
			</button>
		</div>
	{/if}

	{#if !effectiveSidebarCollapsed}
		<button
			type="button"
			class="absolute inset-y-0 -right-1 z-10 hidden w-2 touch-none cursor-col-resize group sm:block"
			aria-label="Resize sidebar"
			onpointerdown={startSidebarResize}
		>
			<span
				class="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-slate-200 transition-colors group-hover:bg-[#2563eb]/50 group-active:bg-[#2563eb] dark:bg-slate-800 dark:group-hover:bg-blue-400/50 dark:group-active:bg-blue-400"
			></span>
		</button>
	{/if}
</div>

<AlertDialog.Root
	bind:open={deleteDialogOpen}
	onOpenChange={(open) => {
		if (!open) deleteTargetIds = [];
	}}
>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>
				{deleteTargetIds.length > 1
					? `Delete ${deleteTargetIds.length} sessions?`
					: 'Delete session?'}
			</AlertDialog.Title>
			<AlertDialog.Description>
				{deleteTargetIds.length > 1
					? 'This removes the selected sessions and all their artifacts. This cannot be undone.'
					: 'This removes the session and all artifacts. This cannot be undone.'}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action on:click={doDeleteSessions}>
				{deleteTargetIds.length > 1 ? `Delete ${deleteTargetIds.length}` : 'Delete'}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
