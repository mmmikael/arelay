export const MAX_BASE64URL_FIELD_LENGTH = 512 * 1024;

export function isValidBase64Url(value: string, expectedByteLength?: number): boolean {
	if (!value || value.length > MAX_BASE64URL_FIELD_LENGTH) return false;
	try {
		const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
		const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
		const bytes = Buffer.from(padded, 'base64');
		if (expectedByteLength !== undefined && bytes.length !== expectedByteLength) {
			return false;
		}
		return bytes.length > 0;
	} catch {
		return false;
	}
}

export function base64UrlToBytes(value: string): Uint8Array {
	const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
	const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
	return new Uint8Array(Buffer.from(padded, 'base64'));
}
