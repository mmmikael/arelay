import { describe, expect, it } from 'vitest';
import { buildSessionActivityLines, formatActivityTimestamp } from './session-activity';

describe('formatActivityTimestamp', () => {
	it('formats same-day timestamps as Today', () => {
		const now = new Date();
		expect(formatActivityTimestamp(now)).toMatch(/^Today /);
	});
});

describe('buildSessionActivityLines', () => {
	it('lists session creation and file additions', () => {
		const createdAt = new Date('2026-06-10T21:40:00');
		const lines = buildSessionActivityLines({
			sessionCreatedAt: createdAt,
			artifacts: [
				{ id: 'artifact-1', filename: 'welcome-guide.md' },
				{ id: 'artifact-2', filename: 'onboarding-checklist.html' }
			]
		});

		expect(lines).toEqual([
			{
				key: 'session-created',
				label: 'Session created',
				detail: formatActivityTimestamp(createdAt)
			},
			{ key: 'file-artifact-1', label: 'File added', detail: 'welcome-guide.md' },
			{ key: 'file-artifact-2', label: 'File added', detail: 'onboarding-checklist.html' }
		]);
	});

	it('prefers email draft activity for draft sessions', () => {
		const sessionCreatedAt = new Date('2026-06-10T21:40:00');
		const draftCreatedAt = new Date('2026-06-10T21:41:00');
		const lines = buildSessionActivityLines({
			sessionCreatedAt,
			artifacts: [],
			emailDraftCreatedAt: draftCreatedAt
		});

		expect(lines).toHaveLength(2);
		expect(lines[1]).toEqual({
			key: 'email-draft',
			label: 'Email draft submitted',
			detail: formatActivityTimestamp(draftCreatedAt)
		});
	});

	it('uses stable keys when multiple files share the same display name', () => {
		const createdAt = new Date('2026-06-10T21:40:00');
		const lines = buildSessionActivityLines({
			sessionCreatedAt: createdAt,
			artifacts: [
				{ id: 'artifact-a', filename: 'Encrypted file' },
				{ id: 'artifact-b', filename: 'Encrypted file' }
			]
		});

		expect(lines.map((line) => line.key)).toEqual([
			'session-created',
			'file-artifact-a',
			'file-artifact-b'
		]);
	});
});
