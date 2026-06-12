<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import Bot from '@lucide/svelte/icons/bot';
	import Github from '@lucide/svelte/icons/github';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import SquareTerminal from '@lucide/svelte/icons/square-terminal';
	import Blocks from '@lucide/svelte/icons/blocks';
	import Globe from '@lucide/svelte/icons/globe';
	import Clock from '@lucide/svelte/icons/clock';

	let copiedId = $state('');

	async function copy(id: string, text: string) {
		try {
			await navigator.clipboard.writeText(text);
			copiedId = id;
			setTimeout(() => {
				if (copiedId === id) copiedId = '';
			}, 2000);
		} catch {
			// Clipboard unavailable (e.g. insecure context); the code stays selectable.
		}
	}

	const PATHS = [
		{ id: 'claude-code', label: 'Claude Code', icon: Bot },
		{ id: 'mcp', label: 'Cursor & other MCP', icon: Blocks },
		{ id: 'cli', label: 'Terminal / CLI', icon: SquareTerminal },
		{ id: 'skill', label: 'Agent skill', icon: KeyRound },
		{ id: 'api', label: 'HTTP API', icon: Globe },
		{ id: 'cron', label: 'Hermes cron', icon: Clock }
	] as const;

	let activePath = $state<(typeof PATHS)[number]['id']>('claude-code');

	const CLAUDE_CODE_MCP = 'claude mcp add arelay --env ARELAY_TOKEN=ar_... -- npx -y @arelay/cli mcp';

	const MCP_JSON = `{
  "mcpServers": {
    "arelay": {
      "command": "npx",
      "args": ["-y", "@arelay/cli", "mcp"],
      "env": { "ARELAY_TOKEN": "ar_..." }
    }
  }
}`;

	const CLI_SEND = `export ARELAY_TOKEN=ar_...   # from Account → Agent tokens
npx -y @arelay/cli send report.md --title "Q2 revenue report"`;

	const SKILL_INSTALL = 'npx skills add mmmikael/arelay-skills --skill agent-relay -g -y';

	const SKILL_HERMES = `hermes skills tap add mmmikael/arelay-skills
hermes skills install mmmikael/arelay-skills/agent-relay`;

	const HERMES_CRON = `hermes plugins install mmmikael/arelay-hermes-plugin --enable
# ~/.hermes/.env: AGENT_API_TOKEN, AGENT_RELAY_URL, AGENT_RELAY_HOME_CHANNEL
hermes gateway start
/cron add "0 9 * * *" "Your prompt. Never use [SILENT]." --deliver arelay`;

	const CLI_CHECK = 'npx -y @arelay/cli check';
</script>

<svelte:head>
	<title>Getting started — Agent Relay</title>
	<meta
		name="description"
		content="Set up Agent Relay in minutes: create an account, generate an agent token, and connect Claude Code, Cursor, Codex, or any HTTP client via MCP, CLI, or agent skill."
	/>
	<meta property="og:title" content="Getting started — Agent Relay" />
	<meta name="twitter:title" content="Getting started — Agent Relay" />
</svelte:head>

