<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { decryptString, encryptString, type EncryptedEnvelope } from '$lib/e2ee';
	import { e2eeConfig, e2eePrivateKey } from '$lib/e2ee-store';
	import { formatSpendAmount, spendRequestStatusLabel } from '$lib/spend-request-status';
	import Button from '$lib/components/ui/button/button.svelte';
	import Input from '$lib/components/ui/input/input.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import type { JsonObject } from '$lib/server/db';
	import type { SpendRequestRecord } from '$plugins/spend-review-relay/server';

	type Props = {
		spendRequest: SpendRequestRecord;
		stripeConfigured: boolean;
		stripeTestMode: boolean;
		sessionId: string;
		e2eeConfigured: boolean;
		onUnlock?: () => Promise<boolean>;
	};

	let {
		spendRequest,
		stripeConfigured,
		stripeTestMode,
		sessionId,
		e2eeConfigured,
		onUnlock
	}: Props = $props();

	type DecryptedSpend = {
		payee: string;
		amountMinor: number;
		currency: string;
		description: string;
		metadata: string | null;
	};

	let decrypted = $state<DecryptedSpend | null>(null);
	let decryptError = $state('');
	let loadedKey = $state('');

	let editablePayee = $state('');
	let editableAmount = $state('');
	let editableDescription = $state('');

	let actionBusy = $state(false);
	let actionError = $state('');
	let approveDialogOpen = $state(false);

	const needsUnlock = $derived(Boolean($e2eePrivateKey) === false);

	function asEnvelope(value: JsonObject): EncryptedEnvelope {
		return value as unknown as EncryptedEnvelope;
	}

	// Decrypt in-component whenever the request changes or the vault is unlocked. The amount
	// is stored as the encrypted string of an integer minor-unit value.
	$effect(() => {
		const privateKey = $e2eePrivateKey;
		const key = `${spendRequest.id}:${spendRequest.updated_at}`;

		if (!privateKey || spendRequest.encryption_version !== 'e2ee-v1') {
			decrypted = null;
			loadedKey = '';
			return;
		}
		if (key === loadedKey) return;
		loadedKey = key;

		void (async () => {
			try {
				const [payee, amountRaw, currency, description, metadata] = await Promise.all([
					decryptString(asEnvelope(spendRequest.encrypted_payee), privateKey),
					decryptString(asEnvelope(spendRequest.encrypted_amount), privateKey),
					decryptString(asEnvelope(spendRequest.encrypted_currency), privateKey),
					decryptString(asEnvelope(spendRequest.encrypted_description), privateKey),
					spendRequest.encrypted_metadata
						? decryptString(asEnvelope(spendRequest.encrypted_metadata), privateKey)
						: Promise.resolve(null)
				]);
				const amountMinor = Number.parseInt(amountRaw, 10);
				const result: DecryptedSpend = {
					payee,
					amountMinor: Number.isFinite(amountMinor) ? amountMinor : 0,
					currency: currency.trim().toLowerCase(),
					description,
					metadata
				};
				decrypted = result;
				decryptError = '';
				editablePayee = result.payee;
				editableAmount = (result.amountMinor / 100).toFixed(2);
				editableDescription = result.description;
			} catch (err) {
				console.error('[e2ee] spend request decrypt failed:', err);
				decrypted = null;
				decryptError = 'Could not decrypt this spend request.';
				loadedKey = '';
			}
		})();
	});

	const isOpen = $derived(spendRequest.status === 'pending' || spendRequest.status === 'failed');
	const canApprove = $derived(isOpen && !needsUnlock && Boolean(decrypted) && stripeConfigured);

	function parseAmountMinor(): number | null {
		const value = Number.parseFloat(editableAmount.replace(/,/g, ''));
		if (!Number.isFinite(value) || value <= 0) return null;
		return Math.round(value * 100);
	}

	const formattedAmount = $derived(
		decrypted ? formatSpendAmount(decrypted.amountMinor, decrypted.currency) : ''
	);

	async function handleApproveClick() {
		if (needsUnlock && e2eeConfigured && onUnlock) {
			const unlocked = await onUnlock();
			if (!unlocked) return;
		}
		if (needsUnlock) return;
		approveDialogOpen = true;
	}

	async function approveSpendRequest() {
		if (!decrypted || actionBusy || !canApprove) return;

		const amountMinor = parseAmountMinor();
		if (amountMinor === null) {
			actionError = 'Enter a valid amount greater than 0.';
			approveDialogOpen = false;
			return;
		}
		if (!editablePayee.trim() || !editableDescription.trim()) {
			actionError = 'Payee and description are required.';
			approveDialogOpen = false;
			return;
		}

		actionBusy = true;
		actionError = '';
		try {
			const publicKeyJwk = $e2eeConfig.publicKeyJwk;
			const fields = {
				payee: editablePayee.trim(),
				amount_minor: amountMinor,
				currency: decrypted.currency,
				description: editableDescription.trim()
			};

			// Snapshot the approved terms (encrypted) so the receipt survives even if the
			// agent's original envelopes are later rotated.
			let encryptedReceipt: EncryptedEnvelope | null = null;
			if (publicKeyJwk) {
				encryptedReceipt = await encryptString(JSON.stringify(fields), publicKeyJwk);
			}

			const res = await fetch(`/api/sessions/${sessionId}/spend/approve`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(
					encryptedReceipt ? { ...fields, encrypted_receipt: encryptedReceipt } : fields
				)
			});
			const result = await res.json();
			if (!res.ok) throw new Error(result.error || 'Could not approve spend request');
			await Promise.all([invalidate('inbox:session'), invalidate('inbox:sessions')]);
		} catch (err) {
			actionError = err instanceof Error ? err.message : 'Could not approve spend request';
		} finally {
			actionBusy = false;
			approveDialogOpen = false;
		}
	}

	async function rejectSpendRequest() {
		if (actionBusy || spendRequest.status !== 'pending') return;
		actionBusy = true;
		actionError = '';
		try {
			const res = await fetch(`/api/sessions/${sessionId}/spend/reject`, { method: 'POST' });
			const result = await res.json();
			if (!res.ok) throw new Error(result.error || 'Could not reject spend request');
			await Promise.all([invalidate('inbox:session'), invalidate('inbox:sessions')]);
		} catch (err) {
			actionError = err instanceof Error ? err.message : 'Could not reject spend request';
		} finally {
			actionBusy = false;
		}
	}
