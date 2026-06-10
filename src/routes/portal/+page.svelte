<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Agent Relay</title>
</svelte:head>

<div class="hidden h-full sm:flex sm:items-center sm:justify-center">
	{#if data.sessions.length === 0}
		<div class="max-w-lg rounded-xl border border-slate-100 bg-white p-8 shadow-[0_4px_20px_rgba(0,0,0,0.04)] dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
			<h1 class="text-xl font-semibold text-slate-900 dark:text-slate-100">No deliveries yet</h1>
			<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
				When an AI agent posts encrypted artifacts, they will appear here as sessions.
			</p>
			<div class="mt-6 space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-4 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
				<p class="font-medium text-slate-700 dark:text-slate-200">Agent API (E2EE required)</p>
				<pre class="overflow-x-auto whitespace-pre-wrap break-all">GET /api/agent/e2ee/config
Authorization: Bearer $AGENT_API_TOKEN

POST /api/agent/sessions
&#123; "encrypted": true, "encrypted_title": &#123;...&#125; &#125;

POST /api/agent/sessions/&lt;id&gt;/artifacts
&#123; "encrypted": true, "ciphertext_base64": "...", ... &#125;</pre>
				<p class="text-slate-500 dark:text-slate-400">
					Use the agent-relay upload script. Plaintext delivery returns 400; missing E2EE setup returns 428.
				</p>
			</div>
		</div>
	{:else}
		<div class="max-w-md text-center">
			<h1 class="text-xl font-semibold text-slate-900 dark:text-slate-100">Select a delivery</h1>
			<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
				Choose a session from the list to preview artifacts and download files.
			</p>
		</div>
	{/if}
</div>
