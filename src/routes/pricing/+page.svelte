<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import Check from '@lucide/svelte/icons/check';
	import Github from '@lucide/svelte/icons/github';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Users from '@lucide/svelte/icons/users';
	import { FALLBACK_PRICE_DISPLAY } from '$lib/billing/plans';
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
		interval === 'monthly'
			? (formatPrice(data.prices?.proMonthly ?? null) ?? FALLBACK_PRICE_DISPLAY.proMonthly)
			: (formatPrice(data.prices?.proYearly ?? null) ?? FALLBACK_PRICE_DISPLAY.proYearly)
	);
	const foundingPrice = $derived(
		formatPrice(data.prices?.founding ?? null) ?? FALLBACK_PRICE_DISPLAY.founding
	);
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

	const approvalsLabel = $derived(
		data.spendApprovals
			? 'Email and spend approvals: nothing sends or charges until you say so'
			: 'Email approvals: nothing sends until you say so'
	);
	const PERSONAL_FEATURES = $derived([
		approvalsLabel,
		'Private inbox for agent deliveries, end-to-end encrypted',
		'Unlimited deliveries and agent tokens',
		'One inbox, one approver: you',
		'500 MB encrypted storage, 25 MB per file'
	]);
	const PRO_FEATURES = [
		'Everything in Personal',
		'10 GB encrypted storage, 100 MB per file',
		'Priority support from the maintainer',
		'Every team capability below, included in your seat as it ships'
	];
	const PRO_ROADMAP = [
		'Approval rules: auto-approve under a limit to known payees, always ask above it',
		'Notification channels for time-sensitive approvals (Slack, Telegram, push)',
		'Audit export of your own approval history',
		'Add a second member and org keys turn on: shared inboxes, multiple approvers, roles, an org-wide audit log, SSO'
	];
</script>

