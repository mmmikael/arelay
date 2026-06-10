export type SidebarFilter = 'all' | 'unread' | 'email' | 'files' | 'archived';

export type SidebarSessionIcon =
	| 'server'
	| 'warning'
	| 'document'
	| 'chart'
	| 'email'
	| 'default';

export const EMAIL_DRAFT_SIDEBAR_DESCRIPTION = 'Outbound email draft for your review';

/** Gate archived filter/footer until sessions expose `is_archived` from the API. */
export const SIDEBAR_ARCHIVE_FILTER_ENABLED = false;

export type SidebarDecryptedMeta = {
	title: string;
	summary: string | null;
	agentName?: string;
	icon?: SidebarSessionIcon;
};
