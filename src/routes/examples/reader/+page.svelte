<script lang="ts">
	// Worked example: a minimal custom inbox reader built on @arelay/client.
	// Everything below runs in the browser — unlock the private key, then fetch
	// and decrypt. Decryption never touches the server. Same-origin only: it
	// relies on the portal session cookie, so sign in to the portal first.
	import {
		ArelayReader,
		type DecryptedArtifact,
		type DecryptedSession
	} from '@arelay/client';

	const reader = new ArelayReader(); // same-origin (baseUrl: '')

	let recoveryKey = $state('');
	let unlocked = $state(false);
	let status = $state('');
	let error = $state('');
	let sessions = $state<DecryptedSession[]>([]);
	let selected = $state<{ session: DecryptedSession; artifacts: DecryptedArtifact[] } | null>(null);
	let preview = $state('');

	async function run(label: string, fn: () => Promise<void>) {
		error = '';
		status = label;
		try {
			await fn();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			status = '';
		}
	}

	const unlockRecovery = () =>
		run('Unlocking…', async () => {
			await reader.unlockWithRecoveryKey(recoveryKey);
			unlocked = reader.unlocked;
			await refresh();
		});

	const unlockPasskey = () =>
		run('Waiting for passkey…', async () => {
			await reader.unlockWithPasskey();
			unlocked = reader.unlocked;
			await refresh();
		});

	const refresh = () =>
		run('Loading inbox…', async () => {
			sessions = await reader.listSessions();
		});

	const open = (id: string) =>
		run('Decrypting session…', async () => {
			selected = await reader.getSession(id);
			preview = '';
		});

	const view = (artifact: DecryptedArtifact) =>
		run('Decrypting artifact…', async () => {
			const bytes = await reader.getArtifactBytes(artifact);
			preview = (artifact.contentType ?? '').startsWith('text/')
				? new TextDecoder().decode(bytes)
				: `(${bytes.byteLength} bytes of ${artifact.contentType ?? 'binary'})`;
		});
</script>

<main style="max-width: 52rem; margin: 2rem auto; font-family: system-ui; line-height: 1.5;">
	<h1>@arelay/client reader — example</h1>
	<p>Dev-only demo of building a custom inbox frontend. Sign in to the portal first (same-origin).</p>

	{#if !unlocked}
		<section>
			<input
				type="password"
				placeholder="Recovery key (XXXX-XXXX-…)"
				bind:value={recoveryKey}
				style="width: 24rem; padding: 0.4rem;"
			/>
			<button onclick={unlockRecovery} disabled={!recoveryKey}>Unlock with recovery key</button>
			<button onclick={unlockPasskey}>Unlock with passkey</button>
		</section>
	{:else}
		<button onclick={refresh}>Refresh inbox</button>
	{/if}

	{#if status}<p>{status}</p>{/if}
	{#if error}<p style="color: #b00;">⚠ {error}</p>{/if}

	{#if unlocked}
		<div style="display: flex; gap: 2rem; margin-top: 1rem;">
			<ul style="flex: 1; list-style: none; padding: 0;">
				{#each sessions as s (s.id)}
					<li>
						<button onclick={() => open(s.id)} style="text-align: left; width: 100%;">
							<strong>{s.title ?? '(undecryptable)'}</strong>
							{#if !s.isRead}<em> · unread</em>{/if}
							<br /><small>{s.summary ?? ''}</small>
						</button>
					</li>
				{:else}
					<li><em>No sessions.</em></li>
				{/each}
			</ul>

			{#if selected}
				<div style="flex: 1;">
					<h2>{selected.session.title}</h2>
					<ul style="list-style: none; padding: 0;">
						{#each selected.artifacts as a (a.id)}
							<li>
								<button onclick={() => view(a)}>{a.filename ?? a.id}</button>
								<small> · {a.contentType ?? '?'} · {a.sizeBytes} bytes</small>
							</li>
						{/each}
					</ul>
					{#if preview}
						<pre style="white-space: pre-wrap; background: #f4f4f4; padding: 1rem;">{preview}</pre>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</main>
