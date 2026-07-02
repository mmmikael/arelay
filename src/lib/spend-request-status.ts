export type SpendRequestStatusContext = 'sidebar' | 'detail';

export function spendRequestStatusLabel(
	status: string,
	context: SpendRequestStatusContext = 'sidebar'
): string {
	switch (status) {
		case 'pending':
			return context === 'detail' ? 'Needs your approval' : 'Pending';
		case 'approved':
			return 'Approved';
		case 'paid':
			return 'Paid';
		case 'rejected':
			return 'Rejected';
		case 'failed':
			return context === 'detail' ? 'Charge failed — retry available' : 'Charge failed';
		default:
			return status;
	}
}

export function spendRequestStatusClass(status: string): string {
	switch (status) {
		case 'pending':
			return 'font-medium text-amber-600 dark:text-amber-400';
		case 'approved':
		case 'paid':
			return 'font-medium text-emerald-600 dark:text-emerald-400';
		case 'rejected':
		case 'failed':
			return 'font-medium text-red-600 dark:text-red-400';
		default:
			return '';
	}
}

/**
 * Format a minor-unit amount (e.g. cents) for display. Assumes a two-decimal currency,
 * which covers USD/EUR/GBP and most demo cases; zero-decimal currencies (e.g. JPY) will
 * read 100× small, which is acceptable for the current scope.
 */
export function formatSpendAmount(amountMinor: number, currency: string): string {
	const major = amountMinor / 100;
	const code = currency.trim().toUpperCase();
	try {
		return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(major);
	} catch {
		return `${code} ${major.toFixed(2)}`;
	}
}
