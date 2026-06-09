<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import {
		canAttemptPasskeyPrf,
		createE2eeKeyring,
		createEncryptionPasskeyPrivateKey,
		wrapPrivateKeyWithPasskey,
		unlockPrivateKey,
		unlockPrivateKeyWithPasskey,
		type EncryptedPrivateKey,
		type PasskeyEncryptedPrivateKey
	} from '$lib/e2ee';
	import {
		ENCRYPTION_PASSKEY_FALLBACK_NOTICE,
		PASSKEY_STORAGE_HINT,
		isPasskeyPrfError,
		shouldShowPasskeyStorageHint,
		withPasskeyPrfFailureHint
	} from '$lib/passkey-hints';
	import { saveE2eePasskeyHint } from '$lib/e2ee-passkey-hint';
	import { e2eeConfig, e2eePrivateKey } from '$lib/e2ee-store';
	import Button from '$lib/components/ui/button/button.svelte';
	import {
		ENSURE_E2EE_UNLOCK_KEY,
		OPEN_E2EE_DIALOG_KEY,
		type EnsureE2eeUnlock,
		type OpenE2eeDialog
	} from '$lib/portal-context';
	import { setContext } from 'svelte';

	type PasskeySummary = {
		id: string;
		isCurrent: boolean;
	};

	let {
		passkeys,
		isSetupPage,
		onShieldClickChange,
		children
	}: {
		passkeys: PasskeySummary[];
		isSetupPage: boolean;
		onShieldClickChange?: (handler: () => void | Promise<void>) => void;
		children?: import('svelte').Snippet;
	} = $props();

	let e2eeDialog = $state<'setup' | 'unlock' | null>(null);
	let e2eeBusy = $state(false);
	let e2eeError = $state('');
	let e2eeNotice = $state('');
	let recoveryKeyInput = $state('');
	let generatedRecoveryKey = $state('');
	let usedDedicatedEncryptionPasskey = $state(false);
	let e2eeOfferDedicatedPasskey = $state(false);

	function accountPasskeyId(): string | null {
		return passkeys.find((passkey) => passkey.isCurrent)?.id ?? passkeys[0]?.id ?? null;
	}

	function rememberPasskeyUnlockHint(): void {
		const encryptedPrivateKey = $e2eeConfig.passkeyEncryptedPrivateKey;
		if (encryptedPrivateKey) {
			saveE2eePasskeyHint(encryptedPrivateKey);
		}
	}

	async function unlockWithPasskeySilent(): Promise<boolean> {
		if ($e2eePrivateKey) return true;
		const encryptedPrivateKey = $e2eeConfig.passkeyEncryptedPrivateKey;
		if (!encryptedPrivateKey || e2eeBusy) return false;

		e2eeBusy = true;
		try {
			const privateKey = await unlockPrivateKeyWithPasskey(encryptedPrivateKey);
			e2eePrivateKey.set(privateKey);
			rememberPasskeyUnlockHint();
			return true;
		} catch {
			return false;
		} finally {
			e2eeBusy = false;
		}
	}

	async function handleShieldClick() {
		if ($e2eePrivateKey) return;
		if ($e2eeConfig.configured && $e2eeConfig.passkeyEncryptedPrivateKey) {
			const unlocked = await unlockWithPasskeySilent();
			if (unlocked) return;
		}
		openE2eeDialog();
	}

	const ensureE2eeUnlocked: EnsureE2eeUnlock = async () => {
		if ($e2eePrivateKey) return true;
		if (!$e2eeConfig.configured) {
			openE2eeDialog();
			return false;
		}
		if ($e2eeConfig.passkeyEncryptedPrivateKey) {
			const unlocked = await unlockWithPasskeySilent();
			if (unlocked) return true;
		}
		openE2eeDialog();
		return false;
	};

	function openE2eeDialog() {
		e2eeError = '';
		e2eeNotice = '';
		generatedRecoveryKey = '';
		usedDedicatedEncryptionPasskey = false;
		e2eeOfferDedicatedPasskey = false;
		recoveryKeyInput = '';
		e2eeDialog = $e2eeConfig.configured ? 'unlock' : 'setup';
	}

	setContext(ENSURE_E2EE_UNLOCK_KEY, ensureE2eeUnlocked);
	setContext(OPEN_E2EE_DIALOG_KEY, openE2eeDialog);

	export async function loadE2eeConfig() {
		try {
			const res = await fetch('/api/e2ee/config');
			const config = await res.json();
			e2eeConfig.set({
				configured: Boolean(config.configured),
				publicKeyJwk: config.publicKeyJwk ?? null,
				encryptedPrivateKey: config.encryptedPrivateKey ?? null,
				passkeyCredentialId: config.passkeyCredentialId ?? null,
				passkeyEncryptedPrivateKey: config.passkeyEncryptedPrivateKey ?? null,
				recoveryHint: config.recoveryHint ?? null
			});
		} catch (err) {
			console.error('[e2ee] config load failed:', err);
		}
	}

	async function saveE2eeSetup(
		keyring: Awaited<ReturnType<typeof createE2eeKeyring>>,
		passkeyEncryptedPrivateKey: PasskeyEncryptedPrivateKey
	) {
		const res = await fetch('/api/e2ee/config', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				publicKeyJwk: keyring.publicKeyJwk,
				encryptedPrivateKey: keyring.encryptedPrivateKey,
				passkeyCredentialId: passkeyEncryptedPrivateKey.credentialId,
				passkeyEncryptedPrivateKey,
				recoveryHint: 'Recovery key created in this browser'
			})
		});
		if (!res.ok) throw new Error('Could not save encryption setup');
		const config = await res.json();
		e2eeConfig.set({
			configured: true,
			publicKeyJwk: config.publicKeyJwk,
			encryptedPrivateKey: config.encryptedPrivateKey,
			passkeyCredentialId: config.passkeyCredentialId ?? null,
			passkeyEncryptedPrivateKey: config.passkeyEncryptedPrivateKey ?? null,
			recoveryHint: config.recoveryHint ?? null
		});
		e2eePrivateKey.set(keyring.privateKey);
		if (config.passkeyEncryptedPrivateKey) {
			saveE2eePasskeyHint(config.passkeyEncryptedPrivateKey);
		}
		generatedRecoveryKey = keyring.recoveryKey;
		e2eeOfferDedicatedPasskey = false;
	}

	async function setupE2ee() {
		if (e2eeBusy) return;
		e2eeBusy = true;
		e2eeError = '';
		e2eeNotice = '';
		e2eeOfferDedicatedPasskey = false;
		try {
			const credentialId = accountPasskeyId();
			if (!credentialId) {
				throw new Error('Sign in with your passkey before enabling encryption.');
			}
			if (!canAttemptPasskeyPrf()) {
				throw new Error('Passkey PRF is not available in this browser.');
			}

			const keyring = await createE2eeKeyring();
			const passkeyEncryptedPrivateKey = await wrapPrivateKeyWithPasskey(
				credentialId,
				keyring.privateKey
			);
			usedDedicatedEncryptionPasskey = false;
			await saveE2eeSetup(keyring, passkeyEncryptedPrivateKey);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Could not set up encryption';
			if (isPasskeyPrfError(message)) {
				e2eeOfferDedicatedPasskey = true;
				e2eeNotice = ENCRYPTION_PASSKEY_FALLBACK_NOTICE;
			} else {
				e2eeError = message;
			}
		} finally {
			e2eeBusy = false;
		}
	}

	async function setupE2eeWithDedicatedPasskey() {
		if (e2eeBusy) return;
		e2eeBusy = true;
		e2eeError = '';
		e2eeNotice = '';
		try {
			if (!canAttemptPasskeyPrf()) {
				throw new Error('Passkey PRF is not available in this browser.');
			}

			const keyring = await createE2eeKeyring();
			const passkeyEncryptedPrivateKey = await createEncryptionPasskeyPrivateKey(
				keyring.privateKey
			);
			usedDedicatedEncryptionPasskey = true;
			await saveE2eeSetup(keyring, passkeyEncryptedPrivateKey);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Could not set up encryption';
			e2eeError = withPasskeyPrfFailureHint(message);
		} finally {
			e2eeBusy = false;
		}
	}

	async function unlockE2ee() {
		const encryptedPrivateKey = $e2eeConfig.encryptedPrivateKey as EncryptedPrivateKey | null;
		if (!encryptedPrivateKey || !recoveryKeyInput.trim() || e2eeBusy) return;

		e2eeBusy = true;
		e2eeError = '';
		e2eeNotice = '';
		try {
			const privateKey = await unlockPrivateKey(encryptedPrivateKey, recoveryKeyInput);
			e2eePrivateKey.set(privateKey);
			e2eeDialog = null;
			recoveryKeyInput = '';
		} catch {
			e2eeError = 'Recovery key could not unlock this relay.';
		} finally {
			e2eeBusy = false;
		}
	}

	async function unlockE2eeWithPasskey() {
		e2eeError = '';
		e2eeNotice = '';
		const unlocked = await unlockWithPasskeySilent();
		if (unlocked) {
			e2eeDialog = null;
			recoveryKeyInput = '';
			return;
		}
		e2eeError = withPasskeyPrfFailureHint('Passkey could not unlock this relay.');
	}

	function closeE2eeDialog() {
		e2eeDialog = null;
		e2eeError = '';
		e2eeNotice = '';
		recoveryKeyInput = '';
	}

	$effect(() => {
		onShieldClickChange?.(handleShieldClick);
	});