{#snippet codeBlock(id: string, code: string)}
	<div class="code-block">
		<pre><code>{code}</code></pre>
		<button type="button" class="code-copy" onclick={() => copy(id, code)}>
			{copiedId === id ? 'Copied ✓' : 'Copy'}
		</button>
	</div>
{/snippet}

<main class="mx-auto min-h-screen w-full max-w-3xl px-4 py-8 sm:px-8 sm:py-14">
	<header class="flex items-center justify-between">
		<a href="/" class="inline-flex items-center gap-3 text-slate-900 dark:text-slate-100">
			<Logo class="h-10 w-10" />
			<span class="text-xl font-bold">Agent Relay</span>
		</a>
		<ThemeToggle />
	</header>

	<article class="mt-8 sm:mt-10">
		<p class="text-sm font-semibold text-blue-600 dark:text-blue-300">Guide · ~5 minutes</p>
		<h1 class="mt-2 text-3xl font-semibold text-slate-950 sm:text-4xl dark:text-white">
			Getting started
		</h1>
		<p class="mt-3 text-base text-slate-500 dark:text-slate-400">
			Four steps from zero to your first encrypted delivery. No passwords, no SDKs to learn —
			one token and one command.
		</p>

		<div class="guide-copy mt-8 sm:mt-10">
			<section class="step">
				<div class="step-head">
					<span class="step-num">1</span>
					<h2>Create your account</h2>
				</div>
				<div class="step-body">
					<p>
						<a href="/">Sign up</a> with your email and a passkey — no passwords, no social login.
						On your first portal visit, complete <strong>Set up encryption</strong>: your passkey
						protects the encryption key, and you get a recovery key to store somewhere safe.
					</p>
					<p>
						All agent deliveries are end-to-end encrypted; they are decrypted in your browser,
						never on the server.
					</p>
				</div>
			</section>

			<section class="step">
				<div class="step-head">
					<span class="step-num">2</span>
					<h2>Create an agent token</h2>
				</div>
				<div class="step-body">
					<p>
						In the portal, open <strong>Account → Agent tokens</strong> and create a named token
						for each agent (for example, “Claude Code”).
					</p>
					<ul>
						<li>The token (<code>ar_...</code>) is shown <strong>once</strong>, at creation time — copy it then.</li>
						<li>Tokens can be revoked individually at any time.</li>
						<li>Never commit tokens to a repository; set them where your agent runs.</li>
					</ul>
				</div>
			</section>

			<section class="step">
				<div class="step-head">
					<span class="step-num">3</span>
					<h2>Connect your agent</h2>
				</div>
				<div class="step-body">
					<p>Agent Relay is agent-agnostic — pick the path that fits your setup:</p>

					<div class="path-tabs" role="tablist" aria-label="Integration paths">
						{#each PATHS as path (path.id)}
							<button
								type="button"
								role="tab"
								aria-selected={activePath === path.id}
								class="path-tab"
								class:active={activePath === path.id}
								onclick={() => (activePath = path.id)}
							>
								<path.icon class="h-3.5 w-3.5" />
								{path.label}
							</button>
						{/each}
					</div>

					<div class="path-panel">
						{#if activePath === 'claude-code'}
							<p>Run one command, pasting the token from step 2:</p>
							{@render codeBlock('claude-code', CLAUDE_CODE_MCP)}
							<p>
								Done — your agent now has three tools: <code>deliver_to_inbox</code>,
								<code>list_inbox_sessions</code>, and <code>submit_email_draft</code>.
								Encryption is handled automatically.
							</p>
						{:else if activePath === 'mcp'}
							<p>
								Any MCP-capable client (Cursor, Claude Desktop, …) works with the standard
								server configuration:
							</p>
							{@render codeBlock('mcp-json', MCP_JSON)}
							<p>
								The server exposes <code>deliver_to_inbox</code>,
								<code>list_inbox_sessions</code>, and <code>submit_email_draft</code>.
							</p>
						{:else if activePath === 'cli'}
							<p>
								The <a
									href="https://www.npmjs.com/package/@arelay/cli"
									target="_blank"
									rel="noreferrer"><code>@arelay/cli</code></a
								> package wraps the API and all envelope encryption — deliver from scripts, CI, or
								your terminal:
							</p>
							{@render codeBlock('cli-send', CLI_SEND)}
							<p>
								It also exports a typed SDK
								(<code>import {'{ ArelayClient }'} from '@arelay/cli'</code>) for custom
								integrations.
							</p>
						{:else if activePath === 'skill'}
							<p>
								For <a href="https://agentskills.io/specification" target="_blank" rel="noreferrer"
									>Agent Skills</a
								> hosts (Cursor, Codex, Claude Code, …), install the
								<a
									href="https://github.com/mmmikael/arelay-skills/tree/main/skills/agent-relay"
									target="_blank"
									rel="noreferrer">agent-relay</a
								> skill:
							</p>
							{@render codeBlock('skill', SKILL_INSTALL)}
							<p>Hermes Agent:</p>
							{@render codeBlock('skill-hermes', SKILL_HERMES)}
						{:else if activePath === 'api'}
							<p>
								Anything that can POST JSON can deliver: fetch your public key from
								<code>GET /api/agent/e2ee/config</code>, encrypt locally, create a session, and
								upload artifacts. See the
								<a
									href="https://github.com/mmmikael/arelay-skills/blob/main/skills/agent-relay/references/api-reference.md"
									target="_blank"
									rel="noreferrer">API reference</a
								> for the envelope format and working encryption code.
							</p>
						{:else if activePath === 'cron'}
							<p>
								Scheduled Hermes jobs can deliver their output with
								<a
									href="https://github.com/mmmikael/arelay-hermes-plugin"
									target="_blank"
									rel="noreferrer">arelay-hermes-plugin</a
								>. Cron runs in the gateway, so credentials go in <code>~/.hermes/.env</code>:
							</p>
							{@render codeBlock('hermes-cron', HERMES_CRON)}
						{/if}
					</div>
				</div>
			</section>

			<section class="step">
				<div class="step-head">
					<span class="step-num">4</span>
					<h2>Send a test delivery</h2>
				</div>
				<div class="step-body">
					<p>Verify the token and encryption setup:</p>
					{@render codeBlock('cli-check', CLI_CHECK)}
					<p>
						Then ask your agent for something like <em>“Send a test markdown file to my Agent
						Relay inbox”</em> — the delivery appears in your <a href="/portal">portal</a> within
						seconds, ready to preview and download.
					</p>
				</div>
			</section>

			<section class="extra">
				<h2>Optional: Email Review Relay</h2>
				<p>
					Agents can also draft outbound email for your approval: drafts arrive encrypted in the
					same inbox, and nothing is sent until you review and approve. Add your Cloudflare email
					credentials under <strong>Account → Email sending</strong> to enable sending.
				</p>
			</section>

			<section class="extra">
				<h2>Self-hosting</h2>
				<p>
					Agent Relay is open source under the MIT license. To run it on your own infrastructure,
					see the
					<a href="https://github.com/mmmikael/arelay#self-hosting" target="_blank" rel="noreferrer"
						>self-hosting guide</a
					> — then point agents at your deployment with <code>ARELAY_URL</code>.
				</p>
			</section>
		</div>
	</article>

	<nav
		aria-label="Guide"
		class="mt-12 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-200 pt-6 text-sm dark:border-slate-800"
	>
		<a href="/" class="font-semibold text-blue-600 hover:underline dark:text-blue-300">
			Back to sign in
		</a>
		<a
			href="https://github.com/mmmikael/arelay"
			target="_blank"
			rel="noreferrer"
			class="inline-flex items-center gap-1.5 text-slate-600 hover:underline dark:text-slate-300"
		>
			<Github class="h-3.5 w-3.5" />
			GitHub
		</a>
		<a href="/terms" class="text-slate-600 hover:underline dark:text-slate-300">Terms</a>
		<a href="/privacy" class="text-slate-600 hover:underline dark:text-slate-300">Privacy</a>
	</nav>
</main>

<style>
	.guide-copy {
		color: var(--text-secondary);
		font-size: 1rem;
		line-height: 1.75;
	}

	.step {
		border-left: 2px solid #dbe3ef;
		padding-bottom: 2.25rem;
		padding-left: 1.25rem;
		position: relative;
	}

	.step:last-of-type {
		padding-bottom: 1rem;
	}

	:global(.dark) .step {
		border-left-color: #263449;
	}

	.step-head {
		align-items: center;
		display: flex;
		gap: 0.75rem;
	}

	.step-num {
		align-items: center;
		background: #2563eb;
		border-radius: 999px;
		color: #ffffff;
		display: flex;
		flex: 0 0 auto;
		font-size: 0.85rem;
		font-weight: 800;
		height: 1.75rem;
		justify-content: center;
		left: -2.15rem;
		position: absolute;
		width: 1.75rem;
	}

	.step-head h2,
	.extra h2 {
		color: var(--text-primary);
		font-size: 1.25rem;
		font-weight: 700;
	}

	.step-body {
		margin-top: 0.6rem;
	}

	.extra {
		margin-top: 2.25rem;
	}

	.extra h2 {
		font-size: 1.05rem;
		margin-bottom: 0.4rem;
	}

	.guide-copy p + p {
		margin-top: 0.75rem;
	}

	.guide-copy ul {
		list-style: disc;
		margin-left: 1.25rem;
		margin-top: 0.5rem;
	}

	.guide-copy li + li {
		margin-top: 0.5rem;
	}

	.guide-copy a {
		color: var(--accent-primary);
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.guide-copy code {
		background: var(--bg-tertiary);
		border-radius: 0.25rem;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.875em;
		overflow-wrap: anywhere;
		padding: 0.125rem 0.375rem;
	}

	.path-tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.9rem;
	}

	.path-tab {
		align-items: center;
		background: transparent;
		border: 1px solid #dbe3ef;
		border-radius: 999px;
		color: var(--text-secondary);
		display: inline-flex;
		font-size: 0.78rem;
		font-weight: 700;
		gap: 0.4rem;
		padding: 0.4rem 0.8rem;
		transition:
			background 150ms ease,
			border-color 150ms ease,
			color 150ms ease;
	}

	.path-tab:hover {
		border-color: #93c5fd;
		color: #2563eb;
	}

	.path-tab.active {
		background: #2563eb;
		border-color: #2563eb;
		color: #ffffff;
	}

	:global(.dark) .path-tab {
		border-color: #263449;
	}

	:global(.dark) .path-tab:hover {
		border-color: #3b82f6;
		color: #93c5fd;
	}

	:global(.dark) .path-tab.active {
		background: #2563eb;
		border-color: #2563eb;
		color: #ffffff;
	}

	.path-panel {
		margin-top: 1rem;
	}

	.code-block {
		align-items: flex-start;
		background: #101827;
		border: 1px solid #1e293b;
		border-radius: 8px;
		display: flex;
		gap: 0.5rem;
		margin-block: 0.75rem;
		padding-right: 0.55rem;
	}

	.code-block pre {
		flex: 1;
		min-width: 0;
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
		padding: 0.9rem 0.5rem 0.9rem 1rem;
	}

	.code-block code {
		background: none;
		color: #e2e8f0;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.8rem;
		line-height: 1.6;
		overflow-wrap: normal;
		padding: 0;
		white-space: pre;
	}

	.code-copy {
		background: #1e293b;
		border: 1px solid #334155;
		border-radius: 6px;
		color: #94a3b8;
		flex: 0 0 auto;
		font-size: 0.7rem;
		font-weight: 700;
		margin-top: 0.55rem;
		padding: 0.3rem 0.7rem;
		transition:
			color 150ms ease,
			border-color 150ms ease;
	}

	.code-copy:hover {
		border-color: #60a5fa;
		color: #bfdbfe;
	}

	@media (max-width: 640px) {
		.step {
			border-left: none;
			padding-left: 0;
		}

		.step-num {
			left: auto;
			position: static;
		}

		.step-head h2 {
			font-size: 1.15rem;
		}

		.code-block code {
			font-size: 0.72rem;
		}
	}
</style>
