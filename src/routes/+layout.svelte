<script lang="ts">
	import '../app.css';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
</script>

<svelte:head>
	{#if data.umami}
		<script
			defer
			src={data.umami.scriptUrl}
			data-website-id={data.umami.websiteId}
		></script>
	{/if}
</svelte:head>

{@render children()}
