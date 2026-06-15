/** Human review or sent snapshot of editable email draft fields (encrypted as one JSON blob). */
export type EmailDraftBundle = {
	to: string;
	cc: string | null;
	bcc: string | null;
	from_email: string;
	from_name: string | null;
	subject: string;
	html: string;
};

export type EmailDraftAgentFields = {
	to: string;
	cc: string | null;
	bcc: string | null;
	from_email: string;
	from_name: string | null;
	subject: string;
	html: string;
};

export function agentFieldsToBundle(fields: EmailDraftAgentFields): EmailDraftBundle {
	return {
		to: fields.to,
		cc: fields.cc,
		bcc: fields.bcc,
		from_email: fields.from_email,
		from_name: fields.from_name,
		subject: fields.subject,
		html: fields.html
	};
}

/** Validate an optional nullable-string bundle field (cc/bcc/from_name). */
function optionalBundleString(value: unknown): { ok: true; value: string | null } | { ok: false } {
	if (value === null || value === undefined) return { ok: true, value: null };
	if (typeof value !== 'string') return { ok: false };
	return { ok: true, value };
}

export function parseEmailDraftBundleJson(json: string): EmailDraftBundle | null {
	try {
		const value = JSON.parse(json) as unknown;
		if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
		const record = value as Record<string, unknown>;
		if (
			typeof record.to !== 'string' ||
			typeof record.from_email !== 'string' ||
			typeof record.subject !== 'string' ||
			typeof record.html !== 'string'
		) {
			return null;
		}
		const fromName = optionalBundleString(record.from_name);
		const cc = optionalBundleString(record.cc);
		const bcc = optionalBundleString(record.bcc);
		if (!fromName.ok || !cc.ok || !bcc.ok) {
			return null;
		}
		return {
			to: record.to,
			cc: cc.value,
			bcc: bcc.value,
			from_email: record.from_email,
			from_name: fromName.value,
			subject: record.subject,
			html: record.html
		};
	} catch {
		return null;
	}
}

export function mergeEmailDraftBundle(
	base: EmailDraftAgentFields,
	overlay: Partial<EmailDraftBundle> | null | undefined
): EmailDraftBundle {
	if (!overlay) return agentFieldsToBundle(base);
	return {
		to: overlay.to ?? base.to,
		cc: overlay.cc !== undefined ? overlay.cc : base.cc,
		bcc: overlay.bcc !== undefined ? overlay.bcc : base.bcc,
		from_email: overlay.from_email ?? base.from_email,
		from_name: overlay.from_name !== undefined ? overlay.from_name : base.from_name,
		subject: overlay.subject ?? base.subject,
		html: overlay.html ?? base.html
	};
}

export function bundlesEqual(a: EmailDraftBundle, b: EmailDraftBundle): boolean {
	return (
		a.to === b.to &&
		a.cc === b.cc &&
		a.bcc === b.bcc &&
		a.from_email === b.from_email &&
		a.from_name === b.from_name &&
		a.subject === b.subject &&
		a.html === b.html
	);
}

export function bundleMatchesAgent(
	bundle: EmailDraftBundle,
	agent: EmailDraftAgentFields
): boolean {
	return (
		bundle.to === agent.to &&
		bundle.cc === agent.cc &&
		bundle.bcc === agent.bcc &&
		bundle.from_email === agent.from_email &&
		bundle.from_name === agent.from_name &&
		bundle.subject === agent.subject &&
		bundle.html === agent.html
	);
}

export function emailDraftDisplayBundle(
	agent: EmailDraftAgentFields,
	review: Partial<EmailDraftBundle> | null,
	sent: Partial<EmailDraftBundle> | null,
	status: string
): EmailDraftBundle {
	if (status === 'sent' || status === 'approved') {
		return mergeEmailDraftBundle(agent, sent ?? review);
	}
	if (status === 'rejected') {
		return mergeEmailDraftBundle(agent, review);
	}
	return mergeEmailDraftBundle(agent, review);
}
