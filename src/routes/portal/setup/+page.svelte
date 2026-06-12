<script lang="ts">
	import { onMount } from 'svelte';
	import { OPEN_E2EE_DIALOG_KEY, type OpenE2eeDialog } from '$lib/portal-context';
	import { getContext } from 'svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';

	const openE2eeDialog = getContext<OpenE2eeDialog>(OPEN_E2EE_DIALOG_KEY);

	onMount(() => {
		openE2eeDialog();
	});
</script>

<svelte:head>
	<title>Set up encryption — Agent Relay</title>
</svelte:head>

<div class="flex min-h-full items-center justify-center p-6">
	<div class="max-w-md rounded-xl border border-slate-100 bg-white p-8 text-center shadow-[0_4px_20px_rgba(0,0,0,0.04)] dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
		<div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-[#2563eb] dark:bg-blue-950/40 dark:text-blue-300">
			<ShieldCheck class="h-6 w-6" />
		</div>
		<h1 class="text-xl font-semibold text-slate-900 dark:text-slate-100">Encryption required</h1>
		<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
			Agent Relay only accepts end-to-end encrypted deliveries. Set up encryption with your passkey
			before using sessions or creating agent tokens.
		</p>
		<Button class="mt-6" onclick={() => openE2eeDialog()}>Set up encryption</Button>
		<p class="mt-4 text-xs text-slate-400 dark:text-slate-500">
			Once encryption is set up, the
			<a
				href="/getting-started"
				class="font-semibold text-blue-600 underline underline-offset-2 dark:text-blue-300"
				>getting started guide</a
			> shows how to connect your first agent.
		</p>
	</div>
</div>
