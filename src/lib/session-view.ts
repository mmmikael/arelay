import type { InboxSession } from '$lib/server/db';

export type SessionView = {
	id: string;
	owner_user_id: string | null;
	encryption_version: string;
	encrypted_title: InboxSession['encrypted_title'];
	encrypted_summary: InboxSession['encrypted_summary'];
	read_at: Date | null;
	created_at: Date;
	updated_at: Date;
	is_read: boolean;
	artifact_count?: number;
};

export function toSessionView(session: InboxSession): SessionView {
	const view: SessionView = {
		id: session.id,
		owner_user_id: session.owner_user_id,
		encryption_version: session.encryption_version,
		encrypted_title: session.encrypted_title,
		encrypted_summary: session.encrypted_summary,
		read_at: session.read_at,
		created_at: session.created_at,
		updated_at: session.updated_at,
		is_read: session.is_read
	};
	if (session.artifact_count !== undefined) {
		view.artifact_count = session.artifact_count;
	}
	return view;
}
