<script lang="ts">
	import { goto } from '$app/navigation';
	import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
	import { PASSKEY_STORAGE_HINT, shouldShowPasskeyStorageHint } from '$lib/passkey-hints';
	import { withPasskeyPrfExtension } from '$lib/passkey-prf';
	import Button from '$lib/components/ui/button/button.svelte';
	import Input from '$lib/components/ui/input/input.svelte';
	import Label from '$lib/components/ui/label/label.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import { PRIVACY_VERSION, TERMS_VERSION } from '$lib/legal';

	let authMode = $state<'signin' | 'signup'>('signin');
	let signupEmail = $state('');
	let signupName = $state('');
	let signupCode = $state('');
	let signupNotice = $state('');
	let emailVerificationSent = $state(false);
	let emailVerificationToken = $state('');
	let legalAccepted = $state(false);
	let passkeyBusy = $state(false);
	let passkeyError = $state('');
	const inputClass =
		'w-full h-11 border-slate-200 bg-white text-slate-900 caret-slate-900 placeholder:text-slate-400 focus:border-[#3b82f6] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:caret-slate-100 dark:placeholder:text-slate-500';
	const labelClass = 'text-slate-700 dark:text-slate-300';

	function resetSignupVerification() {
		signupCode = '';
		signupNotice = '';
		emailVerificationSent = false;
		emailVerificationToken = '';
	}

	async function signInWithPasskey() {
		if (passkeyBusy) return;
		passkeyBusy = true;
		passkeyError = '';
		try {
			const optionsRes = await fetch('/api/auth/passkeys/login/options', { method: 'POST' });
			const optionsJSON = await optionsRes.json();
			if (!optionsRes.ok) throw new Error(optionsJSON.error || 'Could not start passkey login');
			const response = await startAuthentication({ optionsJSON });
			const verifyRes = await fetch('/api/auth/passkeys/login/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(response)
			});
			const verifyJson = await verifyRes.json();
			if (!verifyRes.ok) throw new Error(verifyJson.error || 'Passkey login failed');
			await goto('/portal', { replaceState: true });
		} catch (err) {
			passkeyError = err instanceof Error ? err.message : 'Passkey login failed';
		} finally {
			passkeyBusy = false;
		}
	}

	async function sendVerificationCode() {
		if (passkeyBusy) return;
		passkeyBusy = true;
		passkeyError = '';
		signupNotice = '';
		emailVerificationToken = '';
		try {
			const res = await fetch('/api/auth/email-verification/start', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: signupEmail,
					displayName: signupName
				})
			});
			const result = await res.json();
			if (!res.ok) throw new Error(result.error || 'Could not send verification code');
			emailVerificationSent = true;
			signupNotice =
				result.delivery === 'console'
					? 'Verification code sent to the local server console.'
					: 'Verification code sent. Check your email.';
		} catch (err) {
			passkeyError = err instanceof Error ? err.message : 'Could not send verification code';
		} finally {
			passkeyBusy = false;
		}
	}

	async function createAccountWithPasskey() {
		if (passkeyBusy) return;
		passkeyBusy = true;
		passkeyError = '';
		try {
			if (!emailVerificationToken) {
				const confirmRes = await fetch('/api/auth/email-verification/confirm', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						email: signupEmail,
						code: signupCode
					})
				});
				const confirmJson = await confirmRes.json();
				if (!confirmRes.ok) throw new Error(confirmJson.error || 'Could not verify email');
				emailVerificationToken = confirmJson.signupVerificationToken;
				signupNotice = 'Email verified. Create your passkey to finish.';
			}
			const optionsRes = await fetch('/api/auth/passkeys/signup/options', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: signupEmail,
					displayName: signupName,
					emailVerificationToken,
					termsAccepted: legalAccepted,
					termsVersion: TERMS_VERSION,
					privacyVersion: PRIVACY_VERSION
				})
			});
			const optionsJSON = await optionsRes.json();
			if (!optionsRes.ok) throw new Error(optionsJSON.error || 'Could not start account setup');
			const response = await startRegistration({
				optionsJSON: withPasskeyPrfExtension(optionsJSON)
			});
			const verifyRes = await fetch('/api/auth/passkeys/signup/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(response)
			});
			const verifyJson = await verifyRes.json();
			if (!verifyRes.ok) throw new Error(verifyJson.error || 'Could not create account');
			await goto('/portal', { replaceState: true });
		} catch (err) {
			passkeyError = err instanceof Error ? err.message : 'Account setup failed';
		} finally {
			passkeyBusy = false;
		}
	}
</script>

