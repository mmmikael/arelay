<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { sanitizePreviewHtml } from '$lib/preview-sanitize';
	import { toPreviewHtmlDocument } from '$lib/preview-doc';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import type { DecryptedEmailDraftFields } from '$lib/email-draft-decrypt';
	import type { EmailDraftRecord } from '$plugins/email-review-relay/server';
	import { PREVIEW_REFERRER_POLICY, STRICT_PREVIEW_SANDBOX } from '$lib/preview-sandbox';

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

	const emailPreviewDoc = $derived(
		activeEmailDraft?.html
			? toPreviewHtmlDocument(sanitizePreviewHtml(activeEmailDraft.html), darkMode)
			: ''
	);

	const canApprove = $derived(
		(emailDraft.status === 'pending' || emailDraft.status === 'failed') &&
			!emailDraftNeedsUnlock &&
			cloudflareEmailConfigured
	);

	function emailDraftStatusLabel(status: string): string {
		switch (status) {
			case 'pending':
				return 'Awaiting review';
			case 'sent':
				return 'Sent';
			case 'rejected':
				return 'Rejected';
			case 'failed':
				return 'Send failed — retry available';
			case 'approved':
				return 'Approved';
			default:
				return status;
		}
	}

	function formatEmailFrom(draft: { from_email: string; from_name: string | null }): string {
		return draft.from_name ? `${draft.from_name} <${draft.from_email}>` : draft.from_email;
	}

	async function approveEmailDraft() {
		if (!activeEmailDraft || emailActionBusy || !canApprove) {
			return;
		}

		emailActionBusy = true;
		emailActionError = '';
		try {
			const sanitizedHtml = sanitizePreviewHtml(activeEmailDraft.html);
			const init: RequestInit = { method: 'POST' };
			if (emailDraft.encryption_version === 'e2ee-v1') {
				init.headers = { 'Content-Type': 'application/json' };
				init.body = JSON.stringify({
					to: activeEmailDraft.to,
					from: {
						email: activeEmailDraft.from_email,
						name: activeEmailDraft.from_name ?? undefined
					},
					subject: activeEmailDraft.subject,
					html: sanitizedHtml,
					text: activeEmailDraft.text ?? undefined
				});
			}
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
			<div class="space-y-2 text-sm">
				{#if activeEmailDraft}
					<p class="text-slate-900 dark:text-slate-100">
						<span class="font-semibold">To:</span>
						{activeEmailDraft.to}
					</p>
					<p class="text-slate-900 dark:text-slate-100">
						<span class="font-semibold">From:</span>
						{formatEmailFrom(activeEmailDraft)}
					</p>
					<p class="text-slate-900 dark:text-slate-100">
						<span class="font-semibold">Subject:</span>
						{activeEmailDraft.subject}
					</p>
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
				{emailDraftStatusLabel(emailDraft.status)}
			</span>
		</div>

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

	<div class="px-4 pb-4 sm:px-6">
		{#if activeEmailDraft?.html}
			<iframe
				srcdoc={emailPreviewDoc}
				title={activeEmailDraft.subject}
				sandbox={STRICT_PREVIEW_SANDBOX}
				referrerpolicy={PREVIEW_REFERRER_POLICY}
				class="block h-[calc(100dvh-13rem)] min-h-[28rem] w-full border-0 bg-white dark:bg-slate-950 sm:h-[72vh] sm:min-h-[32rem]"
			></iframe>
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
				This will send the draft to {activeEmailDraft?.to ?? 'the recipient'} using your Cloudflare
				Email Sending credentials. The HTML body is sanitized to match the preview shown above.
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
