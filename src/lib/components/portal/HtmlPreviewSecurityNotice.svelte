<script lang="ts">
	import ShieldAlert from '@lucide/svelte/icons/shield-alert';
	import X from '@lucide/svelte/icons/x';
	import { onMount } from 'svelte';

	const DISMISS_STORAGE_KEY = 'arelay.html-preview-notice-dismissed';

	type Props = {
		hasRestrictedContent: boolean;
	};

	let { hasRestrictedContent }: Props = $props();

	let dismissed = $state(false);

	onMount(() => {
		dismissed = localStorage.getItem(DISMISS_STORAGE_KEY) === '1';
	});

	function dismiss() {
		dismissed = true;
		localStorage.setItem(DISMISS_STORAGE_KEY, '1');
	}
</script>

{#if !dismissed}
	<div
		role="status"
		class="relative flex shrink-0 items-start gap-2.5 border-b border-amber-200/80 bg-amber-50 px-4 py-3 pr-10 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
	>
		<ShieldAlert class="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
		<div class="min-w-0 space-y-1">
			<p class="font-medium">
				{#if hasRestrictedContent}
					Some of this HTML could not run in the secure preview.
				{:else}
					HTML previews run in a secure sandbox.
				{/if}
			</p>
			<p class="text-[13px] leading-5 text-amber-900/90 dark:text-amber-100/80">
				{#if hasRestrictedContent}
					Scripts and other active content are blocked here for security. Use the open-in-new-tab
					icon if you trust this file.
				{:else}
					Interactive behavior may differ from the original file. Use the open-in-new-tab icon if you
					trust this file and need full browser behavior.
				{/if}
			</p>
		</div>
		<button
			type="button"
			class="absolute right-2 top-2 rounded-md p-1 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/60"
			aria-label="Dismiss security notice"
			onclick={dismiss}
		>
			<X class="h-4 w-4" aria-hidden="true" />
		</button>
	</div>
{/if}
