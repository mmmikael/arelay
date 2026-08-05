<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import Check from '@lucide/svelte/icons/check';
	import Github from '@lucide/svelte/icons/github';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let interval = $state<'monthly' | 'yearly'>('monthly');
	let busyPlan = $state('');
	let checkoutError = $state('');

	function formatPrice(price: { amountCents: number; currency: string } | null): string | null {
		if (!price) return null;
		const amount = price.amountCents / 100;
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: price.currency.toUpperCase(),
			minimumFractionDigits: Number.isInteger(amount) ? 0 : 2
		}).format(amount);
	}

	const proPrice = $derived(
		interval === 'monthly' ? formatPrice(data.prices?.proMonthly ?? null) : formatPrice(data.prices?.proYearly ?? null)
	);
	const foundingPrice = $derived(formatPrice(data.prices?.founding ?? null));
	const foundingSoldOut = $derived(data.foundingRemaining !== null && data.foundingRemaining <= 0);

	async function startCheckout(plan: 'pro' | 'founding') {
		busyPlan = plan;
		checkoutError = '';
		try {
			const response = await fetch('/api/billing/checkout', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(plan === 'pro' ? { plan, interval } : { plan })
			});
			const body = (await response.json()) as { url?: string; error?: string };
			if (!response.ok || !body.url) {
				throw new Error(body.error ?? 'Could not start checkout. Try again shortly.');
			}
			window.location.href = body.url;
		} catch (err) {
			checkoutError = err instanceof Error ? err.message : 'Could not start checkout.';
			busyPlan = '';
		}
	}

	const FREE_FEATURES = [
		'End-to-end encrypted inbox',
		'500 MB encrypted storage',
		'25 MB per artifact',
		'Unlimited agent tokens',
		'Email & spend approvals'
	];
	const PRO_FEATURES = [
		'Everything in Free',
		'10 GB encrypted storage',
		'100 MB per artifact',
		'Priority support',
		'First access to new Pro features'
	];
	const FOUNDING_FEATURES = [
		'Everything in Pro — for life',
		'One payment, no subscription',
		'Locked in before prices rise',
		'Directly funds the open-source project'
	];
</script>

<svelte:head>
	<title>Pricing — Agent Relay</title>
	<meta
		name="description"
		content="Agent Relay pricing: free encrypted inbox for AI agent deliveries, Pro with 10 GB storage, and a one-time founding license. Self-hosting is free forever."
	/>
	<meta property="og:title" content="Pricing — Agent Relay" />
	<meta name="twitter:title" content="Pricing — Agent Relay" />
</svelte:head>

