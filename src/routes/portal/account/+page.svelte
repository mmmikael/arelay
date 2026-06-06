<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { decryptString, encryptString, type EncryptedEnvelope } from '$lib/e2ee';
	import { e2eeConfig, e2eePrivateKey } from '$lib/e2ee-store';
	import Button from '$lib/components/ui/button/button.svelte';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Bot from '@lucide/svelte/icons/bot';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import HardDrive from '@lucide/svelte/icons/hard-drive';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import Mail from '@lucide/svelte/icons/mail';
	import { formatBytes } from '$lib/artifacts';
	import type { LayoutData } from '../$types';

	let { data }: { data: LayoutData } = $props();

	let busy = $state(false);
	let error = $state('');
	let notice = $state('');
	let generatedAgentToken = $state<{
		id: string;
		name: string;
		token: string;
		encrypted: boolean;
	} | null>(null);
	let newAgentTokenName = $state('');
	let revealedAgentTokens = $state<Record<string, string>>({});
	let tokenActionId = $state<string | null>(null);
	let cloudflareAccountIdInput = $state('');
	let cloudflareApiTokenInput = $state('');

	$effect(() => {
		cloudflareAccountIdInput = data.cloudflareEmail.accountId ?? '';
	});

	function bytesToBase64Url(bytes: Uint8Array): string {
		let binary = '';
		for (const byte of bytes) binary += String.fromCharCode(byte);
		return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
	}

	function generateAgentTokenValue(): string {
		const bytes = new Uint8Array(32);
		crypto.getRandomValues(bytes);
		return `ar_${bytesToBase64Url(bytes)}`;
	}

	async function sha256Hex(value: string): Promise<string> {
		const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
		return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
	}

	function suggestedAgentTokenName(): string {
		return `Agent token ${data.agentTokens.length + 1}`;
	}

	function formatAccountDate(value: string | Date | null | undefined): string {
		if (!value) return 'Not created yet';
		return new Date(value).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function passkeyTitle(passkey: LayoutData['passkeys'][number], index: number): string {
		if (passkey.backedUp || passkey.deviceType === 'multiDevice') return `Synced passkey ${index + 1}`;
		if (passkey.transports?.includes('internal')) return `Device passkey ${index + 1}`;
		return `Security key ${index + 1}`;
	}

	function formatTransport(transport: string): string {
		const labels: Record<string, string> = {
			internal: 'Built-in',
			hybrid: 'Phone',
			usb: 'USB',
			nfc: 'NFC',
			ble: 'Bluetooth'
		};
		return labels[transport] ?? transport;
	}

	function passkeySubtitle(passkey: LayoutData['passkeys'][number]): string {
		const parts = [
			passkey.backedUp || passkey.deviceType === 'multiDevice' ? 'Synced' : 'Device-bound',
			passkey.transports?.length ? passkey.transports.map(formatTransport).join(', ') : null
		].filter(Boolean);
		return parts.join(' · ');
	}

	function storageUsedPercent(usedBytes: number, limitBytes: number): number {
		if (limitBytes <= 0) return 0;
		return Math.min(100, (usedBytes / limitBytes) * 100);
	}

	const canSaveCloudflare = $derived(
		Boolean(
			data.plugins.emailReviewRelay &&
				cloudflareAccountIdInput.trim() &&
				cloudflareApiTokenInput.trim()
		)
	);

	async function saveCloudflareEmail() {
		if (busy || !canSaveCloudflare) return;
		busy = true;
		error = '';
		notice = '';
		try {
			const res = await fetch('/api/account/cloudflare-email', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					accountId: cloudflareAccountIdInput.trim(),
					apiToken: cloudflareApiTokenInput.trim()
				})
			});
			const result = await res.json();
			if (!res.ok) throw new Error(result.error || 'Could not save Cloudflare credentials');
			cloudflareApiTokenInput = '';
			notice = 'Cloudflare API credentials saved.';
			await invalidate('account:cloudflare-email');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not save Cloudflare credentials';
		} finally {
			busy = false;
		}
	}

	async function removeCloudflareEmail() {
		if (busy || !data.plugins.emailReviewRelay) return;
		busy = true;
		error = '';
		notice = '';
		try {
			const res = await fetch('/api/account/cloudflare-email', { method: 'DELETE' });
			const result = await res.json();
			if (!res.ok) throw new Error(result.error || 'Could not remove Cloudflare credentials');
			cloudflareAccountIdInput = '';
			cloudflareApiTokenInput = '';
			notice = 'Cloudflare API credentials removed.';
			await invalidate('account:cloudflare-email');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not remove Cloudflare credentials';
		} finally {
			busy = false;
		}
	}

	async function createAgentApiToken() {
		if (busy) return;
		busy = true;
		error = '';
		notice = '';
		generatedAgentToken = null;
		try {
			const token = generateAgentTokenValue();
			const tokenHash = await sha256Hex(token);
			const publicKey = $e2eeConfig.publicKeyJwk;
			const encryptedToken = publicKey ? await encryptString(token, publicKey) : null;
			const res = await fetch('/api/account/agent-tokens', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: newAgentTokenName.trim() || suggestedAgentTokenName(),
					tokenHash,
					encryptedToken
				})
			});
			const result = await res.json();
			if (!res.ok) throw new Error(result.error || 'Could not create agent token');
			generatedAgentToken = {
				id: result.token.id,
				name: result.token.name,
				token,
				encrypted: Boolean(result.token.encryptedToken)
			};
			newAgentTokenName = '';
			notice = encryptedToken
				? 'Agent token created and saved encrypted.'
				: 'Agent token created. Copy it now; set up encryption to reveal future tokens later.';
			await invalidate('account:agent-tokens');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not create agent token';
		} finally {
			busy = false;
		}
	}

	async function revealAgentApiToken(token: LayoutData['agentTokens'][number]) {
		if (tokenActionId) return;
		error = '';
		notice = '';
		if (revealedAgentTokens[token.id]) {
			const remaining = { ...revealedAgentTokens };
			delete remaining[token.id];
			revealedAgentTokens = remaining;
			return;
		}
		if (!token.encryptedToken) {
			error = 'This token was not saved with encrypted reveal. Create a new encrypted token.';
			return;
		}
		if (!$e2eePrivateKey) {
			error = 'Unlock encryption from the inbox header before revealing saved tokens.';
			return;
		}

		tokenActionId = token.id;
		try {
			const plaintext = await decryptString(
				token.encryptedToken as unknown as EncryptedEnvelope,
				$e2eePrivateKey
			);
			revealedAgentTokens = { ...revealedAgentTokens, [token.id]: plaintext };
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not reveal token';
		} finally {
			tokenActionId = null;
		}
	}

	async function revokeAgentApiToken(token: LayoutData['agentTokens'][number]) {
		if (tokenActionId) return;
		const confirmed = confirm(`Revoke "${token.name}"? Agents using this token will stop working.`);
		if (!confirmed) return;

		tokenActionId = token.id;
		error = '';
		notice = '';
		try {
			const res = await fetch(`/api/account/agent-tokens/${token.id}`, { method: 'DELETE' });
			const result = await res.json();
			if (!res.ok) throw new Error(result.error || 'Could not revoke token');
			const remaining = { ...revealedAgentTokens };
			delete remaining[token.id];
			revealedAgentTokens = remaining;
			if (generatedAgentToken?.id === token.id) generatedAgentToken = null;
			notice = 'Agent token revoked.';
			await invalidate('account:agent-tokens');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not revoke token';
		} finally {
			tokenActionId = null;
		}
	}
