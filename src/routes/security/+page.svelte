<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
</script>

<svelte:head>
	<title>Security — Agent Relay</title>
	<meta
		name="description"
		content="How Agent Relay protects agent deliveries and approvals: end-to-end encryption, what the server can and cannot see, the one exception at approval time, credentials we hold, subprocessors, and known limits."
	/>
	<meta property="og:title" content="Security — Agent Relay" />
	<meta name="twitter:title" content="Security — Agent Relay" />
</svelte:head>

<main class="mx-auto min-h-screen w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
	<header class="flex items-center justify-between">
		<a href="/" class="inline-flex items-center gap-3 text-slate-900 dark:text-slate-100">
			<Logo class="h-10 w-10" />
			<span class="text-xl font-bold">Agent Relay</span>
		</a>
		<ThemeToggle />
	</header>

	<article class="mt-10">
		<p class="text-sm font-semibold text-blue-600 dark:text-blue-300">Security</p>
		<h1 class="mt-2 text-3xl font-semibold text-slate-950 sm:text-4xl dark:text-white">
			What we can see, what we cannot, and the one exception
		</h1>
		<p class="mt-3 text-base text-slate-500 dark:text-slate-400">
			Written for the person filling in a security questionnaire. Every claim below is about the
			code that runs at arelay.app, which is
			<a
				href="https://github.com/mmmikael/arelay"
				class="font-semibold text-blue-600 underline underline-offset-2 dark:text-blue-300"
				>open source under MIT</a
			>, so all of it can be checked.
		</p>

		<blockquote
			class="mt-8 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-base leading-7 text-slate-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-slate-100"
		>
			Agent Relay never stores your content in the clear. The one exception is approving an email
			send, which necessarily reveals that email — briefly to us, and permanently to the recipient's
			mail provider, because email is not end-to-end encrypted. Everything before approval, and
			every artifact, stays encrypted with a key we don't have.
		</blockquote>

		<div class="legal-copy mt-10">
			<section>
				<h2>1. Threat model in one paragraph</h2>
				<p>
					The system is designed so that a full compromise of our servers — database, object
					storage, and application host together — yields ciphertext and metadata, not the content
					your agents produced. The people we protect against are us, our hosting providers, and
					anyone who obtains what we hold. The people we do <em>not</em> protect against are you (you
					hold the key) and whoever you choose to email: once you approve a send, the message exists in
					clear at the recipient's provider, as with any email.
				</p>
			</section>

			<section>
				<h2>2. What is end-to-end encrypted</h2>
				<ul>
					<li>Delivery titles, summaries, filenames, content types, and file bytes.</li>
					<li>
						Email drafts submitted for approval: recipients, sender, subject, HTML and text bodies,
						and attachments.
					</li>
					<li>Spend requests submitted for approval: payee, amount, currency, and description.</li>
					<li>
						The snapshot of what was actually sent or charged after an approval (re-encrypted in
						your browser before it is stored).
					</li>
					<li>
						The copy of each agent token kept for "reveal" in the portal. Authentication uses only a
						SHA-256 hash of the token.
					</li>
				</ul>
				<p>
					Every field and file is a separate envelope: P-256 ECDH against your public key with a
					fresh ephemeral key per envelope, then AES-256-GCM. The agent encrypts before anything
					leaves its process; the server rejects plaintext submissions. Decryption happens in your
					browser after you unlock with your passkey.
				</p>
			</section>

			<section>
				<h2>3. What the server can see</h2>
				<p>
					Metadata is not encrypted, because the service needs it to operate: your email address and
					display name, passkey public keys, agent token names and hashes, when a delivery arrived,
					how large it is, whether you have read it, whether an approval is pending, approved,
					rejected, sent, or failed, your storage total, IP addresses in request logs, and error
					logs. If a law-enforcement request compels us to produce data, this is what we can
					produce: ciphertext and this metadata.
				</p>
			</section>

			<section>
				<h2>4. The exception: approving a send or a charge</h2>
				<p>
					Approval has to act in the world, and the world does not accept ciphertext. When you click <strong
						>Approve</strong
					> on an email draft, your browser decrypts it locally and posts the decrypted recipients, subject,
					body, and attachments to the server in that one request. The server sanitizes the HTML and hands
					it to your email provider using the sending credential you saved. When you approve a spend request,
					the same happens with payee, amount, currency, and description, which are passed to Stripe.
				</p>
				<ul>
					<li>
						<strong>Plaintext is never persisted.</strong> It exists in server memory for the duration
						of the request and in one outbound TLS connection to the provider. What is stored afterwards
						is a snapshot re-encrypted in your browser.
					</li>
					<li>
						<strong>It is approval-only.</strong> Artifacts are never decrypted server-side, and nothing
						about a pending item is readable to us before you approve it.
					</li>
					<li>
						<strong>It is proportionate.</strong> Email is not end-to-end encrypted at the destination.
						The moment you approve a send, the message exists permanently in clear at the recipient's
						provider; the server holding it for the length of one request does not change your real exposure.
					</li>
					<li>
						<strong>Why not send from the browser?</strong> Email providers do not accept browser-origin
						requests, a send-capable token in browser JavaScript would let any cross-site scripting bug
						send mail as our users, and it would gain nothing given the point above. Handling the send
						server-side is also what lets us sanitize HTML and, over time, apply policy such as blocking
						a message that contains a secret.
					</li>
				</ul>
			</section>

			<section>
				<h2>5. Credentials we hold for you</h2>
				<p>
					To send email on approval you save a Cloudflare Email Sending account id and API token; to
					execute a spend approval you save a Stripe secret key. These are stored encrypted at rest,
					but with a key the <em>server</em> derives from its own configuration, not with your end-to-end
					key. This is a deliberate disclosure: an attacker holding both our database and that configuration
					secret could use those credentials without your approval. Nothing in the code does so; every
					use is triggered by your explicit approve action.
				</p>
				<p>
					Reduce the blast radius on your side: give Cloudflare a token scoped to Email Sending on
					one domain, and give Stripe a restricted or test-mode key. We intend to move these
					credentials under your end-to-end key so they can only be unwrapped in your browser at
					approval time; that change is on the roadmap below because it also removes the possibility
					of any unattended sending.
				</p>
			</section>

			<section>
				<h2>6. Keys and authentication</h2>
				<ul>
					<li>
						Sign-in uses passkeys (WebAuthn) and a signed, HTTP-only session cookie. There are no
						passwords and no social login.
					</li>
					<li>
						Your private decryption key is generated in your browser and wrapped with your passkey
						(via the PRF extension where supported) and with a recovery key you store yourself. We
						hold only the wrapped forms and cannot unwrap them. If you lose both your passkey and
						your recovery key, your encrypted content is unrecoverable, by us or by anyone.
					</li>
					<li>
						Agents authenticate with named bearer tokens. Each can be revoked individually;
						revocation stops new deliveries immediately but cannot recall what was already delivered
						to you.
					</li>
					<li>
						HTML and Markdown previews render in sandboxed iframes with external URLs stripped.
						Public authentication endpoints and agent endpoints are rate limited.
					</li>
				</ul>
			</section>

			<section>
				<h2>7. Hosted infrastructure and subprocessors</h2>
				<p>
					The hosted service is operated by Alpha Al Limited (Hong Kong). Providers that process
					data on our behalf:
				</p>
				<ul>
					<li>
						<strong>Railway</strong> — application hosting and PostgreSQL (EU West region). Holds metadata
						and ciphertext.
					</li>
					<li>
						<strong>Amazon Web Services S3</strong> (ap-southeast-1) — object storage for artifact ciphertext
						only.
					</li>
					<li>
						<strong>Cloudflare</strong> — transactional email for account verification, and, using credentials
						you supply, the delivery of approved emails.
					</li>
					<li>
						<strong>Stripe</strong> — payments for paid plans, and, using a key you supply, the execution
						of approved spend requests. Card details never touch our servers.
					</li>
					<li>
						<strong>Umami</strong> (self-hosted on Railway) — privacy-preserving page analytics with no
						cookies; you can exclude your own visits from your account page.
					</li>
				</ul>
				<p>
					Backups contain the same ciphertext and metadata as the live database and object store.
					Restoring a backup grants no plaintext access.
				</p>
			</section>

			<section>
				<h2>8. Self-hosting</h2>
				<p>
					Every guarantee above holds when you run Agent Relay yourself under the MIT license, with
					one difference: you are the operator. That answers most residency and custody questions
					outright — your VPC, your database, your object store, your keys, no vendor in the path.
					The
					<a href="https://github.com/mmmikael/arelay#self-hosting">self-hosting guide</a>
					covers deployment, backups, and the environment variables involved.
				</p>
			</section>

			<section>
				<h2>9. Known limits</h2>
				<ul>
					<li>
						Envelopes are single-recipient. Today each account has exactly one member and one key,
						so there is no way to share an inbox or let a second person read history.
					</li>
					<li>
						There is no search over encrypted content, and there will not be; searchable encryption
						is a research problem we are not going to solve here.
					</li>
					<li>Metadata (section 3) is visible to us and to our providers.</li>
					<li>
						If your policy requires that the <em>vendor</em> can produce content on demand, end-to-end
						encryption is the wrong fit; Agent Relay cannot do that.
					</li>
				</ul>
			</section>

			<section>
				<h2>10. Roadmap items that change this page</h2>
				<ul>
					<li>
						Multi-recipient envelopes, so an inbox can be shared and an organisation can hold a
						compliance key alongside each member's key.
					</li>
					<li>
						Sending credentials wrapped under your key and supplied only at approval time (section
						5).
					</li>
					<li>
						Approval records signed by the approving device, giving a tamper-evident audit trail
						that neither we nor anyone holding our database can forge.
					</li>
					<li>Server-side policy at approval time: secret detection and external-domain flags.</li>
				</ul>
				<p>We will update this page as each ships, and the change history is in the repository.</p>
			</section>

			<section>
				<h2>11. Reporting a vulnerability</h2>
				<p>
					Please report security issues privately through a
					<a href="https://github.com/mmmikael/arelay/security/advisories/new"
						>GitHub security advisory</a
					>. Do not include live credentials or customer content. Details are in
					<a href="https://github.com/mmmikael/arelay/blob/main/SECURITY.md">SECURITY.md</a>.
				</p>
			</section>
		</div>
	</article>

	<nav
		aria-label="Site"
		class="mt-12 flex flex-wrap gap-5 border-t border-slate-200 pt-6 text-sm dark:border-slate-800"
	>
		<a href="/" class="font-semibold text-blue-600 hover:underline dark:text-blue-300">Home</a>
		<a href="/pricing" class="text-slate-600 hover:underline dark:text-slate-300">Pricing</a>
		<a href="/getting-started" class="text-slate-600 hover:underline dark:text-slate-300">
			Getting started
		</a>
		<a href="/privacy" class="text-slate-600 hover:underline dark:text-slate-300">Privacy</a>
		<a href="/terms" class="text-slate-600 hover:underline dark:text-slate-300">Terms</a>
	</nav>
</main>
