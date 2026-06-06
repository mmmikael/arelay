<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { navigating } from '$app/stores';
	import {
		decryptBytes,
		decryptString,
		payloadToEnvelope,
		type EncryptedEnvelope,
		type EncryptedPayload
	} from '$lib/e2ee';
	import { decryptEmailDraftFields, type DecryptedEmailDraftFields } from '$lib/email-draft-decrypt';
	import EmailDraftReviewPanel from '$lib/components/portal/EmailDraftReviewPanel.svelte';
	import { e2eeConfig, e2eePrivateKey } from '$lib/e2ee-store';
	import { ENSURE_E2EE_UNLOCK_KEY, type EnsureE2eeUnlock } from '$lib/portal-context';
	import Button from '$lib/components/ui/button/button.svelte';
	import Archive from '@lucide/svelte/icons/archive';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Download from '@lucide/svelte/icons/download';
	import FileIcon from '@lucide/svelte/icons/file';
	import FileCode from '@lucide/svelte/icons/file-code';
	import FileImage from '@lucide/svelte/icons/file-image';
	import FileText from '@lucide/svelte/icons/file-text';
	import FileType from '@lucide/svelte/icons/file-type';
	import Maximize2 from '@lucide/svelte/icons/maximize-2';
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
	import { marked } from 'marked';

	let { data }: { data: PageData } = $props();

	const ensureE2eeUnlocked = getContext<EnsureE2eeUnlock>(ENSURE_E2EE_UNLOCK_KEY);

	function deliveryNeedsUnlock(
		session: PageData['session'],
		artifact?: PageData['artifacts'][number]
	): boolean {
		if (session.encryption_version === 'e2ee-v1') return true;
		if (data.emailDraft?.encryption_version === 'e2ee-v1') return true;
		return artifact?.encryption_version === 'e2ee-v1';
	}

	async function ensureUnlockedForEncrypted(
		artifact?: PageData['artifacts'][number]
	): Promise<boolean> {
		if ($e2eePrivateKey || !deliveryNeedsUnlock(data.session, artifact)) return true;
		if (!$e2eeConfig.configured) return false;
		return ensureE2eeUnlocked();
	}

	const isSwitchingSession = $derived(
		Boolean($navigating?.to?.params?.sessionId) &&
			$navigating?.to?.params?.sessionId !== data.session.id
	);

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
	let lastReadMarkSessionId = $state<string | null>(null);
	let decryptedSession = $state<{ title: string; summary: string | null } | null>(null);
	let decryptedArtifacts = $state<Record<string, { filename: string; contentType: string }>>({});
	let decryptedEmailDraft = $state<DecryptedEmailDraftFields | null>(null);

	const activeEmailDraft = $derived(
		data.emailDraft?.encryption_version === 'e2ee-v1'
			? decryptedEmailDraft
			: data.emailDraft
				? {
						to: data.emailDraft.to_address ?? '',
						from_email: data.emailDraft.from_email ?? '',
						from_name: data.emailDraft.from_name,
						subject: data.emailDraft.subject ?? '',
						html: data.emailDraft.html ?? '',
						text: data.emailDraft.text
					}
				: null
	);

	const emailDraftNeedsUnlock = $derived(
		Boolean(data.emailDraft?.encryption_version === 'e2ee-v1' && !decryptedEmailDraft)
	);

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

	$effect(() => {
		const session = data.session;
		if (session.is_read || lastReadMarkSessionId === session.id) return;

		lastReadMarkSessionId = session.id;
		const sessionId = session.id;
		const timer = setTimeout(() => {
			void markSessionRead(sessionId);
		}, 0);

		return () => clearTimeout(timer);
	});

	$effect(() => {
		const privateKey = $e2eePrivateKey;
		const emailDraft = data.emailDraft;
		if (!privateKey) {
			decryptedSession = null;
			decryptedArtifacts = {};
			decryptedEmailDraft = null;
			return;
		}

		let cancelled = false;
		const decryptMetadata = async () => {
			const nextArtifacts: Record<string, { filename: string; contentType: string }> = {};
			let nextSession: { title: string; summary: string | null } | null = null;

			if (data.session.encryption_version === 'e2ee-v1' && data.session.encrypted_title) {
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
				if (
					artifact.encryption_version !== 'e2ee-v1' ||
					!artifact.encrypted_filename ||
					!artifact.encrypted_content_type
				) {
					continue;
				}
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

			let nextEmailDraft: DecryptedEmailDraftFields | null = null;
			if (emailDraft) {
				nextEmailDraft = await decryptEmailDraftFields(emailDraft, privateKey);
			}

			if (!cancelled) {
				decryptedSession = nextSession;
				decryptedArtifacts = nextArtifacts;
				decryptedEmailDraft = nextEmailDraft;
			}
		};
		void decryptMetadata();
		return () => {
			cancelled = true;
		};
	});

	const sessionTitle = $derived(
		data.session.encryption_version === 'e2ee-v1'
			? (decryptedSession?.title ?? 'Encrypted delivery')
			: data.session.title
	);
	const sessionSummary = $derived(
		data.session.encryption_version === 'e2ee-v1'
			? (decryptedSession?.summary ?? 'Unlock encryption to view this delivery.')
			: data.session.summary
	);

	function artifactFilename(artifact: PageData['artifacts'][number]): string {
		if (artifact.encryption_version !== 'e2ee-v1') return artifact.filename;
		return decryptedArtifacts[artifact.id]?.filename ?? 'Encrypted artifact';
	}

	function artifactContentType(artifact: PageData['artifacts'][number]): string {
		if (artifact.encryption_version !== 'e2ee-v1') return artifact.content_type;
		return decryptedArtifacts[artifact.id]?.contentType ?? 'application/octet-stream';
	}

	function artifactPreviewKind(artifact: PageData['artifacts'][number]): PreviewKind {
		if (artifact.encryption_version !== 'e2ee-v1') return artifact.previewKind;
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
		if (artifact.encryption_version !== 'e2ee-v1') {
			return { ok: false, reason: 'missing' };
		}

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

	async function downloadArtifact(id: string) {
		try {
			const res = await fetch(`/api/artifacts/${id}/download`);
			const json = await res.json();
			if (!res.ok) throw new Error(json.error || 'Download failed');
			window.location.href = json.downloadUrl;
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Download failed');
		}
	}

	async function decryptArtifactBytes(artifact: PageData['artifacts'][number]): Promise<Uint8Array> {
		const privateKey = $e2eePrivateKey;
		if (!privateKey) throw new Error('Unlock encryption first');
		if (!artifact.encrypted_payload) throw new Error('Missing encrypted payload metadata');

		const res = await fetch(`/api/artifacts/${artifact.id}/ciphertext`);
		if (!res.ok) throw new Error('Could not fetch encrypted artifact');
		const ciphertextBytes = new Uint8Array(await res.arrayBuffer());
		return decryptBytes(
			payloadToEnvelope(artifact.encrypted_payload as unknown as EncryptedPayload, ciphertextBytes),
			privateKey
		);
	}

	async function downloadArtifactRecord(artifact: PageData['artifacts'][number]) {
		if (artifact.encryption_version !== 'e2ee-v1') {
			await downloadArtifact(artifact.id);
			return;
		}

		if (!(await ensureUnlockedForEncrypted(artifact))) return;

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

	function downloadAllArtifacts() {
		window.location.href = `/api/sessions/${data.session.id}/archive`;
	}

	function openInlinePreview(inline: {
		filename: string;
		kind: 'markdown' | 'html';
		doc: string;
	}) {
		previewToken++;
		previewFilename = inline.filename;
		previewKind = inline.kind;
		previewUrl = '';
		previewSourceDoc = inline.doc;
		previewDoc = buildPreviewContent(inline.kind, inline.doc, darkMode);
		previewError = '';
		previewLoading = false;
		previewOpen = true;
	}

	async function markSessionRead(id: string) {
		try {
			const res = await fetch(`/api/sessions/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ is_read: true })
			});
			if (!res.ok) throw new Error('Mark read failed');
			void invalidate('inbox:sessions');
		} catch (err) {
			console.error('[sessions] mark read failed:', err);
		}
	}

	async function previewArtifact(artifact: PageData['artifacts'][number]) {
		if (artifact.encryption_version === 'e2ee-v1' && !(await ensureUnlockedForEncrypted(artifact))) {
			return;
		}

		let filename: string;
		let contentType: string;
		let kind: PreviewKind;

		if (artifact.encryption_version === 'e2ee-v1') {
			const meta = await resolveEncryptedArtifactMeta(artifact);
			if (!meta.ok) {
				previewError = encryptedArtifactMetaError(meta);
				previewOpen = true;
				return;
			}
			filename = meta.filename;
			contentType = meta.contentType;
			kind = meta.kind;
		} else {
			filename = artifact.filename;
			contentType = artifact.content_type;
			kind = artifact.previewKind;
		}

		if (kind === 'none') {
			await downloadArtifactRecord(artifact);
			return;
		}

		const token = ++previewToken;
		previewFilename = filename;
		previewKind = kind;
		previewUrl = '';
		previewDoc = '';
		previewSourceDoc = '';
		previewError = '';
		previewLoading = true;
		previewOpen = true;

		if (artifact.encryption_version === 'e2ee-v1') {
			try {
				const bytes = await decryptArtifactBytes(artifact);
				if (kind === 'markdown' || kind === 'text' || kind === 'html') {
					const text = new TextDecoder().decode(bytes);
					const content =
						kind === 'markdown'
							? sanitizePreviewHtml(await marked.parse(text, { gfm: true, breaks: true }))
							: kind === 'text'
								? `<pre>${escapeHtml(text)}</pre>`
								: sanitizePreviewHtml(text);
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
			return;
		}

		try {
			const res = await fetch(`/api/artifacts/${artifact.id}/preview`);
			const json = await res.json();
			if (token !== previewToken) return;
			if (!res.ok) throw new Error(json.error || 'Preview failed');

			if (typeof json.content === 'string') {
				previewSourceDoc = json.content;
				previewDoc = buildPreviewContent(json.kind ?? previewKind, json.content, darkMode);
			} else if (json.previewUrl) {
				previewUrl = json.previewUrl;
			} else {
				throw new Error('No preview available');
			}
		} catch (err) {
			if (token !== previewToken) return;
			previewError = err instanceof Error ? err.message : 'Preview failed';
		} finally {
			if (token === previewToken) previewLoading = false;
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
	{:else if data.inlinePreview}
		{#await data.inlinePreview}
			<div
				class="overflow-hidden bg-white dark:bg-slate-900 sm:rounded-xl sm:border sm:border-slate-100 sm:shadow-[0_4px_20px_rgba(0,0,0,0.04)] sm:dark:border-slate-800 sm:dark:shadow-none"
			>
				<div class="h-[28rem] flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
					Loading preview…
				</div>
			</div>
		{:then inline}
			<div
				class="overflow-hidden bg-white dark:bg-slate-900 sm:rounded-xl sm:border sm:border-slate-100 sm:shadow-[0_4px_20px_rgba(0,0,0,0.04)] sm:dark:border-slate-800 sm:dark:shadow-none"
			>
				<div
					class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-6 py-3 border-b border-slate-100 dark:border-slate-800"
				>
					<div class="min-w-0">
						<p class="text-sm font-medium text-slate-900 truncate dark:text-slate-100" title={inline.filename}>
							{inline.filename}
						</p>
						<p class="text-xs text-slate-500 dark:text-slate-400">
							Rendered from the single {inline.kind === 'markdown' ? 'Markdown' : 'HTML'} artifact.
						</p>
					</div>
					<div class="flex shrink-0 items-center gap-2 self-end sm:self-auto">
						<Button
							variant="ghost"
							size="icon"
							class="shrink-0"
							onclick={() => openInlinePreview(inline)}
							title="Open fullscreen preview"
							aria-label="Open fullscreen preview"
						>
							<Maximize2 class="h-4 w-4" />
						</Button>
						<Button
							variant="outline"
							size="sm"
							class="shrink-0"
							onclick={() => downloadArtifact(inline.artifactId)}
						>
							<Download class="h-4 w-4 mr-2" />
							Download
						</Button>
					</div>
				</div>
				<div class="px-4 pb-4 sm:px-6">
					<iframe
						srcdoc={buildPreviewContent(inline.kind, inline.doc, darkMode)}
						title={inline.filename}
						sandbox={STRICT_PREVIEW_SANDBOX}
						referrerpolicy={PREVIEW_REFERRER_POLICY}
						class="block h-[calc(100dvh-13rem)] min-h-[28rem] w-full border-0 bg-white dark:bg-slate-950 sm:h-[72vh] sm:min-h-[32rem]"
					></iframe>
				</div>
			</div>
		{:catch err}
			<div
				class="overflow-hidden bg-white dark:bg-slate-900 sm:rounded-xl sm:border sm:border-slate-100 sm:shadow-[0_4px_20px_rgba(0,0,0,0.04)] sm:dark:border-slate-800 sm:dark:shadow-none"
			>
				<div class="p-4 sm:p-6 text-sm text-red-600">
					{err instanceof Error ? err.message : 'Preview unavailable.'}
				</div>
			</div>
		{/await}
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
				{#if data.artifacts.length > 0}
					<Button variant="outline" size="sm" class="shrink-0" onclick={downloadAllArtifacts}>
						<Archive class="h-4 w-4 mr-2" />
						Download all (.zip)
					</Button>
				{/if}
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
			{:else if (previewKind === 'html' || previewKind === 'markdown' || previewKind === 'text') && previewDoc}
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