<svelte:head>
	<title>Agent Relay — Sign in</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center p-4">
	<div class="w-full max-w-md">
		<div class="flex items-center justify-center gap-3 mb-8">
			<Logo class="w-12 h-12" />
			<span class="text-2xl font-bold text-slate-900 dark:text-slate-100">Agent Relay</span>
		</div>

		<div class="glass-card p-8">
			<div class="text-center mb-6">
				<h1 class="text-xl font-semibold text-slate-900 dark:text-slate-100">
					{authMode === 'signin' ? 'Welcome back' : 'Create your account'}
				</h1>
				<p class="text-sm text-slate-500 mt-1 dark:text-slate-400">
					{authMode === 'signin'
						? 'Use a passkey to view deliveries'
						: 'Create a private inbox with a new passkey'}
				</p>
			</div>

			<div class="space-y-3">
				{#if authMode === 'signin'}
					<Button class="w-full h-11" onclick={signInWithPasskey} disabled={passkeyBusy}>
						{passkeyBusy ? 'Checking passkey…' : 'Sign in with passkey'}
					</Button>
					<Button
						variant="outline"
						class="w-full h-11"
						onclick={() => {
							authMode = 'signup';
							passkeyError = '';
							signupNotice = '';
						}}
						disabled={passkeyBusy}
					>
						Create account
					</Button>
				{:else}
					<div class="space-y-3">
						<div class="space-y-2">
							<Label for="signup-email" class={labelClass}>Email</Label>
							<Input
								id="signup-email"
								type="email"
								placeholder="you@example.com"
								bind:value={signupEmail}
								autocomplete="email"
								class={inputClass}
								oninput={resetSignupVerification}
							/>
						</div>
						<div class="space-y-2">
							<Label for="signup-name" class={labelClass}>Name</Label>
							<Input
								id="signup-name"
								type="text"
								placeholder="Your name"
								bind:value={signupName}
								autocomplete="name"
								class={inputClass}
							/>
						</div>
						<label
							for="legal-acceptance"
							class="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-5 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
						>
							<input
								id="legal-acceptance"
								type="checkbox"
								bind:checked={legalAccepted}
								class="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
							/>
							<span>
								I agree to the <a
									href="/terms"
									class="font-semibold text-blue-600 underline underline-offset-2 dark:text-blue-300"
								>Terms of Service</a> and acknowledge the <a
									href="/privacy"
									class="font-semibold text-blue-600 underline underline-offset-2 dark:text-blue-300"
								>Privacy Policy</a>.
							</span>
						</label>
						{#if emailVerificationSent}
							{#if shouldShowPasskeyStorageHint()}
								<p
									class="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100"
								>
									{PASSKEY_STORAGE_HINT}
								</p>
							{/if}
							<div class="space-y-2">
								<Label for="signup-code" class={labelClass}>Verification code</Label>
								<Input
									id="signup-code"
									type="text"
									inputmode="numeric"
									placeholder="123456"
									bind:value={signupCode}
									autocomplete="one-time-code"
									class={inputClass}
								/>
							</div>
							<Button
								class="w-full h-11"
								onclick={createAccountWithPasskey}
								disabled={passkeyBusy || signupCode.replace(/\D/g, '').length !== 6}
							>
								{passkeyBusy ? 'Creating passkey…' : 'Verify email and create passkey'}
							</Button>
							<Button
								variant="outline"
								class="w-full h-11"
								onclick={sendVerificationCode}
								disabled={passkeyBusy || !signupEmail.trim() || !legalAccepted}
							>
								Send another code
							</Button>
						{:else}
							<Button
								class="w-full h-11"
								onclick={sendVerificationCode}
								disabled={passkeyBusy || !signupEmail.trim() || !legalAccepted}
							>
								{passkeyBusy ? 'Sending code…' : 'Send verification code'}
							</Button>
						{/if}
						<Button
							variant="outline"
							class="w-full h-11"
							onclick={() => {
								authMode = 'signin';
								passkeyError = '';
								resetSignupVerification();
							}}
							disabled={passkeyBusy}
						>
							Back to sign in
						</Button>
					</div>
				{/if}

				{#if passkeyError}
					<div class="rounded-xl bg-red-50 border border-red-100 p-3">
						<p class="text-sm text-red-600">{passkeyError}</p>
					</div>
				{/if}
				{#if signupNotice}
					<div
						class="rounded-xl border border-blue-100 bg-blue-50 p-3 dark:border-blue-900/50 dark:bg-blue-950/40"
					>
						<p class="text-sm text-blue-700 dark:text-blue-200">{signupNotice}</p>
					</div>
				{/if}
			</div>
		</div>

		<nav
			aria-label="Legal"
			class="mt-4 flex items-center justify-center gap-4 text-xs text-slate-500 dark:text-slate-400"
		>
			<a href="/terms" class="hover:text-slate-900 hover:underline dark:hover:text-slate-100">
				Terms
			</a>
			<a href="/privacy" class="hover:text-slate-900 hover:underline dark:hover:text-slate-100">
				Privacy
			</a>
		</nav>
	</div>
</div>