</script>

{@render children?.()}

{#if e2eeDialog}
	<div class="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
		<div
			class="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900"
		>
			<div class="flex items-start justify-between gap-3">
				<div>
					<h2 class="text-base font-semibold text-slate-900 dark:text-slate-100">
						{e2eeDialog === 'setup' ? 'Set up encryption' : 'Unlock encryption'}
					</h2>
					<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
						{e2eeDialog === 'setup'
							? 'Create an encryption key secured by your account passkey when possible, and save a recovery key fallback.'
							: 'Use your encryption passkey or recovery key to decrypt encrypted deliveries in this browser.'}
					</p>
				</div>
				<button
					type="button"
					class="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
					aria-label="Close encryption dialog"
					onclick={closeE2eeDialog}
				>
					×
				</button>
			</div>

			{#if e2eeError}
				<p class="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
					{e2eeError}
				</p>
			{/if}
			{#if e2eeNotice}
				<p class="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
					{e2eeNotice}
				</p>
			{/if}

			{#if e2eeDialog === 'setup'}
				{#if generatedRecoveryKey}
					<div class="mt-4 space-y-3">
						<p class="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
							{usedDedicatedEncryptionPasskey
								? 'A separate encryption passkey unlocks encrypted deliveries in this browser. Your account passkey still signs you in.'
								: 'Your account passkey unlocks encrypted deliveries in this browser.'}
						</p>
						<p class="text-sm font-medium text-slate-900 dark:text-slate-100">
							Save this recovery key now. It cannot be shown again.
						</p>
						<textarea
							readonly
							class="h-24 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
							value={generatedRecoveryKey}
						></textarea>
						<div class="flex justify-end gap-2">
							<Button
								variant="outline"
								size="sm"
								onclick={() => navigator.clipboard?.writeText(generatedRecoveryKey)}
							>
								Copy
							</Button>
							<Button
								size="sm"
								onclick={async () => {
									closeE2eeDialog();
									if (isSetupPage) {
										await invalidate('account:e2ee');
										await goto('/portal');
									}
								}}
							>Done</Button>
						</div>
					</div>
				{:else}
					{#if shouldShowPasskeyStorageHint()}
						<p
							class="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100"
						>
							{PASSKEY_STORAGE_HINT}
						</p>
					{/if}
					<div class="mt-5 flex flex-col gap-3">
						{#if e2eeOfferDedicatedPasskey}
							<Button
								class="w-full"
								onclick={setupE2eeWithDedicatedPasskey}
								disabled={e2eeBusy}
							>
								{e2eeBusy ? 'Creating…' : 'Create encryption passkey'}
							</Button>
						{/if}
						<div class="flex justify-end gap-2">
							<Button variant="outline" size="sm" onclick={closeE2eeDialog}>Cancel</Button>
							<Button
								size="sm"
								variant={e2eeOfferDedicatedPasskey ? 'outline' : 'default'}
								onclick={setupE2ee}
								disabled={e2eeBusy}
							>
								{e2eeBusy
									? 'Creating…'
									: e2eeOfferDedicatedPasskey
										? 'Try account passkey again'
										: 'Create encrypted relay'}
							</Button>
						</div>
					</div>
				{/if}
			{:else}
				<div class="mt-4 space-y-3">
					{#if $e2eeConfig.passkeyEncryptedPrivateKey}
						<Button class="w-full" onclick={unlockE2eeWithPasskey} disabled={e2eeBusy}>
							{e2eeBusy ? 'Unlocking…' : 'Unlock with passkey'}
						</Button>
						<div class="flex items-center gap-3 text-xs uppercase tracking-wide text-slate-400">
							<span class="h-px flex-1 bg-slate-200 dark:bg-slate-800"></span>
							or
							<span class="h-px flex-1 bg-slate-200 dark:bg-slate-800"></span>
						</div>
					{/if}
					<label class="block text-sm font-medium text-slate-700 dark:text-slate-300" for="recovery-key">
						Recovery key
					</label>
					<textarea
						id="recovery-key"
						class="h-24 w-full resize-none rounded-xl border border-slate-200 bg-white p-3 font-mono text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
						bind:value={recoveryKeyInput}
						placeholder="XXXX-XXXX-XXXX-..."
						autocomplete="off"
					></textarea>
					<div class="flex justify-end gap-2">
						<Button variant="outline" size="sm" onclick={closeE2eeDialog}>Cancel</Button>
						<Button size="sm" onclick={unlockE2ee} disabled={e2eeBusy || !recoveryKeyInput.trim()}>
							{e2eeBusy ? 'Unlocking…' : 'Unlock'}
						</Button>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}
