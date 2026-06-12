<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		startAuthentication,
		startRegistration,
		type PublicKeyCredentialRequestOptionsJSON
	} from '@simplewebauthn/browser';
	import {
		unlockPrivateKeyWithPasskeyMigration,
		unlockPrivateKeyWithLoginPrfOutputs,
		type PasskeyEncryptedPrivateKey
	} from '$lib/e2ee';
	import { persistMigratedPasskeyPrivateKey } from '$lib/e2ee-config-client';
	import { e2eePrivateKey } from '$lib/e2ee-store';
	import { readE2eePasskeyHint, saveE2eePasskeyHint } from '$lib/e2ee-passkey-hint';
	import {
		readLastLoginCredentialId,
		readLastLoginEmail,
		saveLastLoginCredentialId,
		saveLastLoginEmail
	} from '$lib/login-hint';
	import { PASSKEY_STORAGE_HINT, shouldShowPasskeyStorageHint } from '$lib/passkey-hints';
	import {
		getPrfOutputsFromAuthResponse,
		preparePasskeyAuthOptionsForBrowser,
		withPasskeyPrfAuthExtension,
		withPasskeyPrfExtension
	} from '$lib/passkey-prf';
	import Button from '$lib/components/ui/button/button.svelte';
	import Input from '$lib/components/ui/input/input.svelte';
	import Label from '$lib/components/ui/label/label.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import Bot from '@lucide/svelte/icons/bot';
	import FileText from '@lucide/svelte/icons/file-text';
	import Github from '@lucide/svelte/icons/github';
	import Inbox from '@lucide/svelte/icons/inbox';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import LockKeyhole from '@lucide/svelte/icons/lock-keyhole';
	import Rocket from '@lucide/svelte/icons/rocket';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import { PRIVACY_VERSION, TERMS_VERSION } from '$lib/legal';

	const CONNECT_COMMAND = 'claude mcp add arelay --env ARELAY_TOKEN=ar_... -- npx -y @arelay/cli mcp';
	let connectCopied = $state(false);

	async function copyConnectCommand() {
		try {
			await navigator.clipboard.writeText(CONNECT_COMMAND);
			connectCopied = true;
			setTimeout(() => (connectCopied = false), 2000);
		} catch {
			// Clipboard unavailable; the command stays selectable.
		}
	}

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

	type LoginVerifyResponse = {
		ok?: boolean;
		error?: string;
		user?: {
			email?: string;
		};
		passkeyEncryptedPrivateKey?: PasskeyEncryptedPrivateKey | null;
	};

	function loginOptionsIncludePrf(optionsJSON: PublicKeyCredentialRequestOptionsJSON): boolean {
		const extensions = optionsJSON.extensions as { prf?: unknown } | undefined;
		return Boolean(extensions?.prf);
	}

	async function tryUnlockFromLoginPasskey(
		response: Awaited<ReturnType<typeof startAuthentication>>,
		verifyJson: LoginVerifyResponse
	): Promise<boolean> {
		const encryptedPrivateKey = verifyJson.passkeyEncryptedPrivateKey;
		if (!encryptedPrivateKey || response.id !== encryptedPrivateKey.credentialId) {
			return false;
		}

		const prfOutput = getPrfOutputsFromAuthResponse(response);
		if (prfOutput) {
			try {
				const { privateKey, migratedPrivateKey } = await unlockPrivateKeyWithLoginPrfOutputs(
					encryptedPrivateKey,
					prfOutput
				);
				e2eePrivateKey.set(privateKey);
				if (migratedPrivateKey) {
					const migrated = await persistMigratedPasskeyPrivateKey(migratedPrivateKey);
					saveE2eePasskeyHint(migrated?.passkeyEncryptedPrivateKey ?? encryptedPrivateKey);
				} else {
					saveE2eePasskeyHint(encryptedPrivateKey);
				}
				return true;
			} catch {
				// Fall through to a direct passkey unlock attempt.
			}
		}

		try {
			const { privateKey, migratedPrivateKey } =
				await unlockPrivateKeyWithPasskeyMigration(encryptedPrivateKey);
			e2eePrivateKey.set(privateKey);
			if (migratedPrivateKey) {
				const migrated = await persistMigratedPasskeyPrivateKey(migratedPrivateKey);
				saveE2eePasskeyHint(migrated?.passkeyEncryptedPrivateKey ?? encryptedPrivateKey);
			} else {
				saveE2eePasskeyHint(encryptedPrivateKey);
			}
			return true;
		} catch {
			return false;
		}
	}

	async function signInWithPasskey() {
		if (passkeyBusy) return;
		passkeyBusy = true;
		passkeyError = '';
		try {
			const hint = readE2eePasskeyHint();
			const lastEmail = readLastLoginEmail();
			const lastCredentialId = readLastLoginCredentialId();

			const optionsRes = await fetch('/api/auth/passkeys/login/options', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: lastEmail ?? undefined,
					loginCredentialId: lastCredentialId ?? hint?.credentialId ?? undefined
				})
			});
			const optionsJSON = await optionsRes.json();
			if (!optionsRes.ok) throw new Error(optionsJSON.error || 'Could not start passkey login');

			let authOptions = optionsJSON;
			if (!loginOptionsIncludePrf(optionsJSON) && hint) {
				authOptions = withPasskeyPrfAuthExtension(optionsJSON, hint.salt);
			}

			const response = await startAuthentication({
				optionsJSON: preparePasskeyAuthOptionsForBrowser(authOptions)
			});
			const verifyRes = await fetch('/api/auth/passkeys/login/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(response)
			});
			const verifyJson = (await verifyRes.json()) as LoginVerifyResponse;
			if (!verifyRes.ok) throw new Error(verifyJson.error || 'Passkey login failed');

			if (verifyJson.user?.email) {
				saveLastLoginEmail(verifyJson.user.email);
			}
			saveLastLoginCredentialId(response.id);

			await tryUnlockFromLoginPasskey(response, verifyJson);
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
					: 'If you are signing up, check your email for a verification code. If you already have an account, sign in with your passkey instead.';
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
			saveLastLoginEmail(signupEmail);
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
	<meta property="og:title" content="Agent Relay — Your agents have something for you" />
	<meta name="twitter:title" content="Agent Relay — Your agents have something for you" />