</script>

<div
	class="overflow-hidden bg-white dark:bg-slate-900 sm:rounded-xl sm:border sm:border-slate-100 sm:shadow-[0_4px_20px_rgba(0,0,0,0.04)] sm:dark:border-slate-800 sm:dark:shadow-none"
>
	<div class="space-y-4 px-4 py-4 sm:px-6">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<h2
				class="text-sm font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400"
			>
				Spend request
			</h2>
			<span
				class="w-fit rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
			>
				{spendRequestStatusLabel(spendRequest.status, 'detail')}
			</span>
		</div>

		{#if decrypted}
			{#if isOpen}
				<div class="grid gap-3">
					<div class="grid gap-1.5">
						<label for="spend-payee" class="text-xs font-medium text-slate-700 dark:text-slate-300">
							Payee
						</label>
						<Input id="spend-payee" bind:value={editablePayee} disabled={actionBusy} class="h-9" />
					</div>
					<div class="grid gap-1.5">
						<label
							for="spend-amount"
							class="text-xs font-medium text-slate-700 dark:text-slate-300"
						>
							Amount ({decrypted.currency.toUpperCase()})
						</label>
						<Input
							id="spend-amount"
							type="text"
							bind:value={editableAmount}
							disabled={actionBusy}
							class="h-9"
						/>
					</div>
					<div class="grid gap-1.5">
						<label
							for="spend-description"
							class="text-xs font-medium text-slate-700 dark:text-slate-300"
						>
							Reason
						</label>
						<textarea
							id="spend-description"
							bind:value={editableDescription}
							disabled={actionBusy}
							rows="3"
							class="w-full resize-y rounded-lg border border-slate-200 bg-white p-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
						></textarea>
					</div>
				</div>
			{:else}
				<dl class="grid gap-2 text-sm">
					<div class="flex justify-between gap-3">
						<dt class="font-semibold text-slate-900 dark:text-slate-100">Payee</dt>
						<dd class="text-right text-slate-700 dark:text-slate-300">{decrypted.payee}</dd>
					</div>
					<div class="flex justify-between gap-3">
						<dt class="font-semibold text-slate-900 dark:text-slate-100">Amount</dt>
						<dd class="text-right text-slate-700 dark:text-slate-300">{formattedAmount}</dd>
					</div>
					<div class="flex flex-col gap-1">
						<dt class="font-semibold text-slate-900 dark:text-slate-100">Reason</dt>
						<dd class="whitespace-pre-wrap text-slate-700 dark:text-slate-300">
							{decrypted.description}
						</dd>
					</div>
				</dl>
			{/if}

			{#if decrypted.metadata}
				<details class="text-xs text-slate-500 dark:text-slate-400">
					<summary class="cursor-pointer select-none">Agent metadata</summary>
					<pre
						class="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-2.5 text-slate-700 dark:bg-slate-950 dark:text-slate-300">{decrypted.metadata}</pre>
				</details>
			{/if}

			{#if spendRequest.status === 'paid'}
				<div
					class="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
				>
					{#if spendRequest.payment_intent_id?.startsWith('spt_')}
						Authorized {formattedAmount} via a Stripe Shared Payment Token — merchant-scoped, amount-capped,
						and short-lived.
					{:else}
						Charged {formattedAmount} via Stripe.
					{/if}
					{#if spendRequest.payment_intent_id}
						<span class="block font-mono text-xs break-all">{spendRequest.payment_intent_id}</span>
					{/if}
				</div>
			{/if}
		{:else if needsUnlock}
			<p class="text-sm text-slate-600 dark:text-slate-300">
				Unlock encryption to review this spend request.
			</p>
			{#if e2eeConfigured && onUnlock}
				<Button variant="outline" size="sm" onclick={() => onUnlock?.()}>Unlock encryption</Button>
			{/if}
		{:else if decryptError}
			<p class="text-sm text-red-600 dark:text-red-400">{decryptError}</p>
		{/if}

		{#if isOpen}
			<div class="flex flex-wrap items-center gap-2">
				<Button
					disabled={actionBusy || !canApprove}
					title={needsUnlock
						? 'Unlock encryption to review and approve'
						: stripeConfigured
							? spendRequest.status === 'failed'
								? 'Retry the charge'
								: 'Approve and charge via Stripe'
							: 'Add your Stripe secret key in Account first'}
					onclick={handleApproveClick}
				>
					{actionBusy
						? 'Charging…'
						: spendRequest.status === 'failed'
							? 'Retry charge'
							: 'Approve & pay'}
				</Button>
				{#if spendRequest.status === 'pending'}
					<Button variant="outline" disabled={actionBusy} onclick={rejectSpendRequest}
						>Reject</Button
					>
				{/if}
				{#if stripeConfigured && stripeTestMode}
					<span class="text-xs font-medium text-slate-500 dark:text-slate-400"
						>Stripe test mode</span
					>
				{/if}
			</div>
			{#if !stripeConfigured}
				<p class="text-xs text-amber-700 dark:text-amber-300">
					<a
						href="/portal/account"
						class="underline underline-offset-2 hover:text-amber-800 dark:hover:text-amber-200"
						>Add your Stripe secret key in Account</a
					> before approving.
				</p>
			{/if}
		{/if}

		{#if spendRequest.charge_error}
			<p class="text-sm text-red-600 dark:text-red-400">{spendRequest.charge_error}</p>
		{/if}
		{#if actionError}
			<p class="text-sm text-red-600 dark:text-red-400">{actionError}</p>
		{/if}
	</div>
</div>

<AlertDialog.Root bind:open={approveDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Approve and charge?</AlertDialog.Title>
			<AlertDialog.Description>
				This will charge {decrypted
					? formatSpendAmount(parseAmountMinor() ?? decrypted.amountMinor, decrypted.currency)
					: 'the amount'}
				to {editablePayee.trim() || 'the payee'} using your Stripe credentials{stripeTestMode
					? ' (test mode)'
					: ''}.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={actionBusy}>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action on:click={approveSpendRequest} disabled={actionBusy}>
				{actionBusy ? 'Charging…' : 'Approve & pay'}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
