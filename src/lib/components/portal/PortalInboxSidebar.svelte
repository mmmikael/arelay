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
	import { forgetSessionPrefetch, prefetchSessionOnIntent } from '$lib/session-prefetch';
	import Archive from '@lucide/svelte/icons/archive';
	import BarChart3 from '@lucide/svelte/icons/bar-chart-3';
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
		pendingSessionId = $bindable<string | null>(null)
	}: {
		sessions: SessionRow[];
		emailDraftSummaries: Record<string, EmailDraftSummary | undefined>;
		decryptedSessions: Record<string, SidebarDecryptedMeta>;
		activeSessionId: string | null;
		navigatingToSessionId: string | null;
		showMobileDetail: boolean;
		pendingSessionId?: string | null;
	} = $props();

	const ensureE2eeUnlocked = getContext<EnsureE2eeUnlock>(ENSURE_E2EE_UNLOCK_KEY);

	let deleteDialogOpen = $state(false);
	let deleteSessionId = $state<string | null>(null);
	let deleting = $state(false);
	let markingReadSessionId = $state<string | null>(null);
	let sessionPointer = $state<SessionPointer | null>(null);
	let suppressedSessionClick = $state<SuppressedSessionClick | null>(null);
	let sidebarCollapsed = $state(false);
	let sidebarWidth = $state(SIDEBAR_DEFAULT_WIDTH);
	let isResizing = $state(false);
	let isDesktop = $state(false);
	let activeFilter = $state<SidebarFilter>('all');

	const effectiveSidebarCollapsed = $derived(isDesktop && sidebarCollapsed);

	const activeSessionCount = $derived(
		sessions.filter((session) => !session.is_archived).length
	);

	const filteredSessions = $derived.by(() => {
		switch (activeFilter) {
			case 'unread':
				return sessions.filter((session) => !session.is_read && !session.is_archived);
			case 'email':
				return sessions.filter(
					(session) => Boolean(emailDraftSummaries[session.id]) && !session.is_archived
				);
			case 'files':
				return sessions.filter(
					(session) => (session.artifact_count ?? 0) > 0 && !session.is_archived
				);
			case 'archived':
				return sessions.filter((session) => session.is_archived);
			default:
				return sessions.filter((session) => !session.is_archived);
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
			prefetchSessionOnIntent({
				id: session.id,
				updated_at: session.updated_at,
				email_draft_updated_at: emailDraftSummaries[session.id]?.updated_at ?? null
			});
		}
	}

	function confirmDeleteSession(id: string, event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		deleteSessionId = id;
		deleteDialogOpen = true;
	}

	function startSessionPointer(id: string, event: PointerEvent) {
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

	async function doDeleteSession() {
		const id = deleteSessionId;
		if (!id || deleting) return;
		deleting = true;
		try {
			const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
			if (!res.ok) throw new Error('Delete failed');
			forgetSessionPrefetch(id);
			const wasActive = activeSessionId === id;
			if (wasActive) {
				await goto('/portal', { replaceState: true });
			}
			await Promise.all([invalidate('inbox:sessions'), invalidate('account:storage')]);
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Delete failed');
		} finally {
			deleting = false;
			deleteDialogOpen = false;
			deleteSessionId = null;
		}
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

		<div class="mt-3.5 flex flex-nowrap gap-1.5 overflow-x-auto">
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
	</div>

	<div class="min-w-0 flex-1 overflow-y-auto px-3 py-2.5 sm:px-3">
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
					<li>
						<div
							class="group relative rounded-[10px] border transition-colors {isCurrent || isPending
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
		if (!open && !deleting) deleteSessionId = null;
	}}
>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete session?</AlertDialog.Title>
			<AlertDialog.Description>
				This removes the session and all artifacts. This cannot be undone.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={deleting}>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action on:click={doDeleteSession} disabled={deleting}>
				{deleting ? 'Deleting…' : 'Delete'}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
