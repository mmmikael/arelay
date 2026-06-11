<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';
	import { openTrustedHtmlInNewTab } from '$lib/preview-html-interactivity';
	import ExternalLink from '@lucide/svelte/icons/external-link';

	type Props = {
		sourceHtml: string;
		disabled?: boolean;
	};

	let { sourceHtml, disabled = false }: Props = $props();

	let openError = $state('');

	$effect(() => {
		sourceHtml;
		openError = '';
	});

	function openInNewTab() {
		if (!sourceHtml.trim() || disabled) return;

		openError = '';
		try {
			openTrustedHtmlInNewTab(sourceHtml);
		} catch (err) {
			openError =
				err instanceof Error ? err.message : 'Could not open HTML in a new tab';
			console.warn('[preview] trusted HTML open failed:', err);
		}
	}
</script>

<Button
	variant="ghost"
	size="icon"
	title={openError || 'Open in new tab'}
	aria-label={openError || 'Open in new tab'}
	disabled={disabled || !sourceHtml.trim()}
	onclick={openInNewTab}
>
	<ExternalLink class="h-4 w-4" />
</Button>
