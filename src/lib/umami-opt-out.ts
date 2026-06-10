export const UMAMI_OPT_OUT_KEY = 'agentRelay:excludeAnalytics';

export function isUmamiOptedOut(): boolean {
	try {
		return (
			localStorage.getItem(UMAMI_OPT_OUT_KEY) === '1' ||
			Boolean(localStorage.getItem('umami.disabled'))
		);
	} catch {
		return false;
	}
}

/** Keep Umami's opt-out flag in sync with our durable local key. */
export function syncUmamiOptOut(): boolean {
	const optedOut = isUmamiOptedOut();
	try {
		if (optedOut) {
			localStorage.setItem(UMAMI_OPT_OUT_KEY, '1');
			localStorage.setItem('umami.disabled', '1');
		} else if (localStorage.getItem(UMAMI_OPT_OUT_KEY) === '0') {
			localStorage.removeItem('umami.disabled');
		}
	} catch {
		/* private mode / blocked storage */
	}
	return optedOut;
}

export function setUmamiOptOut(exclude: boolean): void {
	try {
		if (exclude) {
			localStorage.setItem(UMAMI_OPT_OUT_KEY, '1');
			localStorage.setItem('umami.disabled', '1');
		} else {
			localStorage.setItem(UMAMI_OPT_OUT_KEY, '0');
			localStorage.removeItem('umami.disabled');
		}
	} catch {
		/* private mode / blocked storage */
	}
}
