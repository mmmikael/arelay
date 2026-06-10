export type SessionActivityLine = {
	key: string;
	label: string;
	detail: string;
};

export function formatActivityTimestamp(iso: string | Date): string {
	const date = new Date(iso);
	const now = new Date();
	const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	const dayDiff = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86_400_000);
	const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

	if (dayDiff === 0) return `Today ${time}`;
	if (dayDiff === 1) return `Yesterday ${time}`;
	if (dayDiff > 1 && dayDiff < 7) return `${dayDiff} days ago`;
	return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function buildSessionActivityLines(input: {
	sessionCreatedAt: string | Date;
	artifacts: { id: string; filename: string }[];
	emailDraftCreatedAt?: string | Date | null;
}): SessionActivityLine[] {
	const lines: SessionActivityLine[] = [
		{
			key: 'session-created',
			label: 'Session created',
			detail: formatActivityTimestamp(input.sessionCreatedAt)
		}
	];

	// Draft sessions render only the email panel, not the file list.
	if (input.emailDraftCreatedAt) {
		lines.push({
			key: 'email-draft',
			label: 'Email draft submitted',
			detail: formatActivityTimestamp(input.emailDraftCreatedAt)
		});
		return lines;
	}

	for (const artifact of input.artifacts) {
		lines.push({
			key: `file-${artifact.id}`,
			label: 'File added',
			detail: artifact.filename
		});
	}

	return lines;
}