<main class="mx-auto min-h-screen w-full max-w-5xl px-4 py-8 sm:px-8 sm:py-14">
	<header class="flex items-center justify-between">
		<a href="/" class="inline-flex items-center gap-3 text-slate-900 dark:text-slate-100">
			<Logo class="h-10 w-10" />
			<span class="text-xl font-bold">Agent Relay</span>
		</a>
		<ThemeToggle />
	</header>

	<section class="mt-10 text-center sm:mt-14">
		<h1 class="text-3xl font-semibold text-slate-950 sm:text-4xl dark:text-white">
			Simple pricing, open source forever
		</h1>
		<p class="mx-auto mt-3 max-w-2xl text-base text-slate-500 dark:text-slate-400">
			The hosted service runs, backs up, and updates Agent Relay for you — and funds development.
			Self-hosting is free, always.
		</p>
	</section>

	{#if !data.billingEnabled}
		<div
			class="mx-auto mt-10 max-w-xl rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
		>
			Paid plans are not enabled on this deployment. Every account runs on the free plan —
			see <a
				href="https://github.com/mmmikael/arelay"
				class="font-medium text-blue-600 underline dark:text-blue-300">the self-hosting guide</a
			> to run your own instance.
		</div>
	{/if}

	<section class="mt-10 grid gap-6 md:grid-cols-3">
		<!-- Free -->
		<div class="flex flex-col rounded-2xl border border-slate-200 p-6 dark:border-slate-800">
			<h2 class="text-lg font-semibold text-slate-950 dark:text-white">Free</h2>
			<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Everything you need to start.</p>
			<p class="mt-4 text-4xl font-semibold text-slate-950 dark:text-white">$0</p>
			<p class="text-sm text-slate-500 dark:text-slate-400">forever</p>
			<ul class="mt-6 flex-1 space-y-2.5 text-sm text-slate-600 dark:text-slate-300">
				{#each FREE_FEATURES as feature (feature)}
					<li class="flex items-start gap-2">
						<Check class="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
						{feature}
					</li>
				{/each}
			</ul>
			<a
				href="/"
				class="mt-6 inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
			>
				{data.authenticated ? 'Included in your account' : 'Sign up free'}
			</a>
		</div>

		<!-- Pro -->
		<div
			class="flex flex-col rounded-2xl border-2 border-blue-500 p-6 shadow-sm dark:border-blue-400"
		>
			<div class="flex items-center justify-between">
				<h2 class="text-lg font-semibold text-slate-950 dark:text-white">Pro</h2>
				<div
					class="inline-flex rounded-full border border-slate-200 p-0.5 text-xs dark:border-slate-700"
					role="tablist"
					aria-label="Billing interval"
				>
					<button
						type="button"
						role="tab"
						aria-selected={interval === 'monthly'}
						class="rounded-full px-2.5 py-1 font-medium {interval === 'monthly'
							? 'bg-blue-600 text-white'
							: 'text-slate-500 dark:text-slate-400'}"
						onclick={() => (interval = 'monthly')}
					>
						Monthly
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={interval === 'yearly'}
						class="rounded-full px-2.5 py-1 font-medium {interval === 'yearly'
							? 'bg-blue-600 text-white'
							: 'text-slate-500 dark:text-slate-400'}"
						onclick={() => (interval = 'yearly')}
					>
						Yearly
					</button>
				</div>
			</div>
			<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
				Room for everything your agents deliver.
			</p>
			<p class="mt-4 text-4xl font-semibold text-slate-950 dark:text-white">
				{proPrice ?? (interval === 'monthly' ? '$9' : '$79')}
			</p>
			<p class="text-sm text-slate-500 dark:text-slate-400">
				per {interval === 'monthly' ? 'month' : 'year'}
			</p>
			<ul class="mt-6 flex-1 space-y-2.5 text-sm text-slate-600 dark:text-slate-300">
				{#each PRO_FEATURES as feature (feature)}
					<li class="flex items-start gap-2">
						<Check class="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
						{feature}
					</li>
				{/each}
			</ul>
			{#if data.authenticated && data.billingEnabled}
				<button
					type="button"
					class="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
					disabled={busyPlan !== ''}
					onclick={() => startCheckout('pro')}
				>
					{busyPlan === 'pro' ? 'Opening checkout…' : 'Upgrade to Pro'}
				</button>
			{:else}
				<a
					href="/"
					class="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-500"
				>
					Sign up free, upgrade inside
				</a>
			{/if}
		</div>

		<!-- Founding -->
		<div
			class="flex flex-col rounded-2xl border border-amber-400/60 bg-amber-50/50 p-6 dark:border-amber-300/30 dark:bg-amber-400/5"
		>
			<div class="flex items-center justify-between">
				<h2 class="text-lg font-semibold text-slate-950 dark:text-white">Founding</h2>
				{#if data.foundingRemaining !== null}
					<span
						class="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-amber-800 dark:bg-amber-300/15 dark:text-amber-200"
					>
						{foundingSoldOut ? 'Sold out' : `${data.foundingRemaining}/${data.foundingCap} left`}
					</span>
				{/if}
			</div>
			<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
				Pro for life, one payment. Early-believer price.
			</p>
			<p class="mt-4 text-4xl font-semibold text-slate-950 dark:text-white">
				{foundingPrice ?? '$79'}
			</p>
			<p class="text-sm text-slate-500 dark:text-slate-400">once, forever</p>
			<ul class="mt-6 flex-1 space-y-2.5 text-sm text-slate-600 dark:text-slate-300">
				{#each FOUNDING_FEATURES as feature (feature)}
					<li class="flex items-start gap-2">
						<Check class="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
						{feature}
					</li>
				{/each}
			</ul>
			{#if data.authenticated && data.billingEnabled}
				<button
					type="button"
					class="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-amber-500 text-sm font-medium text-white hover:bg-amber-400 disabled:opacity-60"
					disabled={busyPlan !== '' || foundingSoldOut}
					onclick={() => startCheckout('founding')}
				>
					{foundingSoldOut
						? 'All licenses claimed'
						: busyPlan === 'founding'
							? 'Opening checkout…'
							: 'Get a founding license'}
				</button>
			{:else}
				<a
					href="/"
					class="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-amber-500 text-sm font-medium text-white hover:bg-amber-400"
				>
					Sign up free, upgrade inside
				</a>
			{/if}
		</div>
	</section>

	{#if checkoutError}
		<p class="mt-4 text-center text-sm text-red-600 dark:text-red-400">{checkoutError}</p>
	{/if}

	<section
		class="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-slate-200 p-6 text-center sm:flex-row sm:text-left dark:border-slate-800"
	>
		<Github class="h-8 w-8 shrink-0 text-slate-700 dark:text-slate-300" />
		<div class="flex-1">
			<h2 class="text-base font-semibold text-slate-950 dark:text-white">
				Prefer to run it yourself?
			</h2>
			<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
				Agent Relay is MIT-licensed. Self-host the full product — every feature, no seat limits.
				Paid plans exist to fund development and run the hosted service.
			</p>
		</div>
		<a
			href="https://github.com/mmmikael/arelay"
			target="_blank"
			rel="noreferrer"
			class="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
		>
			View on GitHub
		</a>
	</section>

	<section class="mx-auto mt-12 max-w-2xl">
		<h2 class="text-center text-xl font-semibold text-slate-950 dark:text-white">Questions</h2>
		<dl class="mt-6 space-y-6 text-sm">
			<div>
				<dt class="font-semibold text-slate-900 dark:text-slate-100">
					What happens if I go over my storage limit?
				</dt>
				<dd class="mt-1 text-slate-500 dark:text-slate-400">
					Nothing is deleted. New deliveries are rejected with a clear error until you free up
					space or upgrade — your agents see the reason and can retry.
				</dd>
			</div>
			<div>
				<dt class="font-semibold text-slate-900 dark:text-slate-100">
					Can you read what my agents deliver?
				</dt>
				<dd class="mt-1 text-slate-500 dark:text-slate-400">
					No. Deliveries are end-to-end encrypted on every plan — content is decrypted in your
					browser, never on the server. Billing does not change the encryption model.
				</dd>
			</div>
			<div>
				<dt class="font-semibold text-slate-900 dark:text-slate-100">
					What exactly does the founding license include?
				</dt>
				<dd class="mt-1 text-slate-500 dark:text-slate-400">
					Every Pro feature on the hosted service, for the lifetime of the service, with no
					recurring payment. Limited to the first {data.foundingCap ?? 100} accounts.
				</dd>
			</div>
			<div>
				<dt class="font-semibold text-slate-900 dark:text-slate-100">How are payments handled?</dt>
				<dd class="mt-1 text-slate-500 dark:text-slate-400">
					Through Stripe Checkout. Card details never touch Agent Relay servers, and you can
					manage or cancel a subscription any time from your account page.
				</dd>
			</div>
		</dl>
	</section>

	<footer class="mt-14 border-t border-slate-200 pt-6 text-center text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
		<a href="/" class="hover:underline">Home</a>
		·
		<a href="/getting-started" class="hover:underline">Getting started</a>
		·
		<a href="/terms" class="hover:underline">Terms</a>
		·
		<a href="/privacy" class="hover:underline">Privacy</a>
	</footer>
</main>
