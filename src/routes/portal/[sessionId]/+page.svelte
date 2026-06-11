<script lang="ts">
	import { afterNavigate, invalidate } from '$app/navigation';
	import { navigating } from '$app/stores';
	import { fetchAndDecryptArtifactBytes } from '$lib/artifact-bytes';
	import { decryptString, type EncryptedEnvelope } from '$lib/e2ee';
	import { decryptEncryptedSessionMeta } from '$lib/session-detail-decrypt';
	import {
		getSessionDetailCache,
		mergeSessionDetailCache,
		sessionDetailCacheKey
	} from '$lib/session-detail-cache';
	import { isSessionPagePrefetched } from '$lib/session-prefetch';
	import { decryptEmailDraftFields, type DecryptedEmailDraftFields } from '$lib/email-draft-decrypt';
	import {
		emptySessionDetailViewState,
		sessionDetailViewFromCache
	} from '$lib/portal/session-detail-view-state';
	import { buildSessionActivityLines } from '$lib/session-activity';
	import EmailDraftReviewPanel from '$lib/components/portal/EmailDraftReviewPanel.svelte';
	import HtmlArtifactPreview from '$lib/components/portal/HtmlArtifactPreview.svelte';
	import HtmlPreviewOpenInTabButton from '$lib/components/portal/HtmlPreviewOpenInTabButton.svelte';
	import { e2eeConfig, e2eePrivateKey } from '$lib/e2ee-store';
	import { ENSURE_E2EE_UNLOCK_KEY, SESSION_UPDATED_AT_LOOKUP_KEY, type EnsureE2eeUnlock, type SessionUpdatedAtLookup } from '$lib/portal-context';
	import Button from '$lib/components/ui/button/button.svelte';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Download from '@lucide/svelte/icons/download';
	import Maximize2 from '@lucide/svelte/icons/maximize-2';
	import Minimize2 from '@lucide/svelte/icons/minimize-2';
	import FileIcon from '@lucide/svelte/icons/file';
	import FileCode from '@lucide/svelte/icons/file-code';
	import FileImage from '@lucide/svelte/icons/file-image';
	import FileText from '@lucide/svelte/icons/file-text';
	import FileType from '@lucide/svelte/icons/file-type';
	import X from '@lucide/svelte/icons/x';
	import type { PreviewKind } from '$lib/artifacts';
	import { formatBytes, previewKindFor } from '$lib/artifacts';
	import { buildPreviewDoc, toPreviewHtmlDocument } from '$lib/preview-doc';
	import { sanitizePreviewHtml } from '$lib/preview-sanitize';
	import {
		PDF_PREVIEW_SANDBOX,
		PREVIEW_REFERRER_POLICY,
		STRICT_PREVIEW_SANDBOX
	} from '$lib/preview-sandbox';
	import { getContext, onMount } from 'svelte';
	import type { Component } from 'svelte';
	import type { IconProps } from '@lucide/svelte';
	import type { PageData } from './$types';

	type LucideIcon = Component<IconProps>;

	let { data }: { data: PageData } = $props();

	const ensureE2eeUnlocked = getContext<EnsureE2eeUnlock>(ENSURE_E2EE_UNLOCK_KEY);
	const sessionUpdatedAtLookup = getContext<SessionUpdatedAtLookup>(SESSION_UPDATED_AT_LOOKUP_KEY);

	async function ensureUnlockedForEncrypted(): Promise<boolean> {
		if ($e2eePrivateKey) return true;
		return ensureE2eeUnlocked();
	}

	const navigatingToSessionId = $derived($navigating?.to?.params?.sessionId);
	const isSwitchingSession = $derived.by(() => {
		if (!navigatingToSessionId || navigatingToSessionId === data.session.id) return false;
		const targetId = String(navigatingToSessionId);
		const updatedAt = sessionUpdatedAtLookup(targetId);
		return !isSessionPagePrefetched(targetId, updatedAt);
	});

	let activeArtifactId = $state<string | null>(null);
	let previewExpanded = $state(false);
	let previewLoading = $state(false);
	let previewError = $state('');
	let previewFilename = $state('');
	let previewKind = $state<PreviewKind>('none');
	let previewUrl = $state('');
	let previewDoc = $state('');
	let previewSourceDoc = $state('');
	let previewObjectUrl = '';
	let darkMode = $state(false);
	let previewToken = 0;
	let decryptedSession = $state<{ title: string; summary: string | null } | null>(null);
	let decryptedArtifacts = $state<Record<string, { filename: string; contentType: string }>>({});
	let decryptedEmailDraft = $state<DecryptedEmailDraftFields | null>(null);

	const activeEmailDraft = $derived(decryptedEmailDraft);

	const emailDraftNeedsUnlock = $derived(Boolean(data.emailDraft && !decryptedEmailDraft));
	const previewOpen = $derived(activeArtifactId !== null);

	let lastPreviewSessionId = $state<string | null>(null);

	$effect(() => {
		const sessionId = data.session.id;
		if (lastPreviewSessionId !== null && lastPreviewSessionId !== sessionId) {
			closePreview();
		}
		lastPreviewSessionId = sessionId;
	});

	$effect(() => {
		if (!previewSourceDoc) return;
		previewDoc =
			previewKind === 'html'
				? toPreviewHtmlDocument(previewSourceDoc, darkMode)
				: buildPreviewDoc(previewSourceDoc, darkMode);
	});

	function buildPreviewContent(kind: PreviewKind, content: string, dark: boolean): string {
		if (kind === 'html') return toPreviewHtmlDocument(content, dark);
		return buildPreviewDoc(content, dark);
	}

	$effect(() => {
		if (!previewOpen) return;

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;
			if (previewExpanded) {
				previewExpanded = false;
			} else {
				closePreview();
			}
		};
		window.addEventListener('keydown', onKeyDown);

		return () => {
			window.removeEventListener('keydown', onKeyDown);
		};
	});

	$effect(() => {
		if (!previewExpanded) return;

		document.body.style.overflow = 'hidden';

		return () => {
			document.body.style.overflow = '';
		};
	});

	afterNavigate(({ to }) => {
		const sessionId = to?.params?.sessionId;
		if (!sessionId) return;
		queueMicrotask(() => {
			if (data.session.id !== sessionId || data.session.is_read) return;
			void markSessionRead(sessionId);
		});
	});

	$effect(() => {
		const privateKey = $e2eePrivateKey;
		const emailDraft = data.emailDraft;
		const sessionId = data.session.id;
		const sessionUpdatedAt = data.session.updated_at;
		const cacheKey = sessionDetailCacheKey(sessionUpdatedAt, emailDraft?.updated_at ?? null);

		if (!privateKey) {
			const locked = emptySessionDetailViewState();
			decryptedSession = locked.session;
			decryptedArtifacts = locked.artifacts;
			decryptedEmailDraft = locked.emailDraft;
			return;
		}

		const cached = getSessionDetailCache(sessionId, cacheKey);
		const view = sessionDetailViewFromCache(Boolean(emailDraft), cached);
		decryptedSession = view.session;
		decryptedArtifacts = view.artifacts;
		decryptedEmailDraft = view.emailDraft;

		const encryptedArtifacts = data.artifacts.filter(
			(artifact) => artifact.encrypted_filename && artifact.encrypted_content_type
		);
		const artifactsReady = encryptedArtifacts.every((artifact) => cached?.artifacts[artifact.id]);
		const emailDraftReady = !emailDraft || cached?.emailDraft !== undefined;
		if (cached?.session && artifactsReady && emailDraftReady) {
			return;
		}

		let cancelled = false;
		const decryptMetadata = async () => {
			const nextArtifacts: Record<string, { filename: string; contentType: string }> = {
				...(cached?.artifacts ?? {})
			};
			let nextSession: { title: string; summary: string | null } | null = cached?.session ?? null;
			let nextEmailDraft: DecryptedEmailDraftFields | null = cached?.emailDraft ?? null;

			// Session meta, artifact metadata, and the email draft are independent
			// envelopes; decrypt them all concurrently instead of one await at a time.
			const tasks: Promise<void>[] = [];

			if (data.session.encrypted_title && !nextSession) {
				tasks.push(
					(async () => {
						nextSession = await decryptEncryptedSessionMeta(
							data.session.encrypted_title,
							data.session.encrypted_summary,
							privateKey
						);
						if (!nextSession) {
							console.error('[e2ee] detail session decrypt failed');
						}
					})()
				);
			}

			for (const artifact of data.artifacts) {
				if (!artifact.encrypted_filename || !artifact.encrypted_content_type) {
					continue;
				}
				if (nextArtifacts[artifact.id]) continue;
				tasks.push(
					(async () => {
						try {
							const [filename, contentType] = await Promise.all([
								decryptString(
									artifact.encrypted_filename as unknown as EncryptedEnvelope,
									privateKey
								),
								decryptString(
									artifact.encrypted_content_type as unknown as EncryptedEnvelope,
									privateKey
								)
							]);
							nextArtifacts[artifact.id] = { filename, contentType };
						} catch (err) {
							console.error('[e2ee] artifact metadata decrypt failed:', err);
						}
					})()
				);
			}

			if (emailDraft && cached?.emailDraft === undefined) {
				tasks.push(
					(async () => {
						nextEmailDraft = await decryptEmailDraftFields(emailDraft, privateKey);
					})()
				);
			}

			await Promise.all(tasks);

			if (!cancelled) {
				decryptedSession = nextSession;
				decryptedArtifacts = nextArtifacts;
				decryptedEmailDraft = nextEmailDraft;
				mergeSessionDetailCache(sessionId, cacheKey, {
					session: nextSession,
					artifacts: nextArtifacts,
					artifactIds: data.artifacts.map((artifact) => artifact.id),
					emailDraft: nextEmailDraft
				});
			}
		};
		void decryptMetadata();
		return () => {
			cancelled = true;
		};
	});

	const sessionTitle = $derived(decryptedSession?.title ?? 'Encrypted delivery');
	const sessionSummary = $derived(
		decryptedSession?.summary ?? 'Unlock encryption to view this delivery.'
	);

	const activityLines = $derived(
		buildSessionActivityLines({
			sessionCreatedAt: data.session.created_at,
			artifacts: data.artifacts.map((artifact) => ({
				id: artifact.id,
				filename: artifactFilename(artifact)
			})),
			emailDraftCreatedAt: data.emailDraft?.created_at ?? null
		})
	);

	function artifactFilename(artifact: PageData['artifacts'][number]): string {
		return decryptedArtifacts[artifact.id]?.filename ?? 'Encrypted file';
	}

	function artifactContentType(artifact: PageData['artifacts'][number]): string {
		return decryptedArtifacts[artifact.id]?.contentType ?? 'application/octet-stream';
	}

	function artifactPreviewKind(artifact: PageData['artifacts'][number]): PreviewKind {
		const meta = decryptedArtifacts[artifact.id];
		if (!meta) return 'none';
		return previewKindFor(meta.filename, meta.contentType);
	}

	type EncryptedArtifactMetaResult =
		| { ok: true; filename: string; contentType: string; kind: PreviewKind }
		| { ok: false; reason: 'locked' | 'missing' | 'decrypt' };

	async function resolveEncryptedArtifactMeta(
		artifact: PageData['artifacts'][number]
	): Promise<EncryptedArtifactMetaResult> {
		const cached = decryptedArtifacts[artifact.id];
		if (cached) {
			return {
				ok: true,
				filename: cached.filename,
				contentType: cached.contentType,
				kind: previewKindFor(cached.filename, cached.contentType)
			};
		}

		const privateKey = $e2eePrivateKey;
		if (!privateKey) return { ok: false, reason: 'locked' };
		if (!artifact.encrypted_filename || !artifact.encrypted_content_type) {
			return { ok: false, reason: 'missing' };
		}

		try {
			const [filename, contentType] = await Promise.all([
				decryptString(artifact.encrypted_filename as unknown as EncryptedEnvelope, privateKey),
				decryptString(artifact.encrypted_content_type as unknown as EncryptedEnvelope, privateKey)
			]);
			decryptedArtifacts = {
				...decryptedArtifacts,
				[artifact.id]: { filename, contentType }
			};
			return {
				ok: true,
				filename,
				contentType,
				kind: previewKindFor(filename, contentType)
			};
		} catch (err) {
			console.error('[e2ee] artifact metadata resolve failed:', err);
			return { ok: false, reason: 'decrypt' };
		}
	}

	function encryptedArtifactMetaError(
		result: Extract<EncryptedArtifactMetaResult, { ok: false }>
	): string {
		switch (result.reason) {
			case 'locked':
				return 'Unlock encryption to view this file.';
			case 'missing':
				return 'Encrypted file metadata is incomplete. Ask the agent to resend using the reference upload script.';
			case 'decrypt':
				return 'Could not decrypt file metadata. The agent may have used an incompatible encryption implementation — resend with scripts/e2ee-agent-upload.mjs.';
		}
	}

	onMount(() => {
		const updateTheme = () => {
			darkMode = document.documentElement.classList.contains('dark');
		};
		updateTheme();

		const observer = new MutationObserver(updateTheme);
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

		return () => observer.disconnect();
	});

	function iconFor(kind: PreviewKind): { icon: LucideIcon; color: string } {
		switch (kind) {
			case 'image':
				return { icon: FileImage, color: 'text-purple-500' };
			case 'html':
				return { icon: FileCode, color: 'text-orange-500' };
			case 'pdf':
				return { icon: FileType, color: 'text-red-500' };
			case 'markdown':
			case 'text':
				return { icon: FileText, color: 'text-slate-500 dark:text-slate-400' };
			default:
				return { icon: FileIcon, color: 'text-slate-400 dark:text-slate-500' };
		}
	}

	function formatDate(iso: string | Date): string {
		return new Date(iso).toLocaleString();
	}

	async function decryptArtifactBytes(artifact: PageData['artifacts'][number]): Promise<Uint8Array> {
		const privateKey = $e2eePrivateKey;
		if (!privateKey) throw new Error('Unlock encryption first');
		return fetchAndDecryptArtifactBytes(artifact, privateKey);
	}

	async function downloadArtifactRecord(artifact: PageData['artifacts'][number]) {
		if (!(await ensureUnlockedForEncrypted())) return;

		try {
			const meta = await resolveEncryptedArtifactMeta(artifact);
			if (!meta.ok) {
				alert(encryptedArtifactMetaError(meta));
				return;
			}
			const filename = meta.filename;
			const contentType = meta.contentType;
			const plaintext = await decryptArtifactBytes(artifact);
			const url = URL.createObjectURL(new Blob([plaintext as Uint8Array<ArrayBuffer>], { type: contentType }));
			const link = document.createElement('a');
			link.href = url;
			link.download = filename;
			document.body.appendChild(link);
			link.click();
			link.remove();
			URL.revokeObjectURL(url);
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Could not decrypt file');
		}
	}

	async function markSessionRead(id: string) {
		try {
			const res = await fetch(`/api/sessions/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ is_read: true })
			});
			if (!res.ok) throw new Error('Mark read failed');
			await Promise.all([invalidate('inbox:sessions'), invalidate('inbox:session')]);
		} catch (err) {
			console.error('[sessions] mark read failed:', err);
		}
	}

	async function previewArtifact(artifact: PageData['artifacts'][number]) {
		if (!(await ensureUnlockedForEncrypted())) return;

		if (activeArtifactId === artifact.id && previewOpen && !previewLoading) {
			closePreview();
			return;
		}

		const meta = await resolveEncryptedArtifactMeta(artifact);
		if (!meta.ok) {
			previewError = encryptedArtifactMetaError(meta);
			activeArtifactId = artifact.id;
			previewExpanded = false;
			return;
		}

		const { filename, contentType, kind } = meta;

		if (kind === 'none') {
			await downloadArtifactRecord(artifact);
			return;
		}

		previewToken++;
		activeArtifactId = artifact.id;
		previewExpanded = false;
		previewFilename = filename;
		previewKind = kind;
		previewUrl = '';
		previewDoc = '';
		previewSourceDoc = '';
		previewError = '';
		previewLoading = true;

		try {
			const bytes = await decryptArtifactBytes(artifact);
			if (kind === 'markdown' || kind === 'text' || kind === 'html') {
				const text = new TextDecoder().decode(bytes);
				const content =
					kind === 'markdown'
						? sanitizePreviewHtml(await renderMarkdown(text))
						: kind === 'text'
							? `<pre>${escapeHtml(text)}</pre>`
							: text;
				previewSourceDoc = content;
				previewDoc = buildPreviewContent(kind, content, darkMode);
			} else {
				previewObjectUrl = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: contentType }));
				previewUrl = previewObjectUrl;
			}
		} catch (err) {
			previewError = err instanceof Error ? err.message : 'Could not decrypt preview';
		} finally {
			previewLoading = false;
		}
	}

	function closePreview() {
		previewToken++;
		activeArtifactId = null;
		previewExpanded = false;
		previewLoading = false;
		previewUrl = '';
		previewDoc = '';
		previewSourceDoc = '';
		previewError = '';
		previewFilename = '';
		previewKind = 'none';
		if (previewObjectUrl) {
			URL.revokeObjectURL(previewObjectUrl);
			previewObjectUrl = '';
		}
	}

	function escapeHtml(value: string): string {
		return value
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;');
	}

	// marked is only needed for markdown previews; loading it on demand keeps
	// it out of the session page bundle.
	async function renderMarkdown(text: string): Promise<string> {
		const { marked } = await import('marked');
		return marked.parse(text, { gfm: true, breaks: true });
	}
</script>

<svelte:head>
	<title>{sessionTitle} — Agent Relay</title>
</svelte:head>

{#snippet artifactPreviewBody()}
	{#if previewLoading}
		<div
			class="flex h-full w-full items-center justify-center text-sm text-slate-500 dark:text-slate-400"
		>
			Loading preview…
		</div>
	{:else if previewError}
		<div
			class="flex h-full w-full items-center justify-center px-4 text-center text-sm text-red-600 dark:text-red-400"
		>
			{previewError}
		</div>
	{:else if previewKind === 'image' && previewUrl}
		<div class="flex h-full w-full items-center justify-center bg-slate-50 p-4 dark:bg-slate-900">
			<img src={previewUrl} alt={previewFilename} class="max-h-full max-w-full object-contain" />
		</div>
	{:else if previewKind === 'pdf' && previewUrl}
		<iframe
			src={previewUrl}
			title={previewFilename}
			sandbox={PDF_PREVIEW_SANDBOX}
			referrerpolicy={PREVIEW_REFERRER_POLICY}
			class="h-full w-full border-0"
		></iframe>
	{:else if previewKind === 'html' && previewDoc}
		<HtmlArtifactPreview
			sourceHtml={previewSourceDoc}
			{previewDoc}
			title={previewFilename}
			class="h-full"
			hideNotice={previewExpanded}
		/>
	{:else if (previewKind === 'markdown' || previewKind === 'text') && previewDoc}
		<iframe
			srcdoc={previewDoc}
			title={previewFilename}
			sandbox={STRICT_PREVIEW_SANDBOX}
			referrerpolicy={PREVIEW_REFERRER_POLICY}
			class="h-full w-full border-0"
		></iframe>
	{/if}
{/snippet}

<div
	class="min-h-full w-full bg-white transition-opacity duration-150 dark:bg-slate-950 sm:bg-transparent"
	class:opacity-50={isSwitchingSession}
>
	<div class="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-slate-100 bg-white px-2 dark:border-slate-800 dark:bg-slate-950 sm:hidden">
		<a
			href="/portal"
			class="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
			aria-label="Back to sessions"
		>
			<ArrowLeft class="h-5 w-5" />
		</a>
		<div class="min-w-0">
			<p class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{sessionTitle}</p>
			<p class="text-xs text-slate-500 dark:text-slate-400">Sessions</p>
		</div>
	</div>

	<div
		class="border-b border-slate-100 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:mb-6 sm:rounded-xl sm:border sm:p-6 sm:shadow-[0_4px_20px_rgba(0,0,0,0.04)] sm:dark:shadow-none"
	>
		<h1 class="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-slate-100">{sessionTitle}</h1>
		<p class="text-xs sm:text-sm text-slate-500 mt-1 dark:text-slate-400">
			Updated {formatDate(data.session.updated_at)}
		</p>
		{#if sessionSummary}
			<p class="text-sm text-slate-700 mt-3 whitespace-pre-wrap dark:text-slate-300">{sessionSummary}</p>
		{/if}
	</div>

	{#if data.emailDraft}
		<EmailDraftReviewPanel
			emailDraft={data.emailDraft}
			{activeEmailDraft}
			{emailDraftNeedsUnlock}
			cloudflareEmailConfigured={data.cloudflareEmailConfigured}
			sessionId={data.session.id}
			{darkMode}
			e2eeConfigured={$e2eeConfig.configured}
			onUnlock={ensureE2eeUnlocked}
		/>
	{:else}
		<div
			class="bg-white p-4 dark:bg-slate-900 sm:rounded-xl sm:border sm:border-slate-100 sm:p-6 sm:shadow-[0_4px_20px_rgba(0,0,0,0.04)] sm:dark:border-slate-800 sm:dark:shadow-none"
		>
			{#if data.artifacts.length === 0}
				<h2 class="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
					Delivered files
				</h2>
				<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">No files in this session yet.</p>
			{:else}
				<section aria-labelledby="delivered-files-heading">
					<h2
						id="delivered-files-heading"
						class="text-sm font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400"
					>
						Delivered files
					</h2>
					<ul
						class="mt-2 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-slate-50/70 dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-950/50"
						role="listbox"
						aria-label="Delivered files"
					>
						{#each data.artifacts as artifact (artifact.id)}
							{@const filename = artifactFilename(artifact)}
							{@const contentType = artifactContentType(artifact)}
							{@const kind = artifactPreviewKind(artifact)}
							{@const meta = iconFor(kind)}
							{@const isSelected = activeArtifactId === artifact.id}
							<li>
								<div
									class="flex items-center gap-2 {isSelected
										? 'bg-white dark:bg-slate-900'
										: ''}"
								>
									<button
										type="button"
										role="option"
										aria-selected={isSelected}
										class="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-white/80 dark:hover:bg-slate-900/80 {isSelected
											? 'text-slate-900 dark:text-slate-100'
											: 'text-slate-700 dark:text-slate-300'}"
										onclick={() => previewArtifact(artifact)}
									>
										<meta.icon class="h-4 w-4 shrink-0 {meta.color}" />
										<span class="min-w-0 flex-1 truncate font-medium" title={filename}>
											{filename}
										</span>
										{#if isSelected}
											<span
												class="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-[#2563eb] dark:bg-blue-950/60 dark:text-blue-300"
											>
												Selected
											</span>
										{:else}
											<span class="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">
												{formatBytes(Number(artifact.size_bytes))}
											</span>
										{/if}
									</button>
									<Button
										variant="ghost"
										size="icon"
										class="mr-1 shrink-0"
										title="Download {filename}"
										aria-label="Download {filename}"
										onclick={() => downloadArtifactRecord(artifact)}
									>
										<Download class="h-4 w-4" />
									</Button>
								</div>
								{#if isSelected}
									<p class="border-t border-slate-100 px-3 py-1 text-[11px] text-slate-400 dark:border-slate-800 dark:text-slate-500">
										{formatBytes(Number(artifact.size_bytes))} · {contentType}
									</p>
								{/if}
							</li>
						{/each}
					</ul>
				</section>

				{#if previewOpen}
					{@const activeArtifact = data.artifacts.find((artifact) => artifact.id === activeArtifactId)}
					<section class="mt-6" aria-labelledby="file-preview-heading">
						<div class="mb-3 flex items-start justify-between gap-3">
							<div class="min-w-0">
								<h3
									id="file-preview-heading"
									class="text-sm font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400"
								>
									Preview
								</h3>
								<p
									class="mt-1 truncate text-lg font-semibold text-slate-900 dark:text-slate-100"
									title={previewFilename}
								>
									{previewFilename || 'File'}
								</p>
							</div>
							<div class="flex shrink-0 items-center gap-1">
								{#if !previewLoading && !previewError}
									{#if previewKind === 'html' && previewSourceDoc}
										<HtmlPreviewOpenInTabButton sourceHtml={previewSourceDoc} />
									{/if}
									<Button
										variant="ghost"
										size="icon"
										title="Expand preview"
										aria-label="Expand preview"
										onclick={() => {
											previewExpanded = true;
										}}
									>
										<Maximize2 class="h-4 w-4" />
									</Button>
									{#if activeArtifact}
										<Button
											variant="ghost"
											size="icon"
											title="Download"
											aria-label="Download file"
											onclick={() => downloadArtifactRecord(activeArtifact)}
										>
											<Download class="h-4 w-4" />
										</Button>
									{/if}
								{/if}
								<Button
									variant="ghost"
									size="icon"
									title="Close preview"
									aria-label="Close preview"
									onclick={closePreview}
								>
									<X class="h-4 w-4" />
								</Button>
							</div>
						</div>
						<div
							class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-950 dark:shadow-none"
						>
							<div class="h-[min(72vh,44rem)] min-h-[24rem]">
								{@render artifactPreviewBody()}
							</div>
						</div>
					</section>
				{/if}
			{/if}
		</div>
	{/if}

	<section
		class="mt-4 bg-white p-4 dark:bg-slate-900 sm:mt-6 sm:rounded-xl sm:border sm:border-slate-100 sm:p-5 sm:shadow-[0_4px_20px_rgba(0,0,0,0.03)] sm:dark:border-slate-800 sm:dark:shadow-none"
		aria-labelledby="session-activity-heading"
	>
		<h2
			id="session-activity-heading"
			class="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400"
		>
			Activity
		</h2>
		<ul class="mt-2 space-y-1">
			{#each activityLines as line (line.key)}
				<li class="text-[13px] leading-5 text-slate-600 dark:text-slate-400">
					<span class="text-slate-700 dark:text-slate-300">{line.label}</span>
					<span class="text-slate-300 dark:text-slate-600"> · </span>
					<span>{line.detail}</span>
				</li>
			{/each}
		</ul>
	</section>
</div>

{#if previewOpen && previewExpanded}
	<div class="fixed inset-0 z-[100] bg-white dark:bg-slate-950">
		<div
			class="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900 sm:px-4"
		>
			<p class="min-w-0 truncate text-sm font-medium text-slate-900 dark:text-slate-100">
				{previewFilename || 'File preview'}
			</p>
			<div class="flex shrink-0 items-center gap-1">
				{#if previewKind === 'html' && previewSourceDoc}
					<HtmlPreviewOpenInTabButton sourceHtml={previewSourceDoc} />
				{/if}
				{#if !previewLoading && !previewError}
					{@const activeArtifact = data.artifacts.find((artifact) => artifact.id === activeArtifactId)}
					{#if activeArtifact}
						<Button
							variant="ghost"
							size="icon"
							title="Download"
							aria-label="Download file"
							onclick={() => downloadArtifactRecord(activeArtifact)}
						>
							<Download class="h-4 w-4" />
						</Button>
					{/if}
				{/if}
				<Button
					variant="ghost"
					size="icon"
					title="Exit fullscreen"
					aria-label="Exit fullscreen"
					onclick={() => {
						previewExpanded = false;
					}}
				>
					<Minimize2 class="h-4 w-4" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					title="Close preview"
					aria-label="Close preview"
					onclick={closePreview}
				>
					<X class="h-4 w-4" />
				</Button>
			</div>
		</div>

		<div class="flex h-[calc(100dvh-3rem)] min-h-0 flex-col bg-slate-50 dark:bg-slate-950">
			{@render artifactPreviewBody()}
		</div>
	</div>
{/if}
