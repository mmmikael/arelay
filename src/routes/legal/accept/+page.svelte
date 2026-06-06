<script lang="ts">
	import { goto } from '$app/navigation';
	import Logo from '$lib/components/Logo.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let accepted = $state(false);
	let busy = $state(false);
	let error = $state('');

	async function submitAcceptance() {
		if (busy || !accepted) return;
		busy = true;
		error = '';
		try {
			const res = await fetch('/api/legal/accept', { method: 'POST' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				throw new Error(
					typeof body.error === 'string' ? body.error : 'Could not save your acceptance'
				);
			}
			await goto('/portal');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not save your acceptance';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Review updated terms — Agent Relay</title>
	<meta name="description" content="Review the Agent Relay hosted service terms." />
</svelte:head>

<main class="flex min-h-screen items-center justify-center px-4 py-10">
	<div class="w-full max-w-md">
		<div class="mb-7 flex items-center justify-center gap-3">
			<Logo class="h-11 w-11" />
			<span class="text-2xl font-bold text-slate-900 dark:text-slate-100">Agent Relay</span>
		</div>

		<div class="glass-card p-6 sm:p-8">
			<div class="text-center">
				<h1 class="text-2xl font-semibold text-slate-950 dark:text-white">
					One quick review
				</h1>
				<p class="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
					Before continuing as {data.email}, please review the hosted service terms.
				</p>
			</div>

			<div class="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
				<p>
					Agent Relay requires end-to-end encryption for all agent deliveries. It is not a
					backup service — keep independent copies of important content and safely store your
					encryption recovery material.
				</p>
				<div class="mt-3 flex gap-4 font-semibold">
					<a href="/terms" class="text-blue-600 underline underline-offset-2 dark:text-blue-300">
						Terms of Service
					</a>
					<a href="/privacy" class="text-blue-600 underline underline-offset-2 dark:text-blue-300">
						Privacy Policy
					</a>
				</div>
			</div>

			<div class="mt-5 space-y-4">
				<label
					for="existing-legal-acceptance"
					class="flex cursor-pointer items-start gap-3 text-sm leading-5 text-slate-600 dark:text-slate-300"
				>
					<input
						id="existing-legal-acceptance"
						type="checkbox"
						bind:checked={accepted}
						class="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
					/>
					<span>I agree to the Terms of Service and acknowledge the Privacy Policy.</span>
				</label>

				{#if error}
					<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
				{/if}

				<Button
					type="button"
					class="h-11 w-full"
					disabled={busy || !accepted}
					onclick={submitAcceptance}
				>
					{busy ? 'Saving…' : 'Agree and continue'}
				</Button>
			</div>
		</div>
	</div>
</main>
