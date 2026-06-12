const CONTENT_TYPES: Record<string, string> = {
	md: 'text/markdown',
	markdown: 'text/markdown',
	txt: 'text/plain',
	log: 'text/plain',
	html: 'text/html',
	htm: 'text/html',
	json: 'application/json',
	csv: 'text/csv',
	tsv: 'text/tab-separated-values',
	xml: 'application/xml',
	yaml: 'application/yaml',
	yml: 'application/yaml',
	pdf: 'application/pdf',
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	svg: 'image/svg+xml',
	webp: 'image/webp',
	js: 'text/javascript',
	mjs: 'text/javascript',
	ts: 'text/plain',
	py: 'text/plain',
	css: 'text/css',
	zip: 'application/zip',
	gz: 'application/gzip'
};

export function guessContentType(filename: string): string {
	const ext = filename.toLowerCase().split('.').pop() ?? '';
	return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}
