<script lang="ts">
	import { afterNavigate, goto, invalidate } from '$app/navigation';
	import { page } from '$app/stores';
	import {
		canAttemptPasskeyPrf,
		createE2eeKeyring,
		wrapPrivateKeyWithPasskey,
		decryptString,
		encryptString,
		unlockPrivateKey,
		unlockPrivateKeyWithPasskey,
		type EncryptedEnvelope,
		type EncryptedPrivateKey,
		type PasskeyEncryptedPrivateKey
	} from '$lib/e2ee';
	import { e2eeConfig, e2eePrivateKey } from '$lib/e2ee-store';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import Logo from '$lib/components/Logo.svelte';
	import Inbox from '@lucide/svelte/icons/inbox';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import LockKeyhole from '@lucide/svelte/icons/lock-keyhole';
	import Mail from '@lucide/svelte/icons/mail';
	import MailOpen from '@lucide/svelte/icons/mail-open';
	import Moon from '@lucide/svelte/icons/moon';
	import PanelLeftClose from '@lucide/svelte/icons/panel-left-close';
	import PanelLeftOpen from '@lucide/svelte/icons/panel-left-open';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import Sun from '@lucide/svelte/icons/sun';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import UserRound from '@lucide/svelte/icons/user-round';
	import { onMount } from 'svelte';
	import type { LayoutData } from './$types';

	const POLL_MS = 5000;
	const THEME_KEY = 'agentRelay:theme';
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

	type GeneratedAgentToken = {
		id: string;
		name: string;
		token: string;
		encrypted: boolean;
	};

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	let deleteDialogOpen = $state(false);
	let deleteSessionId = $state<string | null>(null);
	let deleting = $state(false);
	let markingReadSessionId = $state<string | null>(null);
	let pendingSessionId = $state<string | null>(null);
	let sessionPointer = $state<SessionPointer | null>(null);
	let suppressedSessionClick = $state<SuppressedSessionClick | null>(null);
	let darkMode = $state(false);
	let e2eeDialog = $state<'setup' | 'unlock' | null>(null);
	let e2eeBusy = $state(false);
	let e2eeError = $state('');
	let e2eeNotice = $state('');
	let accountDialogOpen = $state(false);
	let accountBusy = $state(false);
	let accountError = $state('');
	let accountNotice = $state('');
	let generatedAgentToken = $state<GeneratedAgentToken | null>(null);
	let newAgentTokenName = $state('');
	let revealedAgentTokens = $state<Record<string, string>>({});
	let tokenActionId = $state<string | null>(null);
	let recoveryKeyInput = $state('');
	let generatedRecoveryKey = $state('');
	let decryptedSessions = $state<Record<string, { title: string; summary: string | null }>>({});
	let sidebarCollapsed = $state(false);
	let sidebarWidth = $state(SIDEBAR_DEFAULT_WIDTH);
	let isResizing = $state(false);
	let isDesktop = $state(false);

	const activeSessionId = $derived($page.params.sessionId ?? null);
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
		goto('/', { replaceState: true });
	}

	function openAccountDialog() {
		accountDialogOpen = true;
		accountError = '';
		accountNotice = '';
		generatedAgentToken = null;
	}

	function accountPasskeyId(): string | null {
		return data.passkeys.find((passkey) => passkey.isCurrent)?.id ?? data.passkeys[0]?.id ?? null;
	}

	function bytesToBase64Url(bytes: Uint8Array): string {
		let binary = '';
		for (const byte of bytes) binary += String.fromCharCode(byte);
		return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
	}

	function generateAgentTokenValue(): string {
		const bytes = new Uint8Array(32);
		crypto.getRandomValues(bytes);
		return `ar_${bytesToBase64Url(bytes)}`;
	}

	async function sha256Hex(value: string): Promise<string> {
		const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
		return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
			''
		);
	}

	function suggestedAgentTokenName(): string {
		const index = data.agentTokens.length + 1;
		return `Agent token ${index}`;
	}

	async function createAgentApiToken() {
		if (accountBusy) return;
		accountBusy = true;
		accountError = '';
		accountNotice = '';
		generatedAgentToken = null;
		try {
			const token = generateAgentTokenValue();
			const tokenHash = await sha256Hex(token);
			const publicKey = $e2eeConfig.publicKeyJwk;
			const encryptedToken = publicKey ? await encryptString(token, publicKey) : null;
			const res = await fetch('/api/account/agent-tokens', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: newAgentTokenName.trim() || suggestedAgentTokenName(),
					tokenHash,
					encryptedToken
				})
			});
			const result = await res.json();
			if (!res.ok) throw new Error(result.error || 'Could not create agent token');
			generatedAgentToken = {
				id: result.token.id,
				name: result.token.name,
				token,
				encrypted: Boolean(result.token.encryptedToken)
			};
			newAgentTokenName = '';
			accountNotice = encryptedToken
				? 'Agent token created and saved encrypted.'
				: 'Agent token created. Copy it now; set up encryption to reveal future tokens later.';
			await invalidate('account:agent-tokens');
		} catch (err) {
			accountError = err instanceof Error ? err.message : 'Could not create agent token';
		} finally {
			accountBusy = false;
		}
	}

	async function revealAgentApiToken(token: LayoutData['agentTokens'][number]) {
		if (tokenActionId) return;
		accountError = '';
		accountNotice = '';
		if (revealedAgentTokens[token.id]) {
			const remaining = { ...revealedAgentTokens };
			delete remaining[token.id];
			revealedAgentTokens = remaining;
			return;
		}
		if (!token.encryptedToken) {
			accountError = 'This token was not saved with encrypted reveal. Create a new encrypted token.';
			return;
		}
		if (!$e2eePrivateKey) {
			accountNotice = 'Unlock encryption to reveal saved agent tokens.';
			openE2eeDialog();
			return;
		}

		tokenActionId = token.id;
		try {
			const plaintext = await decryptString(
				token.encryptedToken as unknown as EncryptedEnvelope,
				$e2eePrivateKey
			);
			revealedAgentTokens = { ...revealedAgentTokens, [token.id]: plaintext };
		} catch (err) {
			accountError = err instanceof Error ? err.message : 'Could not reveal token';
		} finally {
			tokenActionId = null;
		}
	}

	async function revokeAgentApiToken(token: LayoutData['agentTokens'][number]) {
		if (tokenActionId) return;
		const confirmed = confirm(`Revoke "${token.name}"? Agents using this token will stop working.`);
		if (!confirmed) return;

		tokenActionId = token.id;
		accountError = '';
		accountNotice = '';
		try {
			const res = await fetch(`/api/account/agent-tokens/${token.id}`, { method: 'DELETE' });
			const result = await res.json();
			if (!res.ok) throw new Error(result.error || 'Could not revoke token');
			const remaining = { ...revealedAgentTokens };
			delete remaining[token.id];
			revealedAgentTokens = remaining;
			if (generatedAgentToken?.id === token.id) generatedAgentToken = null;
			accountNotice = 'Agent token revoked.';
			await invalidate('account:agent-tokens');
		} catch (err) {
			accountError = err instanceof Error ? err.message : 'Could not revoke token';
		} finally {
			tokenActionId = null;
		}
	}

	function formatAccountDate(value: string | Date | null | undefined): string {
		if (!value) return 'Not created yet';
		return new Date(value).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function passkeyTitle(passkey: LayoutData['passkeys'][number], index: number): string {
		if (passkey.backedUp || passkey.deviceType === 'multiDevice') return `Synced passkey ${index + 1}`;
		if (passkey.transports?.includes('internal')) return `Device passkey ${index + 1}`;
		return `Security key ${index + 1}`;
	}

	function passkeySubtitle(passkey: LayoutData['passkeys'][number]): string {
		const parts = [
			passkey.backedUp || passkey.deviceType === 'multiDevice' ? 'Synced' : 'Device-bound',
			passkey.transports?.length ? passkey.transports.map(formatTransport).join(', ') : null
		].filter(Boolean);
		return parts.join(' · ');
	}

	function formatTransport(transport: string): string {
		const labels: Record<string, string> = {
			internal: 'Built-in',
			hybrid: 'Phone',
			usb: 'USB',
			nfc: 'NFC',
			ble: 'Bluetooth'
		};
		return labels[transport] ?? transport;
	}

	function formatPasskeyLastUsed(value: string | Date | null | undefined): string {
		return value ? `Last used ${formatAccountDate(value)}` : 'Not used for sign-in yet';
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
	}

	function isEncryptedSession(session: LayoutData['sessions'][number]): boolean {
		return session.encryption_version === 'e2ee-v1';
	}

	function displaySessionTitle(session: LayoutData['sessions'][number]): string {
		if (!isEncryptedSession(session)) return session.title;
		return decryptedSessions[session.id]?.title ?? 'Encrypted delivery';
	}

	function displaySessionSummary(session: LayoutData['sessions'][number]): string | null {
		if (!isEncryptedSession(session)) return session.summary;
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
		recoveryKeyInput = '';
		e2eeDialog = $e2eeConfig.configured ? 'unlock' : 'setup';
	}

	async function setupE2ee() {
		if (e2eeBusy) return;
		e2eeBusy = true;
		e2eeError = '';
		e2eeNotice = '';
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
			const res = await fetch('/api/e2ee/config', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					publicKeyJwk: keyring.publicKeyJwk,
					encryptedPrivateKey: keyring.encryptedPrivateKey,
					passkeyCredentialId: passkeyEncryptedPrivateKey?.credentialId ?? null,
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
		} catch (err) {
			e2eeError = err instanceof Error ? err.message : 'Could not set up encryption';
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
		const encryptedPrivateKey = $e2eeConfig.passkeyEncryptedPrivateKey;
		if (!encryptedPrivateKey || e2eeBusy) return;

		e2eeBusy = true;
		e2eeError = '';
		e2eeNotice = '';
		try {
			const privateKey = await unlockPrivateKeyWithPasskey(encryptedPrivateKey);
			e2eePrivateKey.set(privateKey);
			e2eeDialog = null;
			recoveryKeyInput = '';
		} catch (err) {
			e2eeError = err instanceof Error ? err.message : 'Passkey could not unlock this relay.';
		} finally {
			e2eeBusy = false;
		}
	}

	function applyTheme(isDark: boolean) {
		document.documentElement.classList.toggle('dark', isDark);
		document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
	}

	function toggleTheme() {
		darkMode = !darkMode;
		applyTheme(darkMode);
		try {
			localStorage.setItem(THEME_KEY, darkMode ? 'dark' : 'light');
		} catch {}
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

	function handleSessionClick(id: string, event: MouseEvent) {
		if (suppressedSessionClick) {
			if (suppressedSessionClick.until < Date.now()) {
				suppressedSessionClick = null;
			} else if (suppressedSessionClick.id === id) {
				suppressedSessionClick = null;
				return;
			}
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
			await invalidate('inbox:sessions');
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
			const wasActive = activeSessionId === id;
			if (wasActive) {
				await goto('/portal', { replaceState: true });
			}
			await invalidate('inbox:sessions');
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

	afterNavigate(() => {
		pendingSessionId = null;
	});

	$effect(() => {
		const privateKey = $e2eePrivateKey;
		if (!privateKey) {
			decryptedSessions = {};
			return;
		}

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

			const savedTheme = localStorage.getItem(THEME_KEY);
			darkMode = savedTheme
				? savedTheme === 'dark'
				: window.matchMedia('(prefers-color-scheme: dark)').matches;
			applyTheme(darkMode);

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
			void invalidate('inbox:sessions');
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
		class="z-50 shrink-0 border-b border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-950 {activeSessionId
			? 'hidden sm:block'
			: ''}"
	>
		<div class="flex min-h-[4.5rem] items-center justify-between gap-3 px-4 py-2.5 sm:h-16 sm:min-h-16 sm:px-6 sm:py-0">
			<div class="flex min-w-0 flex-1 items-center gap-3">
				<Button
					variant="ghost"
					size="icon"
					class="hidden shrink-0 sm:inline-flex"
					onclick={toggleSidebar}
					title={effectiveSidebarCollapsed ? 'Show sessions' : 'Hide sessions'}
					aria-label={effectiveSidebarCollapsed ? 'Show sessions' : 'Hide sessions'}
					aria-expanded={!effectiveSidebarCollapsed}
				>
					{#if effectiveSidebarCollapsed}
						<PanelLeftOpen class="h-5 w-5" />
					{:else}
						<PanelLeftClose class="h-5 w-5" />
					{/if}
				</Button>
				<Logo class="h-10 w-10 shrink-0 sm:h-8 sm:w-8" />
				<span class="min-w-0 leading-none">
					<span class="block truncate text-lg font-bold leading-6 text-slate-900 dark:text-slate-100 sm:text-lg">
						Agent Relay
					</span>
					<span class="mt-1 block truncate text-sm font-medium leading-4 text-slate-500 dark:text-slate-400 sm:hidden">
						Inbox · {#if unreadCount > 0}{unreadCount} unread{:else}{data.sessions.length} messages{/if}
					</span>
				</span>
			</div>
			<div class="ml-auto flex shrink-0 items-center gap-2">
				<button
					type="button"
					onclick={openAccountDialog}
					title={data.currentUser?.email ?? 'Account'}
					aria-label="Account"
					class="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
				>
					<UserRound class="h-4 w-4" />
				</button>
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
				<button
					type="button"
					role="switch"
					aria-checked={darkMode}
					aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
					title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
					onclick={toggleTheme}
					class="inline-flex h-8 w-14 items-center rounded-full border border-slate-200 bg-slate-100 p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-800"
				>
					<span
						class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm transition-transform dark:bg-blue-500 dark:text-white {darkMode
							? 'translate-x-6'
							: 'translate-x-0'}"
						aria-hidden="true"
					>
						{#if darkMode}
							<Moon class="h-3.5 w-3.5" />
						{:else}
							<Sun class="h-3.5 w-3.5" />
						{/if}
					</span>
				</button>
				<Button variant="outline" size="sm" onclick={logout} class="shrink-0">Sign out</Button>
			</div>
		</div>
	</header>

	<div class="flex flex-1 min-h-0 overflow-hidden">
		<div
			class="relative shrink-0 flex-col min-h-0 overflow-hidden border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-950
				{activeSessionId ? 'hidden sm:flex' : 'flex w-full'}
				{effectiveSidebarCollapsed ? 'sm:w-0 sm:border-0' : 'w-full sm:w-[var(--sidebar-width)] sm:border-r'}
				{!isResizing && !effectiveSidebarCollapsed
				? 'transition-[width,border-color] duration-300 ease-in-out'
				: ''}"
			style={sidebarStyle}
			aria-hidden={effectiveSidebarCollapsed || (!isDesktop && Boolean(activeSessionId))}
		>
			<div class="hidden min-w-0 border-b border-slate-100 px-4 py-3 dark:border-slate-800 sm:block">
				<div class="flex items-center justify-between gap-3">
					<div class="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
						<Inbox class="h-4 w-4 text-[#3b82f6]" />
						Inbox
					</div>
					<span class="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-300">
						{#if unreadCount > 0}
							{unreadCount} unread
						{:else}
							{data.sessions.length}
						{/if}
					</span>
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
							{@const isPending = pendingSessionId === session.id}
							{@const title = displaySessionTitle(session)}
							{@const summary = displaySessionSummary(session)}
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
												{#if session.artifact_count}
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
			class="min-w-0 overflow-y-auto bg-slate-50 dark:bg-slate-950 {activeSessionId
				? 'flex-1'
				: 'hidden sm:block sm:flex-1'} sm:p-6"
		>
			{@render children()}
		</main>
	</div>
</div>

{#if accountDialogOpen}
	<div class="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
		<div
			class="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900"
		>
			<div class="flex items-start justify-between gap-3">
				<div>
					<h2 class="text-base font-semibold text-slate-900 dark:text-slate-100">Account</h2>
					<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
						{data.currentUser?.displayName || data.currentUser?.email}
					</p>
				</div>
				<button
					type="button"
					class="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
					aria-label="Close account dialog"
					onclick={() => {
						accountDialogOpen = false;
						accountError = '';
						accountNotice = '';
						generatedAgentToken = null;
					}}
				>
					×
				</button>
			</div>

			{#if accountError}
				<p class="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
					{accountError}
				</p>
			{/if}
			{#if accountNotice}
				<p class="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
					{accountNotice}
				</p>
			{/if}

			<div class="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
				<div class="min-w-0">
					<p class="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
						{data.currentUser?.email}
					</p>
					<p class="text-xs text-slate-500 dark:text-slate-400">Personal inbox account</p>
				</div>
			</div>

			<div class="mt-5 space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div class="min-w-0">
						<h3 class="text-sm font-semibold text-slate-900 dark:text-slate-100">Passkey</h3>
						<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
							Your account passkey signs you in and unlocks encryption.
						</p>
					</div>
				</div>

				<div class="max-h-56 space-y-2 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]">
					{#each data.passkeys as passkey, index (passkey.id)}
						<div class="flex items-start gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
							<span class="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-blue-600 dark:bg-slate-900 dark:text-blue-300">
								<KeyRound class="h-4 w-4" />
							</span>
							<div class="min-w-0 flex-1">
								<div class="flex flex-wrap items-center gap-2">
									<p class="text-sm font-medium text-slate-900 dark:text-slate-100">
										{passkeyTitle(passkey, index)}
									</p>
									{#if passkey.isCurrent}
										<span class="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-200">
											Used for this session
										</span>
									{/if}
								</div>
								<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
									Created {formatAccountDate(passkey.createdAt)}
								</p>
								<p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
									{formatPasskeyLastUsed(passkey.lastUsedAt)}
								</p>
								{#if passkeySubtitle(passkey)}
									<p class="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
										{passkeySubtitle(passkey)}
									</p>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>

			<div class="mt-5 space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div class="min-w-0">
						<h3 class="text-sm font-semibold text-slate-900 dark:text-slate-100">Agent API tokens</h3>
						<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
							Create one token per agent and revoke only the token that needs replacing.
						</p>
					</div>
				</div>

				<div class="flex flex-col gap-2 sm:flex-row">
					<input
						class="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
						bind:value={newAgentTokenName}
						placeholder="Token name"
						autocomplete="off"
					/>
					<Button
						variant="outline"
						size="sm"
						class="h-10 shrink-0"
						onclick={createAgentApiToken}
						disabled={accountBusy}
					>
						{accountBusy ? 'Creating…' : 'Create token'}
					</Button>
				</div>

				{#if generatedAgentToken}
					<div class="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/60 dark:bg-blue-950/30">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<p class="text-sm font-semibold text-slate-900 dark:text-slate-100">
								{generatedAgentToken.name}
							</p>
							<span class="text-xs text-slate-500 dark:text-slate-400">
								{generatedAgentToken.encrypted ? 'Encrypted reveal saved' : 'Shown once'}
							</span>
						</div>
						<input
							readonly
							value={generatedAgentToken.token}
							class="h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-xs text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
						/>
						<Button
							variant="outline"
							size="sm"
							class="w-full"
							onclick={() => navigator.clipboard?.writeText(generatedAgentToken?.token ?? '')}
						>
							Copy token
						</Button>
					</div>
				{/if}

				<div class="max-h-72 space-y-2 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]">
					{#if data.agentTokens.length === 0}
						<p class="rounded-lg bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-950 dark:text-slate-400">
							No agent tokens yet.
						</p>
					{:else}
						{#each data.agentTokens as token (token.id)}
							<div class="rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
								<div class="flex flex-wrap items-start justify-between gap-3">
									<div class="min-w-0">
										<p class="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
											{token.name}
										</p>
										<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
											Created {formatAccountDate(token.createdAt)}
										</p>
										<p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
											{token.lastUsedAt ? `Last used ${formatAccountDate(token.lastUsedAt)}` : 'Never used'}
										</p>
									</div>
									<div class="flex shrink-0 items-center gap-2">
										<Button
											variant="outline"
											size="sm"
											onclick={() => revealAgentApiToken(token)}
											disabled={tokenActionId === token.id || !token.encryptedToken}
											title={token.encryptedToken ? 'Reveal token' : 'Token was not saved encrypted'}
										>
											{revealedAgentTokens[token.id] ? 'Hide' : 'Reveal'}
										</Button>
										<Button
											variant="outline"
											size="sm"
											onclick={() => revokeAgentApiToken(token)}
											disabled={tokenActionId === token.id}
										>
											Revoke
										</Button>
									</div>
								</div>

								{#if revealedAgentTokens[token.id]}
									<div class="mt-3 space-y-2">
										<input
											readonly
											value={revealedAgentTokens[token.id]}
											class="h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
										/>
										<Button
											variant="outline"
											size="sm"
											class="w-full"
											onclick={() => navigator.clipboard?.writeText(revealedAgentTokens[token.id])}
										>
											Copy token
										</Button>
									</div>
								{/if}
							</div>
						{/each}
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

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
							? 'Create an encryption key secured by your account passkey, and save a recovery key fallback.'
							: 'Use your account passkey or recovery key to decrypt encrypted deliveries in this browser.'}
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
							Your account passkey can unlock encrypted deliveries in this browser.
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
							<Button size="sm" onclick={() => (e2eeDialog = null)}>Done</Button>
						</div>
					</div>
				{:else}
					<div class="mt-5 flex justify-end gap-2">
						<Button variant="outline" size="sm" onclick={() => (e2eeDialog = null)}>Cancel</Button>
						<Button size="sm" onclick={setupE2ee} disabled={e2eeBusy}>
							{e2eeBusy ? 'Creating…' : 'Create encrypted relay'}
						</Button>
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
