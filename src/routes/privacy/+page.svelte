<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import { LEGAL_EFFECTIVE_DATE, PRIVACY_VERSION } from '$lib/legal';
</script>

<svelte:head>
	<title>Privacy Policy — Agent Relay</title>
	<meta
		name="description"
		content="How the hosted Agent Relay service collects, uses, and protects information."
	/>
</svelte:head>

<main class="mx-auto min-h-screen w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
	<a href="/" class="inline-flex items-center gap-3 text-slate-900 dark:text-slate-100">
		<Logo class="h-10 w-10" />
		<span class="text-xl font-bold">Agent Relay</span>
	</a>

	<article class="mt-10">
		<p class="text-sm font-semibold text-blue-600 dark:text-blue-300">Hosted service</p>
		<h1 class="mt-2 text-3xl font-semibold text-slate-950 sm:text-4xl dark:text-white">
			Privacy Policy
		</h1>
		<p class="mt-3 text-sm text-slate-500 dark:text-slate-400">
			Effective {LEGAL_EFFECTIVE_DATE} · Version {PRIVACY_VERSION}
		</p>

		<div class="legal-copy mt-10">
			<section>
				<h2>1. Scope</h2>
				<p>
					This policy describes the hosted Agent Relay service at
					<strong>arelay.app</strong>. Alpha Al Limited, a company registered in Hong Kong
					under business registration number 77209784, is the operator and controller of the
					hosted service. A self-hosted installation is controlled by its own operator, whose
					privacy practices may differ.
				</p>
			</section>

			<section>
				<h2>2. Information we collect</h2>
				<ul>
					<li>Account details such as your email address and display name.</li>
					<li>
						Passkey public keys, credential identifiers, and security metadata. We do not
						receive your biometric data or private passkey key.
					</li>
					<li>
						Agent token hashes and encrypted copies of agent tokens (stored as ciphertext
						envelopes for reveal in your browser).
					</li>
					<li>
						Session metadata such as delivery timestamps, read state, storage sizes, and
						encryption version markers.
					</li>
					<li>
						Encrypted delivery content: ciphertext envelopes for titles, summaries, filenames,
						file payloads, and email drafts. The hosted service cannot read this content.
					</li>
					<li>
						Essential session cookies and limited technical logs, such as IP address, request
						time, and error information, used for security and operation.
					</li>
				</ul>
			</section>

			<section>
				<h2>3. End-to-end encryption</h2>
				<p>
					Agent Relay requires end-to-end encryption for all agent deliveries. You must
					complete encryption setup on your first portal visit before using sessions or
					creating agent tokens. Compatible agents encrypt delivery content locally before
					upload; your browser decrypts it after you unlock encryption with your passkey.
					The hosted service stores only ciphertext and cannot read agent delivery content.
				</p>
				<p>
					Some information is not end-to-end encrypted. Account details, authentication
					records, usage and storage totals, timestamps, network logs, and operational
					metadata may remain visible to the service. If you use Email Review Relay and
					approve a draft, decrypted email fields are sent in that approve request over
					HTTPS so mail can be sent; they are not stored as plaintext on the server.
					Cloudflare Account ID and API tokens you save in Account are encrypted at rest on
					the server (separate from end-to-end encryption).
				</p>
			</section>

			<section>
				<h2>4. How we use information</h2>
				<p>
					We use information to provide and secure accounts, receive and display deliveries,
					operate storage, prevent abuse, diagnose problems, communicate service information,
					and comply with legal obligations. We do not sell personal information or use session
					content for advertising.
				</p>
			</section>

			<section>
				<h2>5. Service providers and disclosure</h2>
				<p>
					We use infrastructure providers for hosting, databases, object storage, networking,
					and transactional email. They process information only as needed to provide those
					services. We may disclose information when required by law or reasonably necessary
					to protect users, the service, or the public.
				</p>
			</section>

			<section>
				<h2>6. Retention and deletion</h2>
				<p>
					We retain account information and stored deliveries while your account is active,
					subject to service limits and operational needs. Security and error logs are kept
					only as long as reasonably needed. When information is deleted, removal from backups
					and provider systems may take additional time.
				</p>
			</section>

			<section>
				<h2>7. Your choices and rights</h2>
				<p>
					You can delete deliveries and stop using the service. Depending on where you live,
					you may also have rights to access, correct, export, object to processing of, or
					delete personal information. We may need to verify your account before acting on a
					request.
				</p>
			</section>

			<section>
				<h2>8. Security and contact</h2>
				<p>
					We use technical and organizational safeguards, but no online service can guarantee
					absolute security. For a confidential privacy or security request, open a
					<a href="https://github.com/mmmikael/arelay/security/advisories/new"
						>private GitHub security advisory</a
					>. For general questions, use the
					<a href="https://github.com/mmmikael/arelay/issues">public issue tracker</a> without
					including private data.
				</p>
			</section>
		</div>
	</article>

	<nav aria-label="Legal" class="mt-12 flex gap-5 border-t border-slate-200 pt-6 text-sm dark:border-slate-800">
		<a href="/" class="font-semibold text-blue-600 hover:underline dark:text-blue-300">
			Back to sign in
		</a>
		<a href="/terms" class="text-slate-600 hover:underline dark:text-slate-300">
			Terms of Service
		</a>
	</nav>
</main>
