import type { SidebarDecryptedMeta, SidebarSessionIcon } from '$lib/portal/sidebar-types';

export type { SidebarDecryptedMeta, SidebarFilter, SidebarSessionIcon } from '$lib/portal/sidebar-types';
export { EMAIL_DRAFT_SIDEBAR_DESCRIPTION } from '$lib/portal/sidebar-types';

export type SidebarFixtureSession = {
	id: string;
	updated_at: string;
	encryption_version: string;
	is_read: boolean;
	artifact_count: number;
	is_archived?: boolean;
	title: string;
	agentName: string;
	summary: string;
	icon: SidebarSessionIcon;
};

export const DEV_SIDEBAR_FIXTURES: SidebarFixtureSession[] = [
	{
		id: 'session-docker',
		updated_at: new Date(new Date().setHours(8, 2, 0, 0)).toISOString(),
		encryption_version: 'plain',
		is_read: false,
		artifact_count: 1,
		title: 'Daily Docker Monitoring',
		agentName: 'voice-server',
		summary: 'HTML report generated from scheduled run',
		icon: 'server'
	},
	{
		id: 'session-email-draft',
		updated_at: new Date(new Date().setHours(9, 15, 0, 0)).toISOString(),
		encryption_version: 'plain',
		is_read: false,
		artifact_count: 0,
		title: 'Intro: AI startup feedback',
		agentName: 'outreach-agent',
		summary: 'To: investor@example.com',
		icon: 'email'
	},
	{
		id: 'session-apple-ads',
		updated_at: new Date(new Date().setHours(8, 32, 0, 0)).toISOString(),
		encryption_version: 'plain',
		is_read: false,
		artifact_count: 3,
		title: 'Apple Ads Portfolio',
		agentName: 'marketing-agent',
		summary: 'Report and attachments delivered',
		icon: 'chart'
	},
	{
		id: 'session-gateway',
		updated_at: new Date(Date.now() - 86_400_000).toISOString(),
		encryption_version: 'plain',
		is_read: true,
		artifact_count: 1,
		title: 'Gateway shutdown warning',
		agentName: 'monitor-agent',
		summary: 'Service interruption summary',
		icon: 'warning'
	},
	{
		id: 'session-french-news',
		updated_at: new Date(Date.now() - 86_400_000).toISOString(),
		encryption_version: 'plain',
		is_read: true,
		artifact_count: 1,
		title: 'Daily French News Brief',
		agentName: 'news-agent',
		summary: 'AI-curated summary',
		icon: 'document'
	},
	{
		id: 'session-sales',
		updated_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
		encryption_version: 'plain',
		is_read: true,
		artifact_count: 2,
		title: 'Weekly Sales Summary',
		agentName: 'sales-agent',
		summary: 'Weekly performance overview',
		icon: 'chart'
	},
	{
		id: 'session-deploy',
		updated_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
		encryption_version: 'plain',
		is_read: true,
		artifact_count: 1,
		title: 'Staging deploy report',
		agentName: 'deploy-agent',
		summary: 'Build and rollout summary',
		icon: 'server'
	},
	{
		id: 'session-inventory',
		updated_at: new Date(Date.now() - 4 * 86_400_000).toISOString(),
		encryption_version: 'plain',
		is_read: true,
		artifact_count: 2,
		title: 'Inventory reconciliation',
		agentName: 'ops-agent',
		summary: 'Stock variance analysis',
		icon: 'chart'
	},
	{
		id: 'session-security',
		updated_at: new Date(Date.now() - 5 * 86_400_000).toISOString(),
		encryption_version: 'plain',
		is_read: true,
		artifact_count: 1,
		title: 'Security scan digest',
		agentName: 'security-agent',
		summary: 'Weekly vulnerability summary',
		icon: 'warning'
	},
	{
		id: 'session-onboarding',
		updated_at: new Date(Date.now() - 6 * 86_400_000).toISOString(),
		encryption_version: 'plain',
		is_read: true,
		artifact_count: 1,
		title: 'Customer onboarding packet',
		agentName: 'success-agent',
		summary: 'Welcome materials delivered',
		icon: 'document'
	}
];

export function fixturesToSidebarProps(fixtures: SidebarFixtureSession[]) {
	const sessions = fixtures.map(
		({ title: _title, agentName: _agentName, summary: _summary, icon: _icon, ...session }) => session
	);
	const decryptedSessions: Record<string, SidebarDecryptedMeta> = Object.fromEntries(
		fixtures.map((fixture) => [
			fixture.id,
			{
				title: fixture.title,
				summary: fixture.summary,
				agentName: fixture.agentName,
				icon: fixture.icon
			}
		])
	);

	return { sessions, decryptedSessions };
}
