<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { e2eeConfig, e2eePrivateKey } from '$lib/e2ee-store';
	import { ENSURE_E2EE_UNLOCK_KEY, type EnsureE2eeUnlock } from '$lib/portal-context';
	import { forgetSessionPrefetch, prefetchSessionOnIntent } from '$lib/session-prefetch';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Inbox from '@lucide/svelte/icons/inbox';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Mail from '@lucide/svelte/icons/mail';
	import MailOpen from '@lucide/svelte/icons/mail-open';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { getContext, onMount } from 'svelte';

	const SIDEBAR_KEY = 'agentRelay:sidebarCollapsed';
	const SIDEBAR_WIDTH_KEY = 'agentRelay:sidebarWidth';
	const SIDEBAR_MIN_WIDTH = 240;
	const SIDEBAR_MAX_WIDTH = 560;
	const SIDEBAR_DEFAULT_WIDTH = 320;
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

	let {
		sessions,
		emailDraftSummaries,
		decryptedSessions,
		activeSessionId,
		navigatingToSessionId,
		showMobileDetail,
		unreadCount,
		pendingSessionId = $bindable<string | null>(null)
	}: {
		sessions: SessionRow[];
		emailDraftSummaries: Record<string, EmailDraftSummary | undefined>;
		decryptedSessions: Record<string, { title: string; summary: string | null }>;
		activeSessionId: string | null;
		navigatingToSessionId: string | null;
		showMobileDetail: boolean;
		unreadCount: number;
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

	const effectiveSidebarCollapsed = $derived(isDesktop && sidebarCollapsed);

	function sessionInitial(title: string): string {
		const initial = title.trim().charAt(0);
		return initial ? initial.toUpperCase() : 'A';
	}

	function formatSessionDate(iso: string | Date): string {
		return new Date(iso).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function emailDraftStatusLabel(status: string): string {
		switch (status) {
			case 'pending':
				return 'Awaiting review';
			case 'sent':
				return 'Sent';
			case 'rejected':
				return 'Rejected';
			case 'failed':
				return 'Send failed';
			case 'approved':
				return 'Approved';
			default:
				return status;
		}
	}

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
		class="absolute left-4 top-4 z-30 hidden items-center gap-2 rounded-lg border border-slate-200 bg-white/95 px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-md backdrop-blur-sm transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-200 dark:hover:border-blue-900 dark:hover:bg-blue-950/80 sm:inline-flex"
	>
		<Inbox class="h-4 w-4 text-[#3b82f6]" />
		<span>Sessions</span>
		<span
			class="rounded-full bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
		>
			{#if unreadCount > 0}
				{unreadCount} unread
			{:else}
				{sessions.length}
			{/if}
		</span>
		<ChevronRight class="h-4 w-4 text-slate-400" />
	</button>
{/if}

<div
	class="relative shrink-0 flex-col min-h-0 overflow-hidden border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-950
		{showMobileDetail ? 'hidden sm:flex' : 'flex w-full'}
		{effectiveSidebarCollapsed ? 'sm:w-0 sm:border-0' : 'w-full sm:w-[var(--sidebar-width)] sm:border-r'}
		{!isResizing && !effectiveSidebarCollapsed
		? 'transition-[width,border-color] duration-300 ease-in-out'
		: ''}"
	style={sidebarStyle}
	aria-hidden={effectiveSidebarCollapsed || (!isDesktop && showMobileDetail)}
>
	<div class="hidden min-w-0 border-b border-slate-100 px-4 py-3 dark:border-slate-800 sm:block">
		<div class="flex items-center justify-between gap-2">
			<div class="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
				<Inbox class="h-4 w-4 shrink-0 text-[#3b82f6]" />
				Sessions
			</div>
			<div class="flex shrink-0 items-center gap-1">
				<span
					class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-300"
				>
					{#if unreadCount > 0}
						{unreadCount} unread
					{:else}
						{sessions.length}
					{/if}
				</span>
				<button
					type="button"
					onclick={toggleSidebar}
					title="Hide sessions"
					aria-label="Hide sessions"
					aria-expanded={true}
					class="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
				>
					<ChevronLeft class="h-4 w-4" />
				</button>
			</div>
		</div>
		<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">Deliveries from AI agents</p>
	</div>

	<div class="min-w-0 flex-1 overflow-y-auto">
		{#if sessions.length === 0}
			<div class="px-4 py-6">
				<p class="text-sm font-medium text-slate-700 dark:text-slate-200">No sessions yet.</p>
				<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
					New agent deliveries will show up here as sessions.
				</p>
			</div>
		{:else}
			<ul class="sm:p-2">
				{#each sessions as session (session.id)}
					{@const isCurrent = activeSessionId === session.id}
					{@const isPending =
						activeSessionId !== session.id &&
						(pendingSessionId === session.id || navigatingToSessionId === session.id)}
					{@const title = displaySessionTitle(session)}
					{@const summary = displaySessionSummary(session)}
					{@const emailDraft = emailDraftSummaries[session.id]}
					<li>
						<div
							class="group relative flex items-stretch border-b border-slate-100 transition-colors dark:border-slate-800 sm:mb-1 sm:rounded-xl sm:border {isCurrent ||
							isPending
								? 'border-[#3b82f6]/40 bg-blue-50 dark:border-blue-400/40 dark:bg-blue-950/40'
								: session.is_read
									? 'sm:border-transparent hover:bg-slate-50 sm:hover:border-slate-200 dark:hover:bg-slate-900 dark:sm:hover:border-slate-800'
									: 'bg-white sm:border-transparent hover:bg-blue-50/40 sm:hover:border-blue-100 dark:bg-slate-950 dark:hover:bg-blue-950/20 dark:sm:hover:border-blue-900/50'}"
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
								class="grid min-w-0 flex-1 grid-cols-[2.5rem_minmax(0,1fr)] gap-3 px-4 py-3 text-left sm:grid-cols-[2.25rem_minmax(0,1fr)] sm:px-3 sm:pr-16"
							>
								<span
									class="relative mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold sm:h-9 sm:w-9 {session.is_read
										? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
										: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'}"
									aria-hidden="true"
								>
									{#if !session.is_read}
										<span class="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#3b82f6] dark:border-slate-950"></span>
									{/if}
									{sessionInitial(title)}
								</span>
								<span class="min-w-0">
									<span class="flex min-w-0 items-start justify-between gap-2">
										<span
											class="block min-w-0 flex-1 truncate text-sm {session.is_read
												? 'font-semibold text-slate-800 dark:text-slate-200'
												: 'font-bold text-slate-950 dark:text-slate-50'}"
											title={title}
										>
											{title}
										</span>
										<time
											class="mt-0.5 shrink-0 whitespace-nowrap text-xs {session.is_read
												? 'text-slate-400 dark:text-slate-500'
												: 'font-semibold text-[#2563eb] dark:text-blue-300'}"
										>
											{formatSessionDate(session.updated_at)}
										</time>
									</span>
									<span
										class="mt-1 block truncate text-xs {session.is_read
											? 'text-slate-500 dark:text-slate-400'
											: 'font-medium text-slate-700 dark:text-slate-300'}"
									>
										{#if emailDraft}
											Email · {emailDraftStatusLabel(emailDraft.status)}
										{:else if session.artifact_count}
											{session.artifact_count} file{session.artifact_count === 1 ? '' : 's'}
										{:else}
											No files
										{/if}
									</span>
									{#if summary}
										<span
											class="inbox-summary-clamp mt-1 block pr-16 text-xs leading-5 sm:pr-0 {session.is_read
												? 'text-slate-500 dark:text-slate-400'
												: 'text-slate-700 dark:text-slate-300'}"
										>
											{summary}
										</span>
									{/if}
								</span>
							</a>
							<div
								class="absolute bottom-3 right-3 flex shrink-0 items-center gap-0.5 sm:bottom-auto sm:right-2 sm:top-1/2 sm:-translate-y-1/2 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100"
							>
								{#if isPending}
									<span
										class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white/80 text-[#2563eb] shadow-sm dark:bg-slate-900/80 dark:text-blue-300"
										aria-label="Loading session"
									>
										<LoaderCircle class="h-4 w-4 animate-spin" />
									</span>
								{:else}
									<button
										type="button"
										class="rounded-md p-2 text-slate-400 transition-colors hover:bg-blue-50 hover:text-[#2563eb] disabled:opacity-50 dark:text-slate-500 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"
										title={session.is_read ? 'Mark as unread' : 'Mark as read'}
										aria-label={session.is_read ? 'Mark as unread' : 'Mark as read'}
										disabled={markingReadSessionId === session.id}
										onclick={(event) => setSessionReadState(session.id, !session.is_read, event)}
									>
										{#if session.is_read}
											<Mail class="h-4 w-4" />
										{:else}
											<MailOpen class="h-4 w-4" />
										{/if}
									</button>
									<button
										type="button"
										class="rounded-md p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-950/40 dark:hover:text-red-300"
										title="Delete session"
										aria-label="Delete session"
										onclick={(event) => confirmDeleteSession(session.id, event)}
									>
										<Trash2 class="h-4 w-4" />
									</button>
								{/if}
							</div>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	{#if !effectiveSidebarCollapsed}
		<button
			type="button"
			class="hidden sm:block absolute inset-y-0 -right-1 z-10 w-2 touch-none cursor-col-resize group"
			aria-label="Resize sidebar"
			onpointerdown={startSidebarResize}
		>
			<span
				class="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-slate-200 transition-colors group-hover:bg-[#3b82f6]/50 group-active:bg-[#3b82f6] dark:bg-slate-800 dark:group-hover:bg-blue-400/50"
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