</svelte:head>

<div class="login-page">
	<div class="signal-mark" aria-hidden="true">
		<span></span><span></span><span></span>
	</div>

	<header class="login-header">
		<a href="/" class="flex items-center gap-3 text-slate-950 dark:text-white">
			<Logo class="h-11 w-11" />
			<span class="text-xl font-bold whitespace-nowrap sm:text-2xl">Agent Relay</span>
		</a>
		<div class="header-actions">
			<a href="/getting-started" class="header-link">Getting started</a>
			<ThemeToggle />
			<a
				href="https://github.com/mmmikael/arelay"
				target="_blank"
				rel="noreferrer"
				class="source-badge"
			>
				<Github class="h-4 w-4" />
				<span class="hidden sm:inline">Open source</span>
				<span class="source-license">MIT</span>
			</a>
		</div>
	</header>

	<main class="login-grid">
		<section class="login-story">
			<p class="login-eyebrow">
				<span aria-hidden="true"></span>
				Private delivery channel
			</p>
			<h1>Your agents have something for you.</h1>
			<p class="login-intro">
				Reports, files, and finished work arrive encrypted in secure agent sessions, ready when you
				are.
			</p>
			<ul class="login-proof" aria-label="Agent Relay features">
				<li><KeyRound class="h-4 w-4 text-blue-600" />Passkey access</li>
				<li><ShieldCheck class="h-4 w-4 text-emerald-600" />End-to-end encrypted</li>
				<li><Github class="h-4 w-4 text-violet-600" />Self-hostable</li>
			</ul>
		</section>

		<section class="login-access">
			<div class="access-card">
				<div class="access-stripes" aria-hidden="true">
					<span></span><span></span><span></span>
				</div>
				<div class="access-card-inner">
					<div class="access-meta">
						<span>Secure access</span>
						<span>AR / 01</span>
					</div>

					<div class="access-heading">
						<div class="access-icon">
							{#if authMode === 'signin'}
								<KeyRound class="h-5 w-5" />
							{:else}
								<Inbox class="h-5 w-5" />
							{/if}
						</div>
						<div>
							<h2>
								{authMode === 'signin' ? 'Open your secure sessions' : 'Create your account'}
							</h2>
							<p>
								{authMode === 'signin'
									? 'Use your passkey to continue'
									: 'Verify your email, create a passkey, then set up encryption'}
							</p>
						</div>
					</div>

					<div class="space-y-3">
						{#if authMode === 'signin'}
							<Button
								class="h-12 w-full gap-2 rounded-md"
								onclick={signInWithPasskey}
								disabled={passkeyBusy}
							>
								<KeyRound class="h-4 w-4" />
								{passkeyBusy ? 'Checking passkey…' : 'Sign in with passkey'}
							</Button>
							<Button
								variant="outline"
								class="h-12 w-full gap-2 rounded-md"
								onclick={() => {
									authMode = 'signup';
									passkeyError = '';
									signupNotice = '';
								}}
								disabled={passkeyBusy}
							>
								<UserPlus class="h-4 w-4" />
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
									class="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-5 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
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
											class="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100"
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
										class="h-12 w-full rounded-md"
										onclick={createAccountWithPasskey}
										disabled={passkeyBusy || signupCode.replace(/\D/g, '').length !== 6}
									>
										{passkeyBusy ? 'Creating passkey…' : 'Verify email and create passkey'}
									</Button>
									<Button
										variant="outline"
										class="h-12 w-full rounded-md"
										onclick={sendVerificationCode}
										disabled={passkeyBusy || !signupEmail.trim() || !legalAccepted}
									>
										Send another code
									</Button>
								{:else}
									<Button
										class="h-12 w-full rounded-md"
										onclick={sendVerificationCode}
										disabled={passkeyBusy || !signupEmail.trim() || !legalAccepted}
									>
										{passkeyBusy ? 'Sending code…' : 'Send verification code'}
									</Button>
								{/if}
								<Button
									variant="outline"
									class="h-12 w-full rounded-md"
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
							<div class="rounded-md border border-red-100 bg-red-50 p-3">
								<p class="text-sm text-red-600">{passkeyError}</p>
							</div>
						{/if}
						{#if signupNotice}
							<div
								class="rounded-md border border-blue-100 bg-blue-50 p-3 dark:border-blue-900/50 dark:bg-blue-950/40"
							>
								<p class="text-sm text-blue-700 dark:text-blue-200">{signupNotice}</p>
							</div>
						{/if}
					</div>

					<p class="access-note">No passwords. No social login.</p>
					<p class="access-guide">
						New to Agent Relay?
						<a href="/getting-started">Set up in 5 minutes →</a>
					</p>
				</div>
			</div>
		</section>

		<div
			class="relay-visual"
			role="img"
			aria-label="A delivery moving securely from an AI agent to Agent Relay sessions"
		>
			<div class="relay-visual-inner" aria-hidden="true">
				<div class="relay-status">
					<span>Delivery route</span>
					<span><i></i>Channel ready</span>
				</div>

				<div class="relay-track">
					<div class="relay-node relay-node-agent">
						<div class="relay-node-icon"><Bot class="h-5 w-5" /></div>
						<span>Agent</span>
					</div>
					<div class="relay-connection"><span></span></div>
					<div class="relay-node relay-node-encrypted">
						<div class="relay-node-icon"><LockKeyhole class="h-5 w-5" /></div>
						<span>Encrypted</span>
					</div>
					<div class="relay-connection"><span></span></div>
					<div class="relay-node relay-node-inbox">
						<div class="relay-node-icon"><Inbox class="h-5 w-5" /></div>
						<span>Sessions</span>
					</div>
				</div>

				<div class="delivery-preview">
					<div class="delivery-file"><FileText class="h-5 w-5" /></div>
					<div class="min-w-0 flex-1">
						<p>Weekly agent report</p>
						<span>report.md · metrics.csv · brief.pdf</span>
					</div>
					<strong>Delivered</strong>
				</div>
			</div>
		</div>
	</main>

	<section class="login-connect" id="connect-agent" aria-label="Connect your agent">
		<div class="connect-copy">
			<p class="login-eyebrow">
				<span aria-hidden="true"></span>
				Connect your agent
			</p>
			<h2>Works with Claude Code, Cursor, Codex — and anything that speaks HTTP.</h2>
			<p>
				Create an agent token, run one command, and your agent can deliver encrypted reports,
				files, and finished work straight to your inbox.
			</p>
		</div>
		<div class="connect-action">
			<div class="connect-command">
				<code>{CONNECT_COMMAND}</code>
				<button type="button" class="connect-copy-btn" onclick={copyConnectCommand}>
					{connectCopied ? 'Copied ✓' : 'Copy'}
				</button>
			</div>
			<a href="/getting-started" class="connect-link">
				<Rocket class="h-4 w-4" />
				Getting started guide
			</a>
		</div>
	</section>

	<footer class="login-footer">
		<a
			href="https://github.com/mmmikael/arelay"
			target="_blank"
			rel="noreferrer"
			class="footer-source"
		>
			<Github class="h-4 w-4" />
			View source and self-host
		</a>
		<nav aria-label="Site">
			<a href="/getting-started">Getting started</a>
			<a href="/terms">Terms</a>
			<a href="/privacy">Privacy</a>
		</nav>
	</footer>
</div>

<style>
	.login-page {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		overflow: hidden;
		background: #f5f7fb;
		color: #0f172a;
		position: relative;
	}

	.signal-mark {
		display: grid;
		grid-template-columns: 52% 28% 20%;
		height: 5px;
		left: 0;
		position: absolute;
		right: 0;
		top: 0;
	}

	.signal-mark span:nth-child(1),
	.access-stripes span:nth-child(1) {
		background: #3b82f6;
	}

	.signal-mark span:nth-child(2),
	.access-stripes span:nth-child(2) {
		background: #10b981;
	}

	.signal-mark span:nth-child(3),
	.access-stripes span:nth-child(3) {
		background: #8b5cf6;
	}

	.login-header,
	.login-footer,
	.login-grid {
		margin-inline: auto;
		max-width: 1180px;
		width: calc(100% - 2rem);
	}

	.login-header {
		align-items: center;
		display: flex;
		gap: 1rem;
		justify-content: space-between;
		padding-top: 2rem;
	}

	.header-actions {
		align-items: center;
		display: flex;
		gap: 0.65rem;
	}

	.header-link {
		color: #334155;
		font-size: 0.78rem;
		font-weight: 700;
		transition: color 150ms ease;
		white-space: nowrap;
	}

	@media (max-width: 520px) {
		.header-actions .source-badge {
			display: none;
		}
	}

	.header-link:hover {
		color: #2563eb;
	}

	:global(.dark) .header-link {
		color: #cbd5e1;
	}

	:global(.dark) .header-link:hover {
		color: #93c5fd;
	}

	.source-badge {
		align-items: center;
		background: #ffffff;
		border: 1px solid #dbe3ef;
		border-radius: 999px;
		color: #334155;
		display: inline-flex;
		font-size: 0.75rem;
		font-weight: 700;
		gap: 0.5rem;
		padding: 0.4rem 0.45rem 0.4rem 0.75rem;
		transition:
			border-color 150ms ease,
			color 150ms ease,
			transform 150ms ease;
	}

	.source-badge:hover {
		border-color: #93c5fd;
		color: #2563eb;
		transform: translateY(-1px);
	}

	.source-license {
		background: #e8eef8;
		border-radius: 999px;
		color: #475569;
		padding: 0.15rem 0.45rem;
	}

	.login-grid {
		align-content: center;
		display: grid;
		flex: 1;
		gap: 2rem;
		grid-template-areas:
			'story'
			'access'
			'visual';
		padding-block: 2.5rem 2rem;
	}

	.login-story {
		grid-area: story;
	}

	.login-eyebrow {
		align-items: center;
		color: #2563eb;
		display: flex;
		font-size: 0.7rem;
		font-weight: 800;
		gap: 0.5rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.login-eyebrow span {
		background: #10b981;
		border: 3px solid #d1fae5;
		border-radius: 999px;
		height: 0.75rem;
		width: 0.75rem;
	}

	.login-story h1 {
		color: #0b1220;
		font-size: 2.4rem;
		font-weight: 750;
		letter-spacing: 0;
		line-height: 1.02;
		margin-top: 1rem;
		max-width: 11ch;
	}

	.login-intro {
		color: #526177;
		font-size: 1rem;
		line-height: 1.7;
		margin-top: 1.25rem;
		max-width: 31rem;
	}

	.login-proof {
		display: flex;
		flex-wrap: wrap;
		gap: 0.65rem 1rem;
		margin-top: 1.4rem;
	}

	.login-proof li {
		align-items: center;
		color: #475569;
		display: flex;
		font-size: 0.8rem;
		font-weight: 700;
		gap: 0.4rem;
	}

	.login-access {
		align-self: center;
		grid-area: access;
		width: 100%;
	}

	.access-card {
		background: #ffffff;
		border: 1px solid #dce3ee;
		border-radius: 8px;
		box-shadow: 0 18px 50px rgba(15, 23, 42, 0.1);
		overflow: hidden;
		width: 100%;
	}

	.access-stripes {
		display: grid;
		grid-template-columns: 52% 28% 20%;
		height: 4px;
	}

	.access-card-inner {
		padding: 1.5rem;
	}

	.access-meta {
		align-items: center;
		color: #94a3b8;
		display: flex;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.65rem;
		font-weight: 700;
		justify-content: space-between;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.access-heading {
		align-items: center;
		display: flex;
		gap: 0.85rem;
		margin-block: 1.5rem;
	}

	.access-icon {
		align-items: center;
		background: #eaf2ff;
		border: 1px solid #cfe0ff;
		border-radius: 8px;
		color: #2563eb;
		display: flex;
		flex: 0 0 auto;
		height: 2.75rem;
		justify-content: center;
		width: 2.75rem;
	}

	.access-heading h2 {
		color: #0f172a;
		font-size: 1.25rem;
		font-weight: 750;
		line-height: 1.25;
	}

	.access-heading p {
		color: #64748b;
		font-size: 0.85rem;
		margin-top: 0.2rem;
	}

	.access-note {
		color: #94a3b8;
		font-size: 0.75rem;
		margin-top: 1.25rem;
		text-align: center;
	}

	.access-guide {
		border-top: 1px solid #eef2f8;
		color: #64748b;
		font-size: 0.8rem;
		margin-top: 1rem;
		padding-top: 1rem;
		text-align: center;
	}

	.access-guide a {
		color: #2563eb;
		font-weight: 700;
	}

	.access-guide a:hover {
		text-decoration: underline;
	}

	:global(.dark) .access-guide {
		border-top-color: #1e293b;
		color: #94a3b8;
	}

	:global(.dark) .access-guide a {
		color: #93c5fd;
	}

	.relay-visual {
		background: #101827;
		border: 1px solid #1e293b;
		border-radius: 8px;
		box-shadow: 0 18px 45px rgba(15, 23, 42, 0.16);
		color: #f8fafc;
		grid-area: visual;
		overflow: hidden;
	}

	.relay-visual-inner {
		padding: 1.2rem;
	}

	.relay-status {
		align-items: center;
		color: #94a3b8;
		display: flex;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.65rem;
		font-weight: 700;
		justify-content: space-between;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.relay-status span:last-child {
		align-items: center;
		display: flex;
		gap: 0.4rem;
	}

	.relay-status i {
		background: #34d399;
		border-radius: 999px;
		box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.14);
		height: 0.45rem;
		width: 0.45rem;
	}

	.relay-track {
		align-items: start;
		display: grid;
		grid-template-columns: 3.25rem minmax(1.5rem, 1fr) 3.25rem minmax(1.5rem, 1fr) 3.25rem;
		margin: 1.25rem auto 1rem;
		max-width: 26rem;
	}

	.relay-node {
		align-items: center;
		display: flex;
		flex-direction: column;
		font-size: 0.65rem;
		font-weight: 700;
		gap: 0.45rem;
		text-align: center;
	}

	.relay-node-icon {
		border-radius: 8px;
		display: flex;
		padding: 0.65rem;
	}

	.relay-node-agent .relay-node-icon {
		background: #1d4ed8;
		color: #dbeafe;
	}

	.relay-node-encrypted .relay-node-icon {
		background: #6d28d9;
		color: #ede9fe;
	}

	.relay-node-inbox .relay-node-icon {
		background: #047857;
		color: #d1fae5;
	}

	.relay-connection {
		border-top: 1px dashed #475569;
		margin-top: 1.3rem;
		position: relative;
	}

	.relay-connection span {
		animation: relay-packet 2.8s ease-in-out infinite;
		background: #60a5fa;
		border: 2px solid #bfdbfe;
		border-radius: 999px;
		height: 0.55rem;
		left: 0;
		position: absolute;
		top: -0.3rem;
		width: 0.55rem;
	}

	.relay-connection:nth-of-type(4) span {
		animation-delay: 1.4s;
		background: #34d399;
		border-color: #a7f3d0;
	}

	.delivery-preview {
		align-items: center;
		background: #f8fafc;
		border-radius: 6px;
		color: #0f172a;
		display: flex;
		gap: 0.75rem;
		padding: 0.8rem;
	}

	.delivery-file {
		align-items: center;
		background: #dbeafe;
		border-radius: 6px;
		color: #2563eb;
		display: flex;
		flex: 0 0 auto;
		height: 2.4rem;
		justify-content: center;
		width: 2.4rem;
	}

	.delivery-preview p {
		font-size: 0.85rem;
		font-weight: 750;
	}

	.delivery-preview span {
		color: #64748b;
		display: block;
		font-size: 0.7rem;
		margin-top: 0.1rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.delivery-preview strong {
		background: #d1fae5;
		border-radius: 999px;
		color: #047857;
		font-size: 0.65rem;
		padding: 0.28rem 0.5rem;
	}

	.login-connect {
		align-items: center;
		background: #ffffff;
		border: 1px solid #dce3ee;
		border-radius: 8px;
		display: grid;
		gap: 1.5rem;
		margin-bottom: 2rem;
		margin-inline: auto;
		max-width: 1180px;
		padding: 1.75rem;
		scroll-margin-top: 1.5rem;
		width: calc(100% - 2rem);
	}

	.connect-copy h2 {
		color: #0b1220;
		font-size: 1.35rem;
		font-weight: 750;
		line-height: 1.25;
		margin-top: 0.85rem;
		max-width: 26ch;
	}

	.connect-copy p:last-child {
		color: #526177;
		font-size: 0.9rem;
		line-height: 1.65;
		margin-top: 0.75rem;
		max-width: 36rem;
	}

	.connect-copy,
	.connect-action {
		min-width: 0;
	}

	.connect-action {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}

	.connect-command {
		align-items: center;
		background: #101827;
		border: 1px solid #1e293b;
		border-radius: 8px;
		display: flex;
		gap: 0.5rem;
		min-width: 0;
		padding-right: 0.55rem;
	}

	.connect-command code {
		color: #e2e8f0;
		display: block;
		flex: 1;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.75rem;
		line-height: 1.6;
		min-width: 0;
		overflow-wrap: anywhere;
		padding: 0.85rem 0.5rem 0.85rem 1rem;
		white-space: pre-wrap;
	}

	.connect-copy-btn {
		background: #1e293b;
		border: 1px solid #334155;
		border-radius: 6px;
		color: #94a3b8;
		flex: 0 0 auto;
		font-size: 0.7rem;
		font-weight: 700;
		padding: 0.25rem 0.6rem;
		transition:
			color 150ms ease,
			border-color 150ms ease;
	}

	.connect-copy-btn:hover {
		border-color: #60a5fa;
		color: #bfdbfe;
	}

	.connect-link {
		align-items: center;
		background: #2563eb;
		border-radius: 6px;
		color: #ffffff;
		display: inline-flex;
		font-size: 0.8rem;
		font-weight: 700;
		gap: 0.5rem;
		justify-content: center;
		padding: 0.65rem 1.1rem;
		transition: background 150ms ease;
		width: fit-content;
	}

	.connect-link:hover {
		background: #1d4ed8;
	}

	.login-footer {
		align-items: center;
		color: #64748b;
		display: flex;
		font-size: 0.75rem;
		justify-content: space-between;
		padding-bottom: 1.5rem;
	}

	.footer-source,
	.login-footer nav {
		align-items: center;
		display: flex;
		gap: 1rem;
	}

	.footer-source {
		font-weight: 700;
		gap: 0.4rem;
	}

	.footer-source:hover,
	.login-footer a:hover {
		color: #2563eb;
	}

	@keyframes relay-packet {
		0%,
		15% {
			left: 0;
			opacity: 0;
		}
		25% {
			opacity: 1;
		}
		75% {
			opacity: 1;
		}
		85%,
		100% {
			left: calc(100% - 0.55rem);
			opacity: 0;
		}
	}

	@media (min-width: 768px) {
		.login-header,
		.login-footer,
		.login-grid {
			width: calc(100% - 4rem);
		}

		.login-connect {
			grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
			padding: 2rem 2.25rem;
			width: calc(100% - 4rem);
		}

		.login-grid {
			gap: 2rem 4.5rem;
			grid-template-areas:
				'story access'
				'visual access';
			grid-template-columns: minmax(0, 1.15fr) minmax(22rem, 0.75fr);
			grid-template-rows: auto auto;
			padding-block: 2.5rem 2rem;
		}

		.login-story {
			align-self: end;
		}

		.login-story h1 {
			font-size: clamp(3rem, 5vw, 4.75rem);
		}

		.login-intro {
			font-size: 1.08rem;
		}

		.access-card-inner {
			padding: 2rem;
		}

		.relay-visual {
			align-self: start;
			max-width: 37rem;
		}

		.relay-visual-inner {
			padding: 1.4rem;
		}
	}

	@media (max-width: 767px) {
		.login-header {
			padding-top: 1.5rem;
		}

		.connect-copy h2 {
			font-size: 1.15rem;
		}

		.login-connect {
			padding: 1.4rem;
		}

		.login-grid {
			padding-top: 2rem;
		}

		.login-story h1 {
			font-size: 2.55rem;
			max-width: 10ch;
		}

		.login-access {
			max-width: 28rem;
		}

		.relay-visual {
			max-width: 28rem;
		}

		.login-footer {
			align-items: flex-start;
			flex-direction: column;
			gap: 0.8rem;
		}
	}

	:global(.dark) .login-page {
		background: #030712;
		color: #f8fafc;
	}

	:global(.dark) .source-badge,
	:global(.dark) .access-card,
	:global(.dark) .login-connect {
		background: #0f172a;
		border-color: #263449;
		color: #cbd5e1;
	}

	:global(.dark) .connect-copy h2 {
		color: #f8fafc;
	}

	:global(.dark) .connect-copy p:last-child {
		color: #94a3b8;
	}

	:global(.dark) .source-license {
		background: #1e293b;
		color: #cbd5e1;
	}

	:global(.dark) .login-story h1,
	:global(.dark) .access-heading h2 {
		color: #f8fafc;
	}

	:global(.dark) .login-intro,
	:global(.dark) .login-proof li,
	:global(.dark) .access-heading p {
		color: #94a3b8;
	}

	:global(.dark) .access-icon {
		background: #172554;
		border-color: #1e3a8a;
		color: #93c5fd;
	}

	@media (prefers-reduced-motion: reduce) {
		.relay-connection span {
			animation: none;
			left: calc(50% - 0.275rem);
			opacity: 1;
		}
	}
</style>
