<script lang="ts">
	import { afterNavigate, goto, invalidate } from '$app/navigation';
	import { navigating, page } from '$app/stores';
	import {
		canAttemptPasskeyPrf,
		createE2eeKeyring,
		createEncryptionPasskeyPrivateKey,
		wrapPrivateKeyWithPasskey,
		decryptString,
		unlockPrivateKey,
		unlockPrivateKeyWithPasskey,
		type EncryptedEnvelope,
		type EncryptedPrivateKey,
		type PasskeyEncryptedPrivateKey
	} from '$lib/e2ee';
	import {
		ENCRYPTION_PASSKEY_FALLBACK_NOTICE,
		PASSKEY_STORAGE_HINT,
		isPasskeyPrfError,
		shouldShowPasskeyStorageHint,
		withPasskeyPrfFailureHint
	} from '$lib/passkey-hints';
	import { e2eeConfig, e2eePrivateKey } from '$lib/e2ee-store';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import Logo from '$lib/components/Logo.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import Inbox from '@lucide/svelte/icons/inbox';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import LockKeyhole from '@lucide/svelte/icons/lock-keyhole';
	import LogOut from '@lucide/svelte/icons/log-out';
	import Mail from '@lucide/svelte/icons/mail';
	import MailOpen from '@lucide/svelte/icons/mail-open';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import UserRound from '@lucide/svelte/icons/user-round';
	import { formatBytes } from '$lib/artifacts';
	import {
		ENSURE_E2EE_UNLOCK_KEY,
		OPEN_E2EE_DIALOG_KEY,
		SESSION_UPDATED_AT_LOOKUP_KEY,
		type EnsureE2eeUnlock,
		type OpenE2eeDialog,
		type SessionUpdatedAtLookup
	} from '$lib/portal-context';
	import { mergeSessionDetailCache, sessionDetailCacheKey } from '$lib/session-detail-cache';
	import {
		forgetSessionPrefetch,
		markSessionPrefetched,
		prefetchSessionOnIntent,
		prefetchSessionPages,
		resetSessionPrefetch,
		warmPrefetchedSessions
	} from '$lib/session-prefetch';
	import { onMount, setContext } from 'svelte';
	import type { LayoutData } from './$types';

	const POLL_MS = 5000;
	// Fallback if navigation never starts or completes (e.g. blocked click).
	const NAV_PENDING_TIMEOUT_MS = 5_000;
	const SIDEBAR_KEY = 'agentRelay:sidebarCollapsed';
	const SIDEBAR_WIDTH_KEY = 'agentRelay:sidebarWidth';
	const SIDEBAR_MIN_WIDTH = 240;
	const SIDEBAR_MAX_WIDTH = 560;
	const SIDEBAR_DEFAULT_WIDTH = 320;
	const TAP_MOVE_THRESHOLD = 10;
	const CLICK_SUPPRESS_MS = 450;

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

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	let deleteDialogOpen = $state(false);
	let deleteSessionId = $state<string | null>(null);
	let deleting = $state(false);
	let markingReadSessionId = $state<string | null>(null);
	let pendingSessionId = $state<string | null>(null);
	let sessionPointer = $state<SessionPointer | null>(null);
	let suppressedSessionClick = $state<SuppressedSessionClick | null>(null);
	let e2eeDialog = $state<'setup' | 'unlock' | null>(null);
	let e2eeBusy = $state(false);
	let e2eeError = $state('');
	let e2eeNotice = $state('');
	let recoveryKeyInput = $state('');
	let generatedRecoveryKey = $state('');
	let usedDedicatedEncryptionPasskey = $state(false);
	let e2eeOfferDedicatedPasskey = $state(false);
	let decryptedSessions = $state<Record<string, { title: string; summary: string | null }>>({});
	let sidebarCollapsed = $state(false);
	let sidebarWidth = $state(SIDEBAR_DEFAULT_WIDTH);
	let isResizing = $state(false);
	let isDesktop = $state(false);

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
	const effectiveSidebarCollapsed = $derived(isDesktop && sidebarCollapsed);
	const unreadCount = $derived(data.sessions.filter((session) => !session.is_read).length);

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

	async function logout() {
		await fetch('/api/logout', { method: 'POST' });
		e2eePrivateKey.set(null);
		resetSessionPrefetch();
		goto('/', { replaceState: true });
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

	function accountPasskeyId(): string | null {
		return data.passkeys.find((passkey) => passkey.isCurrent)?.id ?? data.passkeys[0]?.id ?? null;
	}

	function confirmDeleteSession(id: string, event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		deleteSessionId = id;
		deleteDialogOpen = true;
	}

	function beginSessionNavigation(id: string, event?: PointerEvent | MouseEvent) {
		if (event && event.button !== 0) return;
		if (activeSessionId === id) return;
		pendingSessionId = id;
		const session = data.sessions.find((entry) => entry.id === id);
		if (session) {
			prefetchSessionOnIntent(session);
		}
	}

	async function unlockWithPasskeySilent(): Promise<boolean> {
		if ($e2eePrivateKey) return true;
		const encryptedPrivateKey = $e2eeConfig.passkeyEncryptedPrivateKey;
		if (!encryptedPrivateKey || e2eeBusy) return false;

		e2eeBusy = true;
		try {
			const privateKey = await unlockPrivateKeyWithPasskey(encryptedPrivateKey);
			e2eePrivateKey.set(privateKey);
			return true;
		} catch {
			return false;
		} finally {
			e2eeBusy = false;
		}
	}

	const ensureE2eeUnlocked: EnsureE2eeUnlock = async () => {
		if ($e2eePrivateKey) return true;
		if (!$e2eeConfig.configured) {
			openE2eeDialog();
			return false;
		}
		if ($e2eeConfig.passkeyEncryptedPrivateKey) {
			const unlocked = await unlockWithPasskeySilent();
			if (unlocked) return true;
		}
		openE2eeDialog();
		return false;
	};

	setContext(ENSURE_E2EE_UNLOCK_KEY, ensureE2eeUnlocked);

	const sessionUpdatedAtLookup: SessionUpdatedAtLookup = (sessionId) =>
		data.sessions.find((entry) => entry.id === sessionId)?.updated_at;
	setContext(SESSION_UPDATED_AT_LOOKUP_KEY, sessionUpdatedAtLookup);

	function isEncryptedSession(session: LayoutData['sessions'][number]): boolean {
		return session.encryption_version === 'e2ee-v1';
	}

	function displaySessionTitle(session: LayoutData['sessions'][number]): string {
		return decryptedSessions[session.id]?.title ?? 'Encrypted delivery';
	}

	function displaySessionSummary(session: LayoutData['sessions'][number]): string | null {
		return decryptedSessions[session.id]?.summary ?? 'Unlock encryption to view this message.';
	}

	async function loadE2eeConfig() {
		try {
			const res = await fetch('/api/e2ee/config');
			const config = await res.json();
			e2eeConfig.set({
				configured: Boolean(config.configured),
				publicKeyJwk: config.publicKeyJwk ?? null,
				encryptedPrivateKey: config.encryptedPrivateKey ?? null,
				passkeyCredentialId: config.passkeyCredentialId ?? null,
				passkeyEncryptedPrivateKey: config.passkeyEncryptedPrivateKey ?? null,
				recoveryHint: config.recoveryHint ?? null
			});
		} catch (err) {
			console.error('[e2ee] config load failed:', err);
		}
	}

	function openE2eeDialog() {
		e2eeError = '';
		e2eeNotice = '';
		generatedRecoveryKey = '';
		usedDedicatedEncryptionPasskey = false;
		e2eeOfferDedicatedPasskey = false;
		recoveryKeyInput = '';
		e2eeDialog = $e2eeConfig.configured ? 'unlock' : 'setup';
	}

	setContext(OPEN_E2EE_DIALOG_KEY, openE2eeDialog);

	async function saveE2eeSetup(
		keyring: Awaited<ReturnType<typeof createE2eeKeyring>>,
		passkeyEncryptedPrivateKey: PasskeyEncryptedPrivateKey
	) {
		const res = await fetch('/api/e2ee/config', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				publicKeyJwk: keyring.publicKeyJwk,
				encryptedPrivateKey: keyring.encryptedPrivateKey,
				passkeyCredentialId: passkeyEncryptedPrivateKey.credentialId,
				passkeyEncryptedPrivateKey,
				recoveryHint: 'Recovery key created in this browser'
			})
		});
		if (!res.ok) throw new Error('Could not save encryption setup');
		const config = await res.json();
		e2eeConfig.set({
			configured: true,
			publicKeyJwk: config.publicKeyJwk,
			encryptedPrivateKey: config.encryptedPrivateKey,
			passkeyCredentialId: config.passkeyCredentialId ?? null,
			passkeyEncryptedPrivateKey: config.passkeyEncryptedPrivateKey ?? null,
			recoveryHint: config.recoveryHint ?? null
		});
		e2eePrivateKey.set(keyring.privateKey);
		generatedRecoveryKey = keyring.recoveryKey;
		e2eeOfferDedicatedPasskey = false;
	}

	async function setupE2ee() {
		if (e2eeBusy) return;
		e2eeBusy = true;
		e2eeError = '';
		e2eeNotice = '';
		e2eeOfferDedicatedPasskey = false;
		try {
			const credentialId = accountPasskeyId();
			if (!credentialId) {
				throw new Error('Sign in with your passkey before enabling encryption.');
			}
			if (!canAttemptPasskeyPrf()) {
				throw new Error('Passkey PRF is not available in this browser.');
			}

			const keyring = await createE2eeKeyring();
			const passkeyEncryptedPrivateKey = await wrapPrivateKeyWithPasskey(
				credentialId,
				keyring.privateKey
			);
			usedDedicatedEncryptionPasskey = false;
			await saveE2eeSetup(keyring, passkeyEncryptedPrivateKey);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Could not set up encryption';
			if (isPasskeyPrfError(message)) {
				e2eeOfferDedicatedPasskey = true;
				e2eeNotice = ENCRYPTION_PASSKEY_FALLBACK_NOTICE;
			} else {
				e2eeError = message;
			}
		} finally {
			e2eeBusy = false;
		}
	}

	async function setupE2eeWithDedicatedPasskey() {
		if (e2eeBusy) return;
		e2eeBusy = true;
		e2eeError = '';
		e2eeNotice = '';
		try {
			if (!canAttemptPasskeyPrf()) {
				throw new Error('Passkey PRF is not available in this browser.');
			}

			const keyring = await createE2eeKeyring();
			const passkeyEncryptedPrivateKey = await createEncryptionPasskeyPrivateKey(
				keyring.privateKey
			);
			usedDedicatedEncryptionPasskey = true;
			await saveE2eeSetup(keyring, passkeyEncryptedPrivateKey);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Could not set up encryption';
			e2eeError = withPasskeyPrfFailureHint(message);
		} finally {
			e2eeBusy = false;
		}
	}

	async function unlockE2ee() {
		const encryptedPrivateKey = $e2eeConfig.encryptedPrivateKey as EncryptedPrivateKey | null;
		if (!encryptedPrivateKey || !recoveryKeyInput.trim() || e2eeBusy) return;

		e2eeBusy = true;
		e2eeError = '';
		e2eeNotice = '';
		try {
			const privateKey = await unlockPrivateKey(encryptedPrivateKey, recoveryKeyInput);
			e2eePrivateKey.set(privateKey);
			e2eeDialog = null;
			recoveryKeyInput = '';
		} catch {
			e2eeError = 'Recovery key could not unlock this relay.';
		} finally {
			e2eeBusy = false;
		}
	}

	async function unlockE2eeWithPasskey() {
		e2eeError = '';
		e2eeNotice = '';
		const unlocked = await unlockWithPasskeySilent();
		if (unlocked) {
			e2eeDialog = null;
			recoveryKeyInput = '';
			return;
		}
		e2eeError = withPasskeyPrfFailureHint('Passkey could not unlock this relay.');
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

		const session = data.sessions.find((entry) => entry.id === id);
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
		void prefetchSessionPages(data.sessions, $e2eePrivateKey);
	});

	$effect(() => {
		const privateKey = $e2eePrivateKey;
		if (!privateKey) {
			decryptedSessions = {};
			return;
		}

		void warmPrefetchedSessions(privateKey, data.sessions);

		let cancelled = false;
		const decryptAll = async () => {
			const next: Record<string, { title: string; summary: string | null }> = {};
			for (const session of data.sessions) {
				if (!isEncryptedSession(session) || !session.encrypted_title) continue;
				try {
					const title = await decryptString(
						session.encrypted_title as unknown as EncryptedEnvelope,
						privateKey
					);
					const summary = session.encrypted_summary
						? await decryptString(
								session.encrypted_summary as unknown as EncryptedEnvelope,
								privateKey
							)
						: null;
					next[session.id] = { title, summary };
					mergeSessionDetailCache(session.id, sessionDetailCacheKey(session.updated_at), {
						session: { title, summary }
					});
				} catch (err) {
					console.error('[e2ee] session decrypt failed:', err);
				}
			}
			if (!cancelled) decryptedSessions = next;
		};
		void decryptAll();
		return () => {
			cancelled = true;
		};
	});

	onMount(() => {
		try {
			void loadE2eeConfig();

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
			desktopQuery.removeEventListener('change', updateDesktop);
		};
	});
