<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { encryptString } from '$lib/e2ee';
	import { e2eeConfig } from '$lib/e2ee-store';
	import {
		emailDraftAgentFields,
		emailDraftDisplayFields
	} from '$lib/email-draft-decrypt';
	import {
		agentFieldsToBundle,
		bundleMatchesAgent,
		bundlesEqual,
		mergeEmailDraftBundle,
		type EmailDraftBundle
	} from '$lib/email-draft-bundle';
	import { emailDraftStatusLabel } from '$lib/email-draft-status';
	import {
		buildApproveRequestInit,
		buildEditableBundle,
		buildSentEmailBundle,
		persistEmailDraftReview,
		reviewPayloadNeeded
	} from '$lib/email-draft-review-actions';
	import { looksLikePlainTextBody, toPreviewHtmlDocument } from '$lib/preview-doc';
	import HtmlArtifactPreview from '$lib/components/portal/HtmlArtifactPreview.svelte';
	import HtmlPreviewOpenInTabButton from '$lib/components/portal/HtmlPreviewOpenInTabButton.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import Input from '$lib/components/ui/input/input.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import type { DecryptedEmailDraftFields } from '$lib/email-draft-decrypt';
	import type { EmailDraftRecord } from '$plugins/email-review-relay/server';

	const REVIEW_AUTOSAVE_MS = 800;

	type Props = {
		emailDraft: EmailDraftRecord;
		activeEmailDraft: DecryptedEmailDraftFields | null;
		emailDraftNeedsUnlock: boolean;
		cloudflareEmailConfigured: boolean;
		sessionId: string;
		darkMode: boolean;
		e2eeConfigured: boolean;
		onUnlock?: () => Promise<boolean>;
	};

	let {
		emailDraft,
		activeEmailDraft,
		emailDraftNeedsUnlock,
		cloudflareEmailConfigured,
		sessionId,
		darkMode,
		e2eeConfigured,
		onUnlock
	}: Props = $props();

	let emailActionBusy = $state(false);
	let emailActionError = $state('');
	let approveDialogOpen = $state(false);
	let editableTo = $state('');
	let editableFromEmail = $state('');
	let editableFromName = $state('');
	let editableSubject = $state('');
	let editableHtml = $state('');
	let editingBody = $state(false);
	let bodyView = $state<'preview' | 'code'>('preview');
	let loadedDraftKey = $state('');
	let loadedReviewKey = $state('');
	let reviewSaveStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	let reviewSaveError = $state('');
	let reviewSaveTimer: ReturnType<typeof setTimeout> | undefined;
	let lastPersistedReview = $state<EmailDraftBundle | null>(null);

	const canEditDraft = $derived(
		Boolean(activeEmailDraft?.html) &&
			!emailDraftNeedsUnlock &&
			(emailDraft.status === 'pending' || emailDraft.status === 'failed')
	);

	const agentBundle = $derived(
		activeEmailDraft ? agentFieldsToBundle(emailDraftAgentFields(activeEmailDraft)) : null
	);

	const editableBundle = $derived(
		buildEditableBundle({
			to: editableTo,
			from_email: editableFromEmail,
			from_name: editableFromName.trim() ? editableFromName.trim() : null,
			subject: editableSubject,
			html: editableHtml
		})
	);

	const draftWasEdited = $derived(
		Boolean(agentBundle) && !bundleMatchesAgent(editableBundle, agentBundle!)
	);

	const bodyIsPlainText = $derived(
		Boolean(editableHtml.trim()) && looksLikePlainTextBody(editableHtml)
	);

	const editBodyLabel = $derived(bodyIsPlainText ? 'Edit text' : 'Edit HTML');

	function reviewOverlayKey(review: DecryptedEmailDraftFields['review']): string {
		return review ? JSON.stringify(review) : '';
	}

	$effect(() => {
		const draftKey = `${sessionId}:${emailDraft.id}:${emailDraft.status}:${emailDraft.updated_at}`;

		if (!activeEmailDraft) {
			loadedDraftKey = '';
			loadedReviewKey = '';
			editableTo = '';
			editableFromEmail = '';
			editableFromName = '';
			editableSubject = '';
			editableHtml = '';
			editingBody = false;
			bodyView = 'preview';
			reviewSaveStatus = 'idle';
			reviewSaveError = '';
			lastPersistedReview = null;
			return;
		}

		const reviewKey = reviewOverlayKey(activeEmailDraft.review);
		if (draftKey === loadedDraftKey && reviewKey === loadedReviewKey) {
			return;
		}

		const reviewOverlayRefreshed =
			draftKey === loadedDraftKey && reviewKey !== loadedReviewKey;

		loadedDraftKey = draftKey;
		loadedReviewKey = reviewKey;

		if (reviewOverlayRefreshed && editingBody) {
			const agent = emailDraftAgentFields(activeEmailDraft);
			if (activeEmailDraft.review) {
				const reviewBundle = mergeEmailDraftBundle(agent, activeEmailDraft.review);
				lastPersistedReview = bundleMatchesAgent(reviewBundle, agent) ? null : reviewBundle;
			} else {
				lastPersistedReview = null;
			}
			return;
		}

		const display = emailDraftDisplayFields(activeEmailDraft, emailDraft.status);
		editableTo = display.to;
		editableFromEmail = display.from_email;
		editableFromName = display.from_name ?? '';
		editableSubject = display.subject;
		editableHtml = display.html;

		const agent = emailDraftAgentFields(activeEmailDraft);
		if (activeEmailDraft.review) {
			const reviewBundle = mergeEmailDraftBundle(agent, activeEmailDraft.review);
			lastPersistedReview = bundleMatchesAgent(reviewBundle, agent) ? null : reviewBundle;
		} else {
			lastPersistedReview = null;
		}

		editingBody = false;
		bodyView = 'preview';
		reviewSaveStatus = 'idle';
		reviewSaveError = '';
	});

	function scheduleReviewSave() {
		if (!canEditDraft || !activeEmailDraft) return;
		if (reviewSaveTimer) clearTimeout(reviewSaveTimer);
		reviewSaveTimer = setTimeout(() => {
			reviewSaveTimer = undefined;
			void persistReview();
		}, REVIEW_AUTOSAVE_MS);
	}

	function handleDraftInput() {
		scheduleReviewSave();
	}

	function reviewPayloadForSave(): EmailDraftBundle | null {
		if (!agentBundle) return null;
		return reviewPayloadNeeded(agentBundle, editableBundle, bundleMatchesAgent);
	}

	async function persistReview(): Promise<boolean> {
		if (!canEditDraft || !activeEmailDraft || !agentBundle) return false;

		const payload = reviewPayloadForSave();
		const unchanged =
			payload === null
				? lastPersistedReview === null
				: lastPersistedReview !== null && bundlesEqual(payload, lastPersistedReview);
		if (unchanged) return true;

		const publicKeyJwk = $e2eeConfig.publicKeyJwk;
		if (!publicKeyJwk) {
			reviewSaveStatus = 'error';
			reviewSaveError = 'Encryption is not configured.';
			return false;
		}

		reviewSaveStatus = 'saving';
		reviewSaveError = '';

		try {
			await persistEmailDraftReview({
				sessionId,
				payload,
				publicKeyJwk,
				encryptString
			});

			lastPersistedReview = payload;
			reviewSaveStatus = 'saved';
			await invalidate('inbox:session');
			return true;
		} catch (err) {
			reviewSaveStatus = 'error';
			reviewSaveError = err instanceof Error ? err.message : 'Could not save draft';
			return false;
		}
	}

	const emailPreviewDoc = $derived(
		editableHtml.trim() ? toPreviewHtmlDocument(editableHtml, darkMode) : ''
	);

	$effect(() => {
		if (!canEditDraft && editingBody) {
			editingBody = false;
			bodyView = 'preview';
		}
	});

	const canApprove = $derived(
		(emailDraft.status === 'pending' || emailDraft.status === 'failed') &&
			!emailDraftNeedsUnlock &&
			cloudflareEmailConfigured
	);

	function formatEmailFrom(draft: { from_email: string; from_name: string | null }): string {
		return draft.from_name ? `${draft.from_name} <${draft.from_email}>` : draft.from_email;
	}

	function startBodyEdit() {
		if (!canEditDraft) return;
		editingBody = true;
		bodyView = 'code';
	}

	function showBodyPreview() {
		bodyView = 'preview';
	}

	function showBodyCode() {
		if (!canEditDraft) return;
		bodyView = 'code';
	}

	async function approveEmailDraft() {
		if (!activeEmailDraft || emailActionBusy || !canApprove) {
			return;
		}
		if (!editableHtml.trim()) {
			emailActionError = 'Email body cannot be empty.';
			approveDialogOpen = false;
			return;
		}
		if (!editableTo.trim() || !editableFromEmail.trim() || !editableSubject.trim()) {
			emailActionError = 'To, From, and Subject are required.';
			approveDialogOpen = false;
			return;
		}

		emailActionBusy = true;
		emailActionError = '';
		try {
			if (reviewSaveTimer) {
				clearTimeout(reviewSaveTimer);
				reviewSaveTimer = undefined;
			}
			if (draftWasEdited) {
				const saved = await persistReview();
				if (!saved && reviewSaveStatus === 'error') {
					throw new Error(reviewSaveError || 'Could not save draft edits before sending');
				}
			}

			const sentBundle = buildSentEmailBundle(editableBundle, editableHtml);
			const init = await buildApproveRequestInit({
				sentBundle,
				plainText: activeEmailDraft.text,
				encryptionVersion: emailDraft.encryption_version,
				publicKeyJwk: $e2eeConfig.publicKeyJwk,
				encryptString
			});
			const res = await fetch(`/api/sessions/${sessionId}/email/approve`, init);
			const result = await res.json();
			if (!res.ok) throw new Error(result.error || 'Could not approve email');
			await Promise.all([invalidate('inbox:session'), invalidate('inbox:sessions')]);
		} catch (err) {
			emailActionError = err instanceof Error ? err.message : 'Could not approve email';
		} finally {
			emailActionBusy = false;
			approveDialogOpen = false;
		}
	}

	async function rejectEmailDraft() {
		if (emailActionBusy || emailDraft.status !== 'pending') return;
		emailActionBusy = true;
		emailActionError = '';
		try {
			const res = await fetch(`/api/sessions/${sessionId}/email/reject`, { method: 'POST' });
			const result = await res.json();
			if (!res.ok) throw new Error(result.error || 'Could not reject email');
			await Promise.all([invalidate('inbox:session'), invalidate('inbox:sessions')]);
		} catch (err) {
			emailActionError = err instanceof Error ? err.message : 'Could not reject email';
		} finally {
			emailActionBusy = false;
		}
	}

	async function handleApproveClick() {
		if (emailDraftNeedsUnlock && e2eeConfigured && onUnlock) {
			const unlocked = await onUnlock();
			if (!unlocked) return;
		}
		if (emailDraftNeedsUnlock) return;
		approveDialogOpen = true;
	}
