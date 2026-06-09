import type { RequestEvent } from '@sveltejs/kit';

export function getRequestClientIp(event: Pick<RequestEvent, 'getClientAddress'>): string {
	return event.getClientAddress();
}
