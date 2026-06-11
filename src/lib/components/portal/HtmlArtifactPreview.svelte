<script lang="ts">
	import HtmlPreviewSecurityNotice from '$lib/components/portal/HtmlPreviewSecurityNotice.svelte';
	import { openTrustedHtmlInNewTab } from '$lib/preview-html-interactivity';
	import { artifactHtmlHasBlockedInteractivity } from '$lib/preview-sanitize';
	import {
		HTML_ARTIFACT_PREVIEW_SANDBOX,
		HTML_PREVIEW_REFERRER_POLICY
	} from '$lib/preview-sandbox';
	import { cn } from '$lib/utils';

	type Props = {
		sourceHtml: string;
		previewDoc: string;
		title: string;
		class?: string;
	};

	let { sourceHtml, previewDoc, title, class: className }: Props = $props();

	let openTabError = $state('');

	const hasRestrictedContent = $derived(artifactHtmlHasBlockedInteractivity(sourceHtml));

	$effect(() => {
		sourceHtml;
		openTabError = '';
	});

	$effect(() => {
		if (hasRestrictedContent) {
			console.debug('[preview] HTML contains active content blocked by sandboxed preview');
		}
	});

	function openInNewTab() {
		if (!sourceHtml.trim()) return;

		openTabError = '';
		try {
			openTrustedHtmlInNewTab(sourceHtml);
		} catch (err) {
			openTabError =
				err instanceof Error ? err.message : 'Could not open HTML in a new tab';
			console.warn('[preview] trusted HTML open failed:', err);
		}
	}
</script>

<div class={cn('flex min-h-0 flex-col', className)}>
	<HtmlPreviewSecurityNotice
		{hasRestrictedContent}
		openError={openTabError}
		onOpenTrusted={openInNewTab}
	/>
	<iframe
		srcdoc={previewDoc}
		{title}
		sandbox={HTML_ARTIFACT_PREVIEW_SANDBOX}
		referrerpolicy={HTML_PREVIEW_REFERRER_POLICY}
		class="min-h-0 w-full flex-1 border-0 bg-white dark:bg-slate-950"
	></iframe>
</div>
