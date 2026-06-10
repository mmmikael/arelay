export type EmailDraftStatusContext = 'sidebar' | 'detail';

export function emailDraftStatusLabel(
	status: string,
	context: EmailDraftStatusContext = 'sidebar'
): string {
	switch (status) {
		case 'pending':
			return context === 'detail' ? 'Needs your approval' : 'Pending';
		case 'sent':
			return 'Sent';
		case 'rejected':
			return 'Rejected';
		case 'failed':
			return context === 'detail' ? 'Send failed — retry available' : 'Send failed';
		case 'approved':
			return 'Approved';
		default:
			return status;
	}
}

export function emailDraftStatusClass(status: string): string {
	switch (status) {
		case 'pending':
			return 'font-medium text-amber-600 dark:text-amber-400';
		case 'approved':
			return 'font-medium text-emerald-600 dark:text-emerald-400';
		case 'rejected':
			return 'font-medium text-red-600 dark:text-red-400';
		case 'sent':
			return 'font-medium text-emerald-600 dark:text-emerald-400';
		case 'failed':
			return 'font-medium text-red-600 dark:text-red-400';
		default:
			return '';
	}
}
