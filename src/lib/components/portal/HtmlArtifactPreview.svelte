<script lang="ts">
	import HtmlPreviewSecurityNotice from '$lib/components/portal/HtmlPreviewSecurityNotice.svelte';
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
		/** Hide the security notice (e.g. fullscreen preview). */
		hideNotice?: boolean;
	};

	let { sourceHtml, previewDoc, title, class: className, hideNotice = false }: Props = $props();

	const hasRestrictedContent = $derived(artifactHtmlHasBlockedInteractivity(sourceHtml));

	$effect(() => {
		if (hasRestrictedContent) {
			console.debug('[preview] HTML contains active content blocked by sandboxed preview');
		}
	});
</script>

<div class={cn('flex min-h-0 flex-col', className)}>
	{#if !hideNotice}
		<HtmlPreviewSecurityNotice {hasRestrictedContent} />
	{/if}
	<iframe
		srcdoc={previewDoc}
		{title}
		sandbox={HTML_ARTIFACT_PREVIEW_SANDBOX}
		referrerpolicy={HTML_PREVIEW_REFERRER_POLICY}
		class="min-h-0 w-full flex-1 border-0 bg-white dark:bg-slate-950"
	></iframe>
</div>