</script>

<div class="flex h-[100dvh] min-h-screen flex-col overflow-hidden bg-white sm:bg-slate-50 dark:bg-slate-950">
	<header
		class="z-50 shrink-0 border-b border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-950 {showMobileDetail
			? 'hidden sm:block'
			: ''}"
	>
		<div class="flex h-14 items-center justify-between gap-2 px-3 sm:gap-3 sm:px-6">
			<div class="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
				<Logo class="h-8 w-8 shrink-0" />
				<span
					class="hidden min-w-0 truncate text-lg font-bold text-slate-900 dark:text-slate-100 sm:block"
				>
					Agent Relay
				</span>
				<span
					class="min-w-0 truncate text-sm font-semibold text-slate-900 dark:text-slate-100 sm:hidden"
				>
					Inbox · {#if unreadCount > 0}{unreadCount} unread{:else}{data.sessions.length} messages{/if}
				</span>
			</div>
			<div class="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
				<a
					href="/portal/account"
					title={data.currentUser?.email ?? 'Account'}
					aria-label="Account"
					aria-current={isAccountPage ? 'page' : undefined}
					class="inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 {isAccountPage
						? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200'
						: 'border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}"
				>
					<UserRound class="h-4 w-4" />
				</a>
				<button
					type="button"
					onclick={openE2eeDialog}
					title={$e2eePrivateKey
						? 'Encryption unlocked'
						: $e2eeConfig.configured
							? 'Unlock encryption'
							: 'Set up encryption'}
					aria-label={$e2eePrivateKey
						? 'Encryption unlocked'
						: $e2eeConfig.configured
							? 'Unlock encryption'
							: 'Set up encryption'}
					class="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
				>
					{#if $e2eePrivateKey}
						<ShieldCheck class="h-4 w-4 text-emerald-500" />
					{:else if $e2eeConfig.configured}
						<LockKeyhole class="h-4 w-4" />
					{:else}
						<KeyRound class="h-4 w-4" />
					{/if}
				</button>
				<ThemeToggle />
				<Button
					variant="outline"
					size="icon"
					onclick={logout}
					class="h-8 w-8 shrink-0 sm:hidden"
					aria-label="Sign out"
					title="Sign out"
				>
					<LogOut class="h-4 w-4" />
				</Button>
				<Button variant="outline" size="sm" onclick={logout} class="hidden shrink-0 sm:inline-flex">
					Sign out
				</Button>
			</div>
		</div>
	</header>

	<div class="relative flex min-h-0 flex-1 overflow-hidden">
		{#if effectiveSidebarCollapsed && isDesktop}
			<button
				type="button"
				onclick={toggleSidebar}
				title="Show sessions"
				aria-label="Show inbox"
				aria-expanded={false}
				class="absolute left-4 top-4 z-30 hidden items-center gap-2 rounded-lg border border-slate-200 bg-white/95 px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-md backdrop-blur-sm transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-200 dark:hover:border-blue-900 dark:hover:bg-blue-950/80 sm:inline-flex"
			>
				<Inbox class="h-4 w-4 text-[#3b82f6]" />
				<span>Inbox</span>
				<span
					class="rounded-full bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
				>
					{#if unreadCount > 0}
						{unreadCount} unread
					{:else}
						{data.sessions.length}
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
						Inbox
					</div>
					<div class="flex shrink-0 items-center gap-1">
						<span
							class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-300"
						>
							{#if unreadCount > 0}
								{unreadCount} unread
							{:else}
								{data.sessions.length}
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
				{#if data.sessions.length === 0}
					<div class="px-4 py-6">
						<p class="text-sm font-medium text-slate-700 dark:text-slate-200">No messages yet.</p>
						<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
							New agent deliveries will show up here as inbox messages.
						</p>
					</div>
				{:else}
					<ul class="sm:p-2">
						{#each data.sessions as session (session.id)}
							{@const isCurrent = activeSessionId === session.id}
							{@const isPending =
								activeSessionId !== session.id &&
								(pendingSessionId === session.id || navigatingToSessionId === session.id)}
							{@const title = displaySessionTitle(session)}
							{@const summary = displaySessionSummary(session)}
							{@const emailDraft = data.emailDraftSummaries[session.id]}
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
												aria-label="Loading message"
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

		<main
			class="min-w-0 overflow-y-auto bg-slate-50 dark:bg-slate-950 {showMobileDetail
				? 'flex-1'
				: 'hidden sm:block sm:flex-1'} sm:p-6"
		>
			{@render children()}
		</main>
	</div>
</div>

{#if e2eeDialog}
	<div class="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
		<div
			class="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900"
		>
			<div class="flex items-start justify-between gap-3">
				<div>
					<h2 class="text-base font-semibold text-slate-900 dark:text-slate-100">
						{e2eeDialog === 'setup' ? 'Set up encryption' : 'Unlock encryption'}
					</h2>
					<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
						{e2eeDialog === 'setup'
							? 'Create an encryption key secured by your account passkey when possible, and save a recovery key fallback.'
							: 'Use your encryption passkey or recovery key to decrypt encrypted deliveries in this browser.'}
					</p>
				</div>
				<button
					type="button"
					class="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
					aria-label="Close encryption dialog"
					onclick={() => {
						e2eeDialog = null;
						e2eeError = '';
						e2eeNotice = '';
						recoveryKeyInput = '';
					}}
				>
					×
				</button>
			</div>

			{#if e2eeError}
				<p class="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
					{e2eeError}
				</p>
			{/if}
			{#if e2eeNotice}
				<p class="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
					{e2eeNotice}
				</p>
			{/if}

			{#if e2eeDialog === 'setup'}
				{#if generatedRecoveryKey}
					<div class="mt-4 space-y-3">
						<p class="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
							{usedDedicatedEncryptionPasskey
								? 'A separate encryption passkey unlocks encrypted deliveries in this browser. Your account passkey still signs you in.'
								: 'Your account passkey unlocks encrypted deliveries in this browser.'}
						</p>
						<p class="text-sm font-medium text-slate-900 dark:text-slate-100">
							Save this recovery key now. It cannot be shown again.
						</p>
						<textarea
							readonly
							class="h-24 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
							value={generatedRecoveryKey}
						></textarea>
						<div class="flex justify-end gap-2">
							<Button
								variant="outline"
								size="sm"
								onclick={() => navigator.clipboard?.writeText(generatedRecoveryKey)}
							>
								Copy
							</Button>
							<Button
								size="sm"
								onclick={async () => {
									e2eeDialog = null;
									if (isSetupPage) {
										await invalidate('account:e2ee');
										await goto('/portal');
									}
								}}
							>Done</Button>
						</div>
					</div>
				{:else}
					{#if shouldShowPasskeyStorageHint()}
						<p
							class="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100"
						>
							{PASSKEY_STORAGE_HINT}
						</p>
					{/if}
					<div class="mt-5 flex flex-col gap-3">
						{#if e2eeOfferDedicatedPasskey}
							<Button
								class="w-full"
								onclick={setupE2eeWithDedicatedPasskey}
								disabled={e2eeBusy}
							>
								{e2eeBusy ? 'Creating…' : 'Create encryption passkey'}
							</Button>
						{/if}
						<div class="flex justify-end gap-2">
							<Button variant="outline" size="sm" onclick={() => (e2eeDialog = null)}>Cancel</Button>
							<Button
								size="sm"
								variant={e2eeOfferDedicatedPasskey ? 'outline' : 'default'}
								onclick={setupE2ee}
								disabled={e2eeBusy}
							>
								{e2eeBusy
									? 'Creating…'
									: e2eeOfferDedicatedPasskey
										? 'Try account passkey again'
										: 'Create encrypted relay'}
							</Button>
						</div>
					</div>
				{/if}
			{:else}
				<div class="mt-4 space-y-3">
					{#if $e2eeConfig.passkeyEncryptedPrivateKey}
						<Button class="w-full" onclick={unlockE2eeWithPasskey} disabled={e2eeBusy}>
							{e2eeBusy ? 'Unlocking…' : 'Unlock with passkey'}
						</Button>
						<div class="flex items-center gap-3 text-xs uppercase tracking-wide text-slate-400">
							<span class="h-px flex-1 bg-slate-200 dark:bg-slate-800"></span>
							or
							<span class="h-px flex-1 bg-slate-200 dark:bg-slate-800"></span>
						</div>
					{/if}
					<label class="block text-sm font-medium text-slate-700 dark:text-slate-300" for="recovery-key">
						Recovery key
					</label>
					<textarea
						id="recovery-key"
						class="h-24 w-full resize-none rounded-xl border border-slate-200 bg-white p-3 font-mono text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
						bind:value={recoveryKeyInput}
						placeholder="XXXX-XXXX-XXXX-..."
						autocomplete="off"
					></textarea>
					<div class="flex justify-end gap-2">
						<Button variant="outline" size="sm" onclick={() => (e2eeDialog = null)}>Cancel</Button>
						<Button size="sm" onclick={unlockE2ee} disabled={e2eeBusy || !recoveryKeyInput.trim()}>
							{e2eeBusy ? 'Unlocking…' : 'Unlock'}
						</Button>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

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
