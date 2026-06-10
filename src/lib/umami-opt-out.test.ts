import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	isUmamiOptedOut,
	setUmamiOptOut,
	syncUmamiOptOut,
	UMAMI_OPT_OUT_KEY
} from './umami-opt-out';

function createStorage(): Storage {
	const store = new Map<string, string>();
	return {
		get length() {
			return store.size;
		},
		clear: () => store.clear(),
		getItem: (key: string) => store.get(key) ?? null,
		key: (index: number) => [...store.keys()][index] ?? null,
		removeItem: (key: string) => {
			store.delete(key);
		},
		setItem: (key: string, value: string) => {
			store.set(key, value);
		}
	};
}

describe('umami-opt-out', () => {
	beforeEach(() => {
		vi.stubGlobal('localStorage', createStorage());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('treats either storage key as opted out', () => {
		localStorage.setItem('umami.disabled', '1');
		expect(isUmamiOptedOut()).toBe(true);

		localStorage.removeItem('umami.disabled');
		localStorage.setItem(UMAMI_OPT_OUT_KEY, '1');
		expect(isUmamiOptedOut()).toBe(true);
	});

	it('restores umami.disabled from the durable key before tracking', () => {
		localStorage.setItem(UMAMI_OPT_OUT_KEY, '1');
		expect(syncUmamiOptOut()).toBe(true);
		expect(localStorage.getItem('umami.disabled')).toBe('1');
	});

	it('backfills the durable key when only umami.disabled is set', () => {
		localStorage.setItem('umami.disabled', 'true');
		expect(syncUmamiOptOut()).toBe(true);
		expect(localStorage.getItem(UMAMI_OPT_OUT_KEY)).toBe('1');
		expect(localStorage.getItem('umami.disabled')).toBe('1');
	});

	it('clears umami.disabled when opt-out is explicitly disabled', () => {
		setUmamiOptOut(true);
		setUmamiOptOut(false);
		expect(localStorage.getItem(UMAMI_OPT_OUT_KEY)).toBe('0');
		expect(localStorage.getItem('umami.disabled')).toBeNull();
	});
});