<svelte:head>
	<title>Pricing — Agent Relay</title>
	<meta
		name="description"
		content="Agent Relay pricing: free for one person watching their own agents, one paid plan priced per member, and self-hosting under MIT for everything else."
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
			Free for one person watching their own agents.
		</h1>
		<p class="mx-auto mt-3 max-w-2xl text-base text-slate-500 dark:text-slate-400">
			Paid the moment the consequences involve more people. One paid plan, priced per member, no
			tiers to compare. Self-hosting is free forever under MIT.
		</p>
	</section>

	{#if !data.billingEnabled}
		<div
			class="mx-auto mt-10 max-w-xl rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
		>
			Paid plans are not enabled on this deployment. Every account runs on the Personal plan — see <a
				href="https://github.com/mmmikael/arelay"
				class="font-medium text-blue-600 underline dark:text-blue-300">the self-hosting guide</a
			> to run your own instance.
		</div>
	{/if}

	<section class="mx-auto mt-10 grid max-w-4xl gap-6 md:grid-cols-2">
		<!-- Personal -->
		<div class="flex flex-col rounded-2xl border border-slate-200 p-6 dark:border-slate-800">
			<h2 class="text-lg font-semibold text-slate-950 dark:text-white">Personal</h2>
			<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
				One person, one key, every approval gate. Genuinely useful forever.
			</p>
			<p class="mt-4 text-4xl font-semibold text-slate-950 dark:text-white">$0</p>
			<p class="text-sm text-slate-500 dark:text-slate-400">free, forever</p>
			<ul class="mt-6 flex-1 space-y-2.5 text-sm text-slate-600 dark:text-slate-300">
				{#each PERSONAL_FEATURES as feature (feature)}
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
			<div class="flex items-center justify-between gap-3">
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
				For the person whose agents have real consequences, and the team that follows.
			</p>
			<p class="mt-4 text-4xl font-semibold text-slate-950 dark:text-white">{proPrice}</p>
			<p class="text-sm text-slate-500 dark:text-slate-400">
				per member, per {interval === 'monthly' ? 'month' : 'year'}
			</p>
			<ul class="mt-6 space-y-2.5 text-sm text-slate-600 dark:text-slate-300">
				{#each PRO_FEATURES as feature (feature)}
					<li class="flex items-start gap-2">
						<Check class="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
						{feature}
					</li>
				{/each}
			</ul>
			<div
				class="mt-4 flex-1 rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-700"
			>
				<p
					class="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400"
				>
					<Sparkles class="h-3.5 w-3.5" />
					Shipping next, no plan change
				</p>
				<ul class="mt-2 space-y-2 text-sm text-slate-600 dark:text-slate-300">
					{#each PRO_ROADMAP as item (item)}
						<li class="flex items-start gap-2">
							<Users class="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
							{item}
						</li>
					{/each}
				</ul>
			</div>
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
	</section>

	{#if data.billingEnabled}
		<!-- Founding license: a one-time alternative to the Pro subscription, not a third plan. -->
		<section
			class="mx-auto mt-6 flex max-w-4xl flex-col gap-4 rounded-2xl border border-amber-400/60 bg-amber-50/50 p-5 sm:flex-row sm:items-center dark:border-amber-300/30 dark:bg-amber-400/5"
		>
			<div class="flex-1">
				<div class="flex flex-wrap items-center gap-2">
					<h2 class="text-base font-semibold text-slate-950 dark:text-white">Founding license</h2>
					{#if data.foundingRemaining !== null}
						<span
							class="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-amber-800 dark:bg-amber-300/15 dark:text-amber-200"
						>
							{foundingSoldOut ? 'Sold out' : `${data.foundingRemaining} left`}
						</span>
					{/if}
				</div>
				<p class="mt-1 text-sm text-slate-600 dark:text-slate-300">
					<strong class="text-slate-950 dark:text-white">{foundingPrice} once</strong>
					for Pro, one member, for the lifetime of the service. No subscription, and the money goes straight
					into the open-source project.
				</p>
			</div>
			{#if data.authenticated}
				<button
					type="button"
					class="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-amber-500 px-4 text-sm font-medium text-white hover:bg-amber-400 disabled:opacity-60"
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
					class="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-amber-500 px-4 text-sm font-medium text-white hover:bg-amber-400"
				>
					Sign up free, upgrade inside
				</a>
			{/if}
		</section>
	{/if}

	{#if checkoutError}
		<p class="mt-4 text-center text-sm text-red-600 dark:text-red-400">{checkoutError}</p>
	{/if}

	<section
		class="mx-auto mt-10 flex max-w-4xl flex-col items-center gap-3 rounded-2xl border border-slate-200 p-6 text-center sm:flex-row sm:text-left dark:border-slate-800"
	>
		<Github class="h-8 w-8 shrink-0 text-slate-700 dark:text-slate-300" />
		<div class="flex-1">
			<h2 class="text-base font-semibold text-slate-950 dark:text-white">
				Your VPC, your keys, your data residency? Self-host.
			</h2>
			<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
				Agent Relay is MIT-licensed. Run the full product on your own infrastructure with every
				feature and no seat limits. The hosted plans pay for the hosted service and fund
				development; they never gate the source.
			</p>
		</div>
		<a
			href="https://github.com/mmmikael/arelay#self-hosting"
			target="_blank"
			rel="noreferrer"
			class="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
		>
			Self-hosting guide
		</a>
	</section>

	<section class="mx-auto mt-12 max-w-2xl">
		<h2 class="text-center text-xl font-semibold text-slate-950 dark:text-white">Questions</h2>
		<dl class="mt-6 space-y-6 text-sm">
			<div>
				<dt class="font-semibold text-slate-900 dark:text-slate-100">Why per member?</dt>
				<dd class="mt-1 text-slate-500 dark:text-slate-400">
					One member is one encryption key, and only that key can read the inbox. A second person
					needs their own key, so "add a member" is the upgrade, not a plan migration. Today every
					account has one member and you pay for one seat; when shared inboxes ship, adding a
					colleague adds a seat and nothing else changes.
				</dd>
			</div>
			<div>
				<dt class="font-semibold text-slate-900 dark:text-slate-100">
					Can you read what my agents deliver?
				</dt>
				<dd class="mt-1 text-slate-500 dark:text-slate-400">
					No. Deliveries are end-to-end encrypted on every plan and decrypted in your browser. The
					one exception is the moment you approve an email: that message is revealed to the server
					for the length of the send request, because email itself is not encrypted. The full
					picture is on the <a
						href="/security"
						class="font-medium text-blue-600 underline dark:text-blue-300">security page</a
					>.
				</dd>
			</div>
			<div>
				<dt class="font-semibold text-slate-900 dark:text-slate-100">
					What happens if I go over my storage limit?
				</dt>
				<dd class="mt-1 text-slate-500 dark:text-slate-400">
					Nothing is deleted. New deliveries are rejected with a clear error until you free up space
					or upgrade — your agents see the reason and can retry.
				</dd>
			</div>
			<div>
				<dt class="font-semibold text-slate-900 dark:text-slate-100">What if I stop paying?</dt>
				<dd class="mt-1 text-slate-500 dark:text-slate-400">
					You keep your keys, so everything you already received stays readable. Only the Pro limits
					stop applying to new uploads. A lapsed plan never turns into unreadable data.
				</dd>
			</div>
			<div>
				<dt class="font-semibold text-slate-900 dark:text-slate-100">
					What exactly does the founding license include?
				</dt>
				<dd class="mt-1 text-slate-500 dark:text-slate-400">
					Pro for one member on the hosted service, for the lifetime of the service, with no
					recurring payment. A limited run for early backers; the badge above shows how many are
					left. It is a thank-you for backing the project early, not a discount code.
				</dd>
			</div>
			<div>
				<dt class="font-semibold text-slate-900 dark:text-slate-100">How are payments handled?</dt>
				<dd class="mt-1 text-slate-500 dark:text-slate-400">
					Through Stripe Checkout. Card details never touch Agent Relay servers, invoices are
					available in the billing portal, and you can cancel any time from your account page.
				</dd>
			</div>
		</dl>
	</section>

	<footer
		class="mt-14 border-t border-slate-200 pt-6 text-center text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500"
	>
		<a href="/" class="hover:underline">Home</a>
		·
		<a href="/getting-started" class="hover:underline">Getting started</a>
		·
		<a href="/security" class="hover:underline">Security</a>
		·
		<a href="/terms" class="hover:underline">Terms</a>
		·
		<a href="/privacy" class="hover:underline">Privacy</a>
	</footer>
</main>
