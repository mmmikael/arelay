import { describe, expect, it } from 'vitest';
import {
	archiveFilenameForSession,
	formatBytes,
	previewKindFor,
	sanitizeFilename,
	uniqueZipFilename
} from './artifacts';

describe('previewKindFor', () => {
	it('detects images by content type and extension', () => {
		expect(previewKindFor('chart.png', 'image/png')).toBe('image');
		expect(previewKindFor('photo.JPG', 'application/octet-stream')).toBe('image');
	});

	it('detects html, pdf, markdown, and text', () => {
		expect(previewKindFor('page.html', 'text/html')).toBe('html');
		expect(previewKindFor('doc.pdf', 'application/pdf')).toBe('pdf');
		expect(previewKindFor('notes.md', 'text/markdown')).toBe('markdown');
		expect(previewKindFor('readme.txt', 'text/plain')).toBe('text');
	});

	it('returns none for unknown types', () => {
		expect(previewKindFor('archive.zip', 'application/zip')).toBe('none');
	});
});

describe('sanitizeFilename', () => {
	it('strips path separators and falls back for empty names', () => {
		expect(sanitizeFilename('  report.md  ')).toBe('report.md');
		expect(sanitizeFilename('nested/path/file.txt')).toBe('nested_path_file.txt');
		expect(sanitizeFilename('   ')).toBe('artifact.bin');
	});
});

describe('uniqueZipFilename', () => {
	it('deduplicates filenames in a zip archive', () => {
		const used = new Set<string>();
		expect(uniqueZipFilename('report.md', used)).toBe('report.md');
		expect(uniqueZipFilename('report.md', used)).toBe('report (2).md');
		expect(uniqueZipFilename('report.md', used)).toBe('report (3).md');
	});
});

describe('formatBytes', () => {
	it('formats byte sizes', () => {
		expect(formatBytes(512)).toBe('512 B');
		expect(formatBytes(2048)).toBe('2.0 KB');
		expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
	});
});

describe('archiveFilenameForSession', () => {
	it('sanitizes session titles for zip downloads', () => {
		expect(archiveFilenameForSession('Weekly report')).toBe('Weekly_report.zip');
		expect(archiveFilenameForSession('  !!!  ')).toBe('session.zip');
	});
});
