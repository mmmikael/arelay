<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import LockKeyhole from '@lucide/svelte/icons/lock-keyhole';
	import LogOut from '@lucide/svelte/icons/log-out';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import UserRound from '@lucide/svelte/icons/user-round';
	import { e2eeConfig, e2eePrivateKey } from '$lib/e2ee-store';

	let {
		currentUserEmail,
		unreadCount,
		sessionCount,
		showMobileDetail,
		isAccountPage,
		onShieldClick,
		onLogout
	}: {
		currentUserEmail?: string | null;
		unreadCount: number;
		sessionCount: number;
		showMobileDetail: boolean;
		isAccountPage: boolean;
		onShieldClick: () => void | Promise<void>;
		onLogout: () => void | Promise<void>;
	} = $props();
</script>

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
				Sessions · {#if unreadCount > 0}{unreadCount} unread{:else}{sessionCount} sessions{/if}
			</span>
		</div>
		<div class="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
			<a
				href="/portal/account"
				title={currentUserEmail ?? 'Account'}
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
				onclick={onShieldClick}
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
				onclick={onLogout}
				class="h-8 w-8 shrink-0 sm:hidden"
				aria-label="Sign out"
				title="Sign out"
			>
				<LogOut class="h-4 w-4" />
			</Button>
			<Button variant="outline" size="sm" onclick={onLogout} class="hidden shrink-0 sm:inline-flex">
				Sign out
			</Button>
		</div>
	</div>
</header>
