<script lang="ts">
	import { afterNavigate, invalidate } from '$app/navigation';
	import { navigating } from '$app/stores';
	import { fetchAndDecryptArtifactBytes } from '$lib/artifact-bytes';
	import { decryptString, type EncryptedEnvelope } from '$lib/e2ee';
	import {
		getSessionDetailCache,
		mergeSessionDetailCache,
		sessionDetailCacheKey
	} from '$lib/session-detail-cache';
	import { isSessionPagePrefetched } from '$lib/session-prefetch';
	import { decryptEmailDraftFields, type DecryptedEmailDraftFields } from '$lib/email-draft-decrypt';
	import EmailDraftReviewPanel from '$lib/components/portal/EmailDraftReviewPanel.svelte';
	import { e2eeConfig, e2eePrivateKey } from '$lib/e2ee-store';
	import { ENSURE_E2EE_UNLOCK_KEY, SESSION_UPDATED_AT_LOOKUP_KEY, type EnsureE2eeUnlock, type SessionUpdatedAtLookup } from '$lib/portal-context';
	import Button from '$lib/components/ui/button/button.svelte';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Download from '@lucide/svelte/icons/download';
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
		HTML_ARTIFACT_PREVIEW_SANDBOX,
		HTML_PREVIEW_REFERRER_POLICY,
		STRICT_PREVIEW_SANDBOX
	} from '$lib/preview-sandbox';
	import { getContext, onMount } from 'svelte';
	import type { Component } from 'svelte';
	import type { IconProps } from '@lucide/svelte';
	import type { PageData } from './$types';

	type LucideIcon = Component<IconProps>;
	import { marked } from 'marked';

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

	let previewOpen = $state(false);
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

		document.body.style.overflow = 'hidden';

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') closePreview();
		};
		window.addEventListener('keydown', onKeyDown);

		return () => {
			document.body.style.overflow = '';
			window.removeEventListener('keydown', onKeyDown);
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
		const cached = privateKey ? getSessionDetailCache(sessionId, cacheKey) : null;

		if (cached?.session) {
			decryptedSession = cached.session;
		}
		if (cached?.artifacts && Object.keys(cached.artifacts).length > 0) {
			decryptedArtifacts = cached.artifacts;
		}
		if (cached && cached.emailDraft !== undefined) {
			decryptedEmailDraft = cached.emailDraft;
		}

		if (!privateKey) {
			decryptedSession = null;
			decryptedArtifacts = {};
			decryptedEmailDraft = null;
			return;
		}

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

			if (data.session.encrypted_title && !nextSession) {
				try {
					const title = await decryptString(
						data.session.encrypted_title as unknown as EncryptedEnvelope,
						privateKey
					);
					const summary = data.session.encrypted_summary
						? await decryptString(
								data.session.encrypted_summary as unknown as EncryptedEnvelope,
								privateKey
							)
						: null;
					nextSession = { title, summary };
				} catch (err) {
					console.error('[e2ee] detail session decrypt failed:', err);
				}
			}

			for (const artifact of data.artifacts) {
				if (!artifact.encrypted_filename || !artifact.encrypted_content_type) {
					continue;
				}
				if (nextArtifacts[artifact.id]) continue;
				try {
					nextArtifacts[artifact.id] = {
						filename: await decryptString(
							artifact.encrypted_filename as unknown as EncryptedEnvelope,
							privateKey
						),
						contentType: await decryptString(
							artifact.encrypted_content_type as unknown as EncryptedEnvelope,
							privateKey
						)
					};
				} catch (err) {
					console.error('[e2ee] artifact metadata decrypt failed:', err);
				}
			}

			let nextEmailDraft: DecryptedEmailDraftFields | null = cached?.emailDraft ?? null;
			if (emailDraft && cached?.emailDraft === undefined) {
				nextEmailDraft = await decryptEmailDraftFields(emailDraft, privateKey);
			}

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

	function artifactFilename(artifact: PageData['artifacts'][number]): string {
		return decryptedArtifacts[artifact.id]?.filename ?? 'Encrypted artifact';
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
			const filename = await decryptString(
				artifact.encrypted_filename as unknown as EncryptedEnvelope,
				privateKey
			);
			const contentType = await decryptString(
				artifact.encrypted_content_type as unknown as EncryptedEnvelope,
				privateKey
			);
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
				return 'Unlock encryption to view this artifact.';
			case 'missing':
				return 'Encrypted artifact metadata is incomplete. Ask the agent to resend using the reference upload script.';
			case 'decrypt':
				return 'Could not decrypt artifact metadata. The agent may have used an incompatible encryption implementation — resend with scripts/e2ee-agent-upload.mjs.';
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
			const url = URL.createObjectURL(new Blob([bytesToArrayBuffer(plaintext)], { type: contentType }));
			const link = document.createElement('a');
			link.href = url;
			link.download = filename;
			document.body.appendChild(link);
			link.click();
			link.remove();
			URL.revokeObjectURL(url);
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Could not decrypt artifact');
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

		const meta = await resolveEncryptedArtifactMeta(artifact);
		if (!meta.ok) {
			previewError = encryptedArtifactMetaError(meta);
			previewOpen = true;
			return;
		}

		const { filename, contentType, kind } = meta;

		if (kind === 'none') {
			await downloadArtifactRecord(artifact);
			return;
		}

		previewToken++;
		previewFilename = filename;
		previewKind = kind;
		previewUrl = '';
		previewDoc = '';
		previewSourceDoc = '';
		previewError = '';
		previewLoading = true;
		previewOpen = true;

		try {
			const bytes = await decryptArtifactBytes(artifact);
			if (kind === 'markdown' || kind === 'text' || kind === 'html') {
				const text = new TextDecoder().decode(bytes);
				const content =
					kind === 'markdown'
						? sanitizePreviewHtml(await marked.parse(text, { gfm: true, breaks: true }))
						: kind === 'text'
							? `<pre>${escapeHtml(text)}</pre>`
							: text;
				previewSourceDoc = content;
				previewDoc = buildPreviewContent(kind, content, darkMode);
			} else {
				previewObjectUrl = URL.createObjectURL(new Blob([bytesToArrayBuffer(bytes)], { type: contentType }));
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
		previewOpen = false;
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

	function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
		return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
	}
</script>

<svelte:head>
	<title>{sessionTitle} — Agent Relay</title>
</svelte:head>

<div
	class="min-h-full w-full bg-white transition-opacity duration-150 dark:bg-slate-950 sm:bg-transparent"
	class:opacity-50={isSwitchingSession}
>
	<div class="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-slate-100 bg-white px-2 dark:border-slate-800 dark:bg-slate-950 sm:hidden">
		<a
			href="/portal"
			class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
			aria-label="Back to inbox"
		>
			<ArrowLeft class="h-5 w-5" />
		</a>
		<div class="min-w-0">
			<p class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{sessionTitle}</p>
			<p class="text-xs text-slate-500 dark:text-slate-400">Inbox</p>
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
			<div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
				<div>
					<h2 class="text-base sm:text-lg font-semibold text-slate-900 mb-1 dark:text-slate-100">Artifacts</h2>
					<p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
						Click an artifact to preview. Use download for a single file.
					</p>
				</div>
			</div>

			{#if data.artifacts.length === 0}
				<p class="text-sm text-slate-500 dark:text-slate-400">No artifacts in this session yet.</p>
			{:else}
				<div class="space-y-3">
					{#each data.artifacts as artifact (artifact.id)}
						{@const filename = artifactFilename(artifact)}
						{@const contentType = artifactContentType(artifact)}
						{@const kind = artifactPreviewKind(artifact)}
						{@const meta = iconFor(kind)}
						<div
							class="flex items-start justify-between gap-3 overflow-hidden rounded-xl border border-slate-100 bg-white transition-colors hover:border-slate-200 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700"
						>
							<button
								type="button"
								class="flex items-start gap-3 min-w-0 flex-1 p-3 sm:p-4 text-left cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-900/70"
								onclick={() => previewArtifact(artifact)}
							>
								<meta.icon class="h-5 w-5 shrink-0 mt-0.5 {meta.color}" />
								<div class="min-w-0">
									<p class="text-sm font-medium text-slate-900 truncate dark:text-slate-100" title={filename}>
										{filename}
									</p>
									<p class="text-xs text-slate-500 mt-1 dark:text-slate-400">
										{formatBytes(Number(artifact.size_bytes))} · {contentType}
									</p>
								</div>
							</button>
							<div class="p-2 sm:p-3 shrink-0">
								<Button
									variant="ghost"
									size="icon"
									title="Download"
									onclick={() => downloadArtifactRecord(artifact)}
								>
									<Download class="h-4 w-4" />
								</Button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>

{#if previewOpen}
	<div class="fixed inset-0 z-[100] bg-white dark:bg-slate-950">
		<button
			type="button"
			onclick={closePreview}
			title="Close preview"
			aria-label="Close preview"
			class="absolute right-3 top-3 z-[101] inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-700 shadow-sm backdrop-blur transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-200 dark:hover:bg-slate-800"
		>
			<X class="h-4 w-4" />
		</button>

		<div class="flex h-full min-h-0 flex-col bg-slate-50 dark:bg-slate-950">
			{#if previewLoading}
				<div class="h-full w-full flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
					Loading preview…
				</div>
			{:else if previewError}
				<div
					class="h-full w-full flex items-center justify-center text-sm text-red-600 px-4 text-center"
				>
					{previewError}
				</div>
			{:else if previewKind === 'image' && previewUrl}
				<div class="h-full w-full flex items-center justify-center p-4 bg-white dark:bg-slate-950">
					<img src={previewUrl} alt={previewFilename} class="max-h-full max-w-full object-contain" />
				</div>
			{:else if previewKind === 'pdf' && previewUrl}
				<iframe
					src={previewUrl}
					title={previewFilename}
					sandbox={PDF_PREVIEW_SANDBOX}
					referrerpolicy={PREVIEW_REFERRER_POLICY}
					class="h-full w-full border-0 bg-white dark:bg-slate-950"
				></iframe>
			{:else if previewKind === 'html' && previewDoc}
				<iframe
					srcdoc={previewDoc}
					title={previewFilename}
					sandbox={HTML_ARTIFACT_PREVIEW_SANDBOX}
					referrerpolicy={HTML_PREVIEW_REFERRER_POLICY}
					class="min-h-0 flex-1 w-full border-0 bg-white dark:bg-slate-950"
				></iframe>
			{:else if (previewKind === 'markdown' || previewKind === 'text') && previewDoc}
				<iframe
					srcdoc={previewDoc}
					title={previewFilename}
					sandbox={STRICT_PREVIEW_SANDBOX}
					referrerpolicy={PREVIEW_REFERRER_POLICY}
					class="min-h-0 flex-1 w-full border-0 bg-white dark:bg-slate-950"
				></iframe>
			{/if}
		</div>
	</div>
{/if}