</script>

<div
	class="overflow-hidden bg-white dark:bg-slate-900 sm:rounded-xl sm:border sm:border-slate-100 sm:shadow-[0_4px_20px_rgba(0,0,0,0.04)] sm:dark:border-slate-800 sm:dark:shadow-none"
>
	<div class="space-y-3 border-b border-slate-100 px-4 py-4 dark:border-slate-800 sm:px-6">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div class="min-w-0 flex-1 space-y-3 text-sm">
				{#if activeEmailDraft}
					{#if canEditDraft}
						<div class="grid gap-2 sm:grid-cols-[4rem_1fr] sm:items-center">
							<label for="draft-to" class="font-semibold text-slate-900 dark:text-slate-100">To</label>
							<Input
								id="draft-to"
								type="email"
								bind:value={editableTo}
								oninput={handleDraftInput}
								disabled={emailActionBusy}
								class="h-9"
							/>
						</div>
						<div class="grid gap-2 sm:grid-cols-[4rem_1fr] sm:items-center">
							<label for="draft-from-email" class="font-semibold text-slate-900 dark:text-slate-100"
								>From</label
							>
							<div class="grid gap-2 sm:grid-cols-2">
								<Input
									id="draft-from-email"
									type="email"
									bind:value={editableFromEmail}
									oninput={handleDraftInput}
									disabled={emailActionBusy}
									placeholder="email@yourdomain.com"
									class="h-9"
								/>
								<Input
									id="draft-from-name"
									type="text"
									bind:value={editableFromName}
									oninput={handleDraftInput}
									disabled={emailActionBusy}
									placeholder="Display name (optional)"
									class="h-9"
								/>
							</div>
						</div>
						<div class="grid gap-2 sm:grid-cols-[4rem_1fr] sm:items-center">
							<label for="draft-subject" class="font-semibold text-slate-900 dark:text-slate-100"
								>Subject</label
							>
							<Input
								id="draft-subject"
								type="text"
								bind:value={editableSubject}
								oninput={handleDraftInput}
								disabled={emailActionBusy}
								class="h-9"
							/>
						</div>
					{:else}
						<p class="text-slate-900 dark:text-slate-100">
							<span class="font-semibold">To:</span>
							{editableTo || activeEmailDraft.to}
						</p>
						<p class="text-slate-900 dark:text-slate-100">
							<span class="font-semibold">From:</span>
							{formatEmailFrom({
								from_email: editableFromEmail || activeEmailDraft.from_email,
								from_name: editableFromName.trim() || activeEmailDraft.from_name
							})}
						</p>
						<p class="text-slate-900 dark:text-slate-100">
							<span class="font-semibold">Subject:</span>
							{editableSubject || activeEmailDraft.subject}
						</p>
					{/if}
				{:else if emailDraftNeedsUnlock}
					<p class="text-slate-600 dark:text-slate-300">
						Unlock encryption to preview this email draft.
					</p>
					{#if e2eeConfigured && onUnlock}
						<Button variant="outline" size="sm" onclick={() => onUnlock?.()}>
							Unlock encryption
						</Button>
					{/if}
				{/if}
			</div>
			<span
				class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
			>
				{emailDraftStatusLabel(emailDraft.status, 'detail')}
			</span>
		</div>

		{#if canEditDraft && draftWasEdited}
			<p class="text-xs text-slate-500 dark:text-slate-400">
				Draft modified — approve sends your edits.
				{#if reviewSaveStatus === 'saving'}
					Saving…
				{:else if reviewSaveStatus === 'saved'}
					Saved.
				{:else if reviewSaveStatus === 'error'}
					<span class="text-red-600 dark:text-red-400">{reviewSaveError}</span>
				{/if}
			</p>
		{/if}

		{#if emailDraft.status === 'pending' || emailDraft.status === 'failed'}
			<div class="flex flex-wrap items-center gap-2">
				<Button
					disabled={emailActionBusy || !canApprove}
					title={emailDraftNeedsUnlock
						? 'Unlock encryption to preview and approve this draft'
						: cloudflareEmailConfigured
							? emailDraft.status === 'failed'
								? 'Retry sending this email'
								: 'Approve and send this email'
							: 'Add Cloudflare API credentials in Account first'}
					onclick={handleApproveClick}
				>
					{emailActionBusy ? 'Sending…' : emailDraft.status === 'failed' ? 'Retry send' : 'Approve'}
				</Button>
				{#if emailDraft.status === 'pending'}
					<Button variant="outline" disabled={emailActionBusy} onclick={rejectEmailDraft}>
						Reject
					</Button>
				{/if}
			</div>
			{#if !cloudflareEmailConfigured}
				<p class="text-xs text-amber-700 dark:text-amber-300">
					<a
						href="/portal/account"
						class="underline underline-offset-2 hover:text-amber-800 dark:hover:text-amber-200"
						>Add Cloudflare API credentials in Account</a
					> before approving.
				</p>
			{/if}
		{/if}

		{#if emailDraft.send_error}
			<p class="text-sm text-red-600 dark:text-red-400">{emailDraft.send_error}</p>
		{/if}
		{#if emailActionError}
			<p class="text-sm text-red-600 dark:text-red-400">{emailActionError}</p>
		{/if}
	</div>

	<div class="space-y-3 px-4 pb-4 sm:px-6">
		{#if (canEditDraft && (activeEmailDraft?.html || editingBody)) || (!canEditDraft && (activeEmailDraft?.html || editableHtml))}
			<div class="flex flex-wrap items-center gap-2">
				{#if canEditDraft}
					{#if !editingBody}
						<Button variant="outline" size="sm" disabled={emailActionBusy} onclick={startBodyEdit}>
							{editBodyLabel}
						</Button>
					{:else if bodyView === 'code'}
						<Button variant="outline" size="sm" disabled={emailActionBusy} onclick={showBodyPreview}>
							Preview
						</Button>
					{:else}
						<Button variant="outline" size="sm" disabled={emailActionBusy} onclick={showBodyCode}>
							{bodyIsPlainText ? 'Edit text' : 'Edit'}
						</Button>
					{/if}
				{/if}
				{#if bodyView === 'preview' && (editableHtml || activeEmailDraft?.html)}
					<HtmlPreviewOpenInTabButton
						sourceHtml={editableHtml || activeEmailDraft?.html || ''}
						disabled={emailActionBusy}
					/>
				{/if}
			</div>
		{/if}

		{#if canEditDraft && editingBody && bodyView === 'code'}
			<textarea
				bind:value={editableHtml}
				oninput={handleDraftInput}
				spellcheck="false"
				aria-label={bodyIsPlainText ? 'Email text body' : 'Email HTML body'}
				class="block h-[calc(100dvh-13rem)] min-h-[28rem] w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 sm:h-[72vh] sm:min-h-[32rem]"
			></textarea>
		{:else if activeEmailDraft?.html || (editingBody && emailPreviewDoc)}
			<HtmlArtifactPreview
				sourceHtml={editableHtml}
				previewDoc={emailPreviewDoc}
				title={editableSubject || activeEmailDraft?.subject || 'Email preview'}
				class="h-[calc(100dvh-13rem)] min-h-[28rem] w-full sm:h-[72vh] sm:min-h-[32rem]"
			/>
		{:else}
			<div
				class="flex h-[28rem] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400"
			>
				{emailDraftNeedsUnlock
					? 'Unlock encryption to preview the email body.'
					: 'Email preview unavailable.'}
			</div>
		{/if}
	</div>
</div>

<AlertDialog.Root bind:open={approveDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Approve and send email?</AlertDialog.Title>
			<AlertDialog.Description>
				This will send the draft to {editableTo || activeEmailDraft?.to || 'the recipient'} using your
				Cloudflare Email Sending credentials.{draftWasEdited
					? ' Your edits will be sent (HTML body sanitized to match the preview).'
					: ' The HTML body is sanitized to match the preview shown above.'}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={emailActionBusy}>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action on:click={approveEmailDraft} disabled={emailActionBusy}>
				{emailActionBusy ? 'Sending…' : 'Approve and send'}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
