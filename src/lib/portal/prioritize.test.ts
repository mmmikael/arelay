import { describe, expect, it } from 'vitest';
import { prioritizeBySessionIds } from './prioritize';

describe('prioritizeBySessionIds', () => {
	it('returns the original order when no priorities are provided', () => {
		const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
		expect(prioritizeBySessionIds(items, [])).toEqual(items);
	});

	it('places priority sessions first while preserving list order for the rest', () => {
		const items = [
			{ id: 'a', label: 'A' },
			{ id: 'b', label: 'B' },
			{ id: 'c', label: 'C' },
			{ id: 'd', label: 'D' }
		];

		expect(prioritizeBySessionIds(items, ['c', 'a', 'missing'])).toEqual([
			{ id: 'c', label: 'C' },
			{ id: 'a', label: 'A' },
			{ id: 'b', label: 'B' },
			{ id: 'd', label: 'D' }
		]);
	});

	it('deduplicates repeated priority ids', () => {
		const items = [{ id: 'a' }, { id: 'b' }];
		expect(prioritizeBySessionIds(items, ['b', 'b', 'a'])).toEqual([
			{ id: 'b' },
			{ id: 'a' }
		]);
	});
});
