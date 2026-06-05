export type PreviewKind = 'image' | 'html' | 'pdf' | 'markdown' | 'text' | 'none';

const IMAGE_TYPES = new Set([
	'image/png',
	'image/jpeg',
	'image/jpg',
	'image/gif',
	'image/webp',
	'image/svg+xml',
	'image/avif'
]);

export function previewKindFor(filename: string, contentType: string): PreviewKind {
	const lower = filename.toLowerCase();
	if (IMAGE_TYPES.has(contentType) || /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(lower)) {
		return 'image';
	}
	if (contentType === 'text/html' || /\.html?$/i.test(lower)) return 'html';
	if (contentType === 'application/pdf' || lower.endsWith('.pdf')) return 'pdf';
	if (
		contentType === 'text/markdown' ||
		contentType === 'text/x-markdown' ||
		/\.md(?:own)?$/i.test(lower)
	) {
		return 'markdown';
	}
	if (
		contentType.startsWith('text/') ||
		/\.(txt|log|json|yaml|yml|csv|ts|tsx|js|jsx|py|rs|go|css|xml)$/i.test(lower)
	) {
		return 'text';
	}
	return 'none';
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function defaultSessionTitle(date = new Date()): string {
	return date.toLocaleString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}

export function sanitizeFilename(name: string): string {
	const trimmed = name.trim().replace(/[/\\]/g, '_');
	return trimmed || 'artifact.bin';
}

export function uniqueZipFilename(filename: string, used: Set<string>): string {
	const safe = sanitizeFilename(filename);
	if (!used.has(safe)) {
		used.add(safe);
		return safe;
	}

	const dot = safe.lastIndexOf('.');
	const stem = dot > 0 ? safe.slice(0, dot) : safe;
	const ext = dot > 0 ? safe.slice(dot) : '';

	let index = 2;
	while (used.has(`${stem} (${index})${ext}`)) {
		index += 1;
	}

	const unique = `${stem} (${index})${ext}`;
	used.add(unique);
	return unique;
}

export function archiveFilenameForSession(title: string): string {
	const safe = title
		.trim()
		.replace(/[^a-zA-Z0-9._-]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 80);
	return `${safe || 'session'}.zip`;
}
