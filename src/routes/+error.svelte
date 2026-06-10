<script lang="ts">
	import { page } from '$app/stores';
	import Logo from '$lib/components/Logo.svelte';

	$: requestId = $page.error?.requestId ?? $page.data.requestId ?? null;
</script>

<div class="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
	<Logo class="h-8" />
	<h1 class="text-2xl font-semibold">{$page.status}</h1>
	<p class="max-w-md text-muted-foreground">{$page.error?.message ?? 'Something went wrong.'}</p>
	{#if requestId}
		<p class="font-mono text-xs text-muted-foreground">Reference: {requestId}</p>
	{/if}
</div>
