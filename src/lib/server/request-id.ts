import { randomUUID } from 'node:crypto';

const MAX_REQUEST_ID_LENGTH = 128;
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]+$/;

export function resolveRequestId(request: Request): string {
	const incoming = request.headers.get('x-request-id')?.trim();
	if (
		incoming &&
		incoming.length > 0 &&
		incoming.length <= MAX_REQUEST_ID_LENGTH &&
		SAFE_REQUEST_ID.test(incoming)
	) {
		return incoming;
	}
	return randomUUID();
}