</script>

<svelte:head>
	<title>Account — Agent Relay</title>
</svelte:head>

<div class="min-h-full bg-white dark:bg-slate-950 sm:bg-transparent">
	<div
		class="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-slate-100 bg-white px-2 dark:border-slate-800 dark:bg-slate-950 sm:hidden"
	>
		<a
			href="/portal"
			class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
			aria-label="Back to inbox"
		>
			<ArrowLeft class="h-5 w-5" />
		</a>
		<div class="min-w-0">
			<p class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">Account</p>
			<p class="truncate text-xs text-slate-500 dark:text-slate-400">{data.currentUser?.email}</p>
		</div>
	</div>

	<div class="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-8">
		<div class="hidden sm:mb-8 sm:block">
			<a
				href="/portal"
				class="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
			>
				<ArrowLeft class="h-4 w-4" />
				Back to inbox
			</a>
			<h1 class="mt-4 text-2xl font-semibold text-slate-900 dark:text-slate-100">Account</h1>
			<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
				Manage sign-in, storage, and agent access.
			</p>
		</div>

		{#if error}
			<p
				class="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
			>
				{error}
			</p>
		{/if}
		{#if notice}
			<p
				class="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200"
			>
				{notice}
			</p>
		{/if}

		<section
			class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5"
		>
			<h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100">Profile</h2>
			<p class="mt-2 text-sm text-slate-700 dark:text-slate-300">{data.currentUser?.email}</p>
			<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
				Passkey sign-in · no password on this account
			</p>
		</section>

		<section
			class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5"
		>
			<div class="flex items-start gap-3">
				<span
					class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
				>
					<HardDrive class="h-4 w-4" />
				</span>
				<div class="min-w-0 flex-1">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100">Storage</h2>
						<p class="text-xs font-medium text-slate-600 dark:text-slate-300">
							{formatBytes(data.storage.usedBytes)} / {formatBytes(data.storage.limitBytes)}
						</p>
					</div>
					<div
						class="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
						role="progressbar"
						aria-valuenow={data.storage.usedBytes}
						aria-valuemin={0}
						aria-valuemax={data.storage.limitBytes}
						aria-label="Account storage used"
					>
						<div
							class="h-full rounded-full transition-[width] duration-300 {storageUsedPercent(
								data.storage.usedBytes,
								data.storage.limitBytes
							) >= 90
								? 'bg-amber-500'
								: 'bg-blue-500'}"
							style="width: {storageUsedPercent(data.storage.usedBytes, data.storage.limitBytes)}%"
						></div>
					</div>
					<p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
						Up to {formatBytes(data.storage.artifactLimitBytes)} per message. Deleting sessions frees
						space.
					</p>
				</div>
			</div>
		</section>

		<section
			class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5"
		>
			<div class="flex items-start gap-3">
				<span
					class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
				>
					<KeyRound class="h-4 w-4" />
				</span>
				<div class="min-w-0 flex-1">
					<h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100">Passkeys</h2>
					<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
						Your passkey signs you in. Encryption may use the same passkey or a separate one.
					</p>
					<div class="mt-3 space-y-2">
						{#each data.passkeys as passkey, index (passkey.id)}
							<div class="rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
								<div class="flex flex-wrap items-center gap-2">
									<p class="text-sm font-medium text-slate-900 dark:text-slate-100">
										{passkeyTitle(passkey, index)}
									</p>
									{#if passkey.isCurrent}
										<span
											class="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-200"
										>
											This session
										</span>
									{/if}
								</div>
								<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
									Created {formatAccountDate(passkey.createdAt)}
									{#if passkey.lastUsedAt}
										· Last used {formatAccountDate(passkey.lastUsedAt)}
									{/if}
								</p>
								{#if passkeySubtitle(passkey)}
									<p class="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
										{passkeySubtitle(passkey)}
									</p>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			</div>
		</section>

		<section
			class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5"
		>
			<div class="flex items-start gap-3">
				<span
					class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
				>
					<Bot class="h-4 w-4" />
				</span>
				<div class="min-w-0 flex-1">
					<h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100">Agent API tokens</h2>
					<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
						Create one token per agent or integration. Revoke a single token without affecting others.
					</p>

					<div class="mt-3 flex flex-col gap-2 sm:flex-row">
						<input
							class="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
							bind:value={newAgentTokenName}
							placeholder="Token name"
							autocomplete="off"
						/>
						<Button
							variant="outline"
							class="h-10 shrink-0"
							onclick={createAgentApiToken}
							disabled={busy}
						>
							{busy ? 'Creating…' : 'Create token'}
						</Button>
					</div>

					{#if generatedAgentToken}
						<div
							class="mt-3 space-y-2 rounded-xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/60 dark:bg-blue-950/30"
						>
							<div class="flex flex-wrap items-center justify-between gap-2">
								<p class="text-sm font-semibold text-slate-900 dark:text-slate-100">
									{generatedAgentToken.name}
								</p>
								<span class="text-xs text-slate-500 dark:text-slate-400">
									{generatedAgentToken.encrypted ? 'Encrypted reveal saved' : 'Shown once'}
								</span>
							</div>
							<input
								readonly
								value={generatedAgentToken.token}
								class="h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
							/>
							<Button
								variant="outline"
								size="sm"
								class="w-full sm:w-auto"
								onclick={() => navigator.clipboard?.writeText(generatedAgentToken?.token ?? '')}
							>
								Copy token
							</Button>
						</div>
					{/if}

					<div class="mt-3 space-y-2">
						{#if data.agentTokens.length === 0}
							<p
								class="rounded-xl bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-950 dark:text-slate-400"
							>
								No agent tokens yet.
							</p>
						{:else}
							{#each data.agentTokens as token (token.id)}
								<div class="rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
									<div class="flex flex-wrap items-start justify-between gap-3">
										<div class="min-w-0">
											<p class="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
												{token.name}
											</p>
											<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
												Created {formatAccountDate(token.createdAt)}
												{#if token.lastUsedAt}
													· Last used {formatAccountDate(token.lastUsedAt)}
												{:else}
													· Never used
												{/if}
											</p>
										</div>
										<div class="flex shrink-0 items-center gap-2">
											<Button
												variant="outline"
												size="sm"
												onclick={() => revealAgentApiToken(token)}
												disabled={tokenActionId === token.id || !token.encryptedToken}
												title={token.encryptedToken
													? 'Reveal token'
													: 'Token was not saved encrypted'}
											>
												{revealedAgentTokens[token.id] ? 'Hide' : 'Reveal'}
											</Button>
											<Button
												variant="outline"
												size="sm"
												onclick={() => revokeAgentApiToken(token)}
												disabled={tokenActionId === token.id}
											>
												Revoke
											</Button>
										</div>
									</div>

									{#if revealedAgentTokens[token.id]}
										<div class="mt-3 space-y-2">
											<input
												readonly
												value={revealedAgentTokens[token.id]}
												class="h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
											/>
											<Button
												variant="outline"
												size="sm"
												class="w-full sm:w-auto"
												onclick={() =>
													navigator.clipboard?.writeText(revealedAgentTokens[token.id])}
											>
												Copy token
											</Button>
										</div>
									{/if}
								</div>
							{/each}
						{/if}
					</div>
				</div>
			</div>
		</section>

		{#if data.plugins.emailReviewRelay}
			<section
				class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5"
			>
				<div class="flex items-start gap-3">
					<span
						class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
					>
						<Mail class="h-4 w-4" />
					</span>
					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100">Email sending</h2>
							{#if data.cloudflareEmail.configured}
								<span
									class="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
								>
									<CircleCheck class="h-3.5 w-3.5" />
									Configured
								</span>
							{:else}
								<span
									class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
								>
									Not configured
								</span>
							{/if}
						</div>

						<p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
							Optional. Add your Cloudflare Account ID and an API token with Email Sending permission.
							Used only when you approve an email draft. Agent send-from addresses must use a domain
							onboarded for Email Sending in that Cloudflare account.
							<a
								href="https://developers.cloudflare.com/email-service/"
								target="_blank"
								rel="noopener noreferrer"
								class="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
							>
								Cloudflare docs
								<ExternalLink class="h-3 w-3" />
							</a>
						</p>

						<div class="mt-4 space-y-3">
							<div>
								<label
									for="cloudflare-account-id"
									class="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300"
								>
									Account ID
								</label>
								<input
									id="cloudflare-account-id"
									class="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
									bind:value={cloudflareAccountIdInput}
									placeholder="From Cloudflare dashboard"
									autocomplete="off"
								/>
							</div>
							<div>
								<label
									for="cloudflare-api-token"
									class="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300"
								>
									API token
								</label>
								<input
									id="cloudflare-api-token"
									type="password"
									class="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
									bind:value={cloudflareApiTokenInput}
									placeholder={data.cloudflareEmail.configured
										? 'Paste a new token to update'
										: 'Paste API token'}
									autocomplete="off"
								/>
							</div>
						</div>

						<div class="mt-4 flex flex-wrap gap-2">
							<Button disabled={busy || !canSaveCloudflare} onclick={saveCloudflareEmail}>
								{busy ? 'Saving…' : 'Save'}
							</Button>
							{#if data.cloudflareEmail.configured}
								<Button variant="outline" disabled={busy} onclick={removeCloudflareEmail}>
									Remove
								</Button>
							{/if}
						</div>
					</div>
				</div>
			</section>
		{/if}
	</div>
</div>
