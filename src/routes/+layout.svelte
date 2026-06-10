<script lang="ts">
	import '../app.css';
	import { syncUmamiOptOut } from '$lib/umami-opt-out';
	import { onMount } from 'svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	onMount(() => {
		syncUmamiOptOut();
	});
</script>

<svelte:head>
	{#if data.umami}
		<script
			defer
			src={data.umami.scriptUrl}
			data-website-id={data.umami.websiteId}
		></script>
	{/if}
	{#if data.seo.canonicalUrl}
		<link rel="canonical" href={data.seo.canonicalUrl} />
	{/if}
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="Agent Relay" />
	<meta property="og:title" content={data.seo.title} />
	<meta property="og:description" content={data.seo.description} />
	{#if data.seo.canonicalUrl}
		<meta property="og:url" content={data.seo.canonicalUrl} />
	{/if}
	<meta property="og:image" content={data.seo.imageUrl} />
	<meta property="og:image:width" content={String(data.seo.imageWidth)} />
	<meta property="og:image:height" content={String(data.seo.imageHeight)} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={data.seo.title} />
	<meta name="twitter:description" content={data.seo.description} />
	<meta name="twitter:image" content={data.seo.imageUrl} />
</svelte:head>

{@render children()}
