<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import { LEGAL_EFFECTIVE_DATE, TERMS_VERSION } from '$lib/legal';
</script>

<svelte:head>
	<title>Terms of Service — Agent Relay</title>
	<meta
		name="description"
		content="Terms for using the hosted Agent Relay service at arelay.app."
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
			Terms of Service
		</h1>
		<p class="mt-3 text-sm text-slate-500 dark:text-slate-400">
			Effective {LEGAL_EFFECTIVE_DATE} · Version {TERMS_VERSION}
		</p>

		<div class="legal-copy mt-10">
			<section>
				<h2>1. Scope</h2>
				<p>
					These terms apply to the hosted Agent Relay service at <strong>arelay.app</strong>.
					The hosted service is operated by Alpha Al Limited, a company registered in Hong
					Kong under business registration number 77209784 (“we”). These terms do not govern
					independently operated, self-hosted installations.
				</p>
			</section>

			<section>
				<h2>2. Your account</h2>
				<p>
					You must provide accurate account information and keep your passkeys, recovery
					material, and agent API tokens secure. You are responsible for activity performed
					through your account and connected agents.
				</p>
			</section>

			<section>
				<h2>3. Your content</h2>
				<p>
					You keep ownership of content submitted to Agent Relay. You give us only the rights
					needed to store, transmit, process, and display that content to operate the service.
					You must have the right to submit it and must not use the service for unlawful,
					harmful, or abusive activity.
				</p>
				<p>
					All agent deliveries must be end-to-end encrypted. You are responsible for completing
					encryption setup in the portal and for configuring agents to encrypt before upload.
					Plaintext agent payloads are rejected.
				</p>
			</section>

			<section class="legal-warning">
				<h2>4. Storage and data loss</h2>
				<p>
					<strong>Agent Relay is not a backup or archival service.</strong> Keep independent
					copies of important files and messages. Deliveries may be deleted, lost, corrupted,
					or become inaccessible because of service failure, account termination, deletion,
					or loss of passkeys or encryption credentials. Encryption setup is required before
					you can receive agent deliveries. End-to-end encrypted content cannot be recovered
					by us if you lose the material required to decrypt it.
				</p>
			</section>

			<section>
				<h2>5. Availability</h2>
				<p>
					The service is provided “as is” and “as available.” We do not promise uninterrupted
					operation, permanent storage, error-free delivery, or recovery of any data. We may
					change, limit, suspend, or discontinue the service, and will try to give reasonable
					notice when practical.
				</p>
			</section>

			<section>
				<h2>6. Suspension and termination</h2>
				<p>
					You may stop using the service at any time. We may suspend or terminate access when
					reasonably necessary to protect the service or others, address abuse or security
					risk, comply with law, or enforce these terms.
				</p>
			</section>

			<section>
				<h2>7. Liability</h2>
				<p>
					To the maximum extent permitted by law, Agent Relay and its operator are not liable
					for indirect, incidental, special, consequential, or exemplary damages, or for loss
					of data, content, profits, business, or goodwill. Our total liability relating to
					the hosted service will not exceed the amount you paid, if any, for the service
					during the previous 12 months.
				</p>
				<p>
					Nothing in these terms excludes liability or consumer rights that cannot legally be
					excluded or limited.
				</p>
			</section>

			<section>
				<h2>8. Changes and contact</h2>
				<p>
					We may update these terms as the service changes. Material updates will be presented
					for acceptance. For questions, use the
					<a href="https://github.com/mmmikael/arelay/issues">Agent Relay issue tracker</a>.
					Do not include private data in a public issue.
				</p>
			</section>
		</div>
	</article>

	<nav aria-label="Legal" class="mt-12 flex gap-5 border-t border-slate-200 pt-6 text-sm dark:border-slate-800">
		<a href="/" class="font-semibold text-blue-600 hover:underline dark:text-blue-300">
			Back to sign in
		</a>
		<a href="/privacy" class="text-slate-600 hover:underline dark:text-slate-300">
			Privacy Policy
		</a>
	</nav>
</main>
