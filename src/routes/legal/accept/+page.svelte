<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
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
					Agent Relay is not a backup service. Keep independent copies of important content,
					and safely store any encryption recovery material.
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

			<form method="POST" class="mt-5 space-y-4">
				<label
					for="existing-legal-acceptance"
					class="flex cursor-pointer items-start gap-3 text-sm leading-5 text-slate-600 dark:text-slate-300"
				>
					<input
						id="existing-legal-acceptance"
						type="checkbox"
						name="accepted"
						value="yes"
						required
						class="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
					/>
					<span>I agree to the Terms of Service and acknowledge the Privacy Policy.</span>
				</label>

				{#if form?.error}
					<p class="text-sm text-red-600 dark:text-red-400">{form.error}</p>
				{/if}

				<Button type="submit" class="h-11 w-full">Agree and continue</Button>
			</form>
		</div>
	</div>
</main>
