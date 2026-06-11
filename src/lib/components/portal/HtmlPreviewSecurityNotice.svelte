<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import ShieldAlert from '@lucide/svelte/icons/shield-alert';

	type Props = {
		hasRestrictedContent: boolean;
		openError?: string;
		onOpenTrusted: () => void;
	};

	let { hasRestrictedContent, openError = '', onOpenTrusted }: Props = $props();
</script>

<div
	role="status"
	class="flex shrink-0 flex-col gap-3 border-b border-amber-200/80 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between"
>
	<div class="flex min-w-0 items-start gap-2.5">
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
					Scripts and other active content are blocked here for security. Open in a new tab if you trust
					this file.
				{:else}
					Interactive behavior may differ from the original file. Open in a new tab if you trust this file
					and need full browser behavior.
				{/if}
			</p>
			{#if openError}
				<p class="text-[13px] text-red-600 dark:text-red-400">{openError}</p>
			{/if}
		</div>
	</div>
	<Button
		variant="outline"
		size="sm"
		class="shrink-0 border-amber-300 bg-white hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:hover:bg-amber-900/60"
		onclick={onOpenTrusted}
	>
		<ExternalLink class="h-4 w-4" aria-hidden="true" />
		Open in new tab
	</Button>
</div>
