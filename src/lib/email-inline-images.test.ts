import { describe, expect, it } from 'vitest';
import { extractInlineDataImages, restoreInlineDataImages } from './email-inline-images';

describe('extractInlineDataImages', () => {
	it('converts embedded data images to CID attachments', () => {
		const result = extractInlineDataImages(
			'<p><img src="data:image/jpeg;base64,aGVsbG8=" width="400" alt="Preview"></p>'
		);

		expect(result.html).toContain('src="cid:arelay-inline-1"');
		expect(result.html).not.toContain('data:image');
		expect(result.attachments).toEqual([
			{
				content: 'aGVsbG8=',
				filename: 'inline-image-1.jpg',
				type: 'image/jpeg',
				disposition: 'inline',
				content_id: 'arelay-inline-1'
			}
		]);
	});

	it('leaves remote and malformed image sources unchanged', () => {
		const html = '<img src="https://example.com/image.png"><img src="data:text/plain;base64,aGk=">';

		expect(extractInlineDataImages(html)).toEqual({ html, attachments: [] });
	});

	it('does not treat data-src as the rendered image source', () => {
		const html = '<img data-src="data:image/png;base64,aGk=" src="https://example.com/image.png">';

		expect(extractInlineDataImages(html)).toEqual({ html, attachments: [] });
	});

	it('assigns a distinct CID to each embedded image', () => {
		const result = extractInlineDataImages(
			'<img src=\'data:image/png;base64,aGk=\'><img src="data:image/webp;base64,aG8=">'
		);

		expect(result.html).toContain('cid:arelay-inline-1');
		expect(result.html).toContain('cid:arelay-inline-2');
		expect(result.attachments.map((attachment) => attachment.content_id)).toEqual([
			'arelay-inline-1',
			'arelay-inline-2'
		]);
	});

	it('avoids colliding with CID references already present in the draft', () => {
		const result = extractInlineDataImages(
			'<img src="cid:arelay-inline-1"><img src="data:image/png;base64,aGk=">'
		);

		expect(result.html).toContain('src="cid:arelay-inline-1-2"');
		expect(result.attachments[0].content_id).toBe('arelay-inline-1-2');
	});
});

describe('restoreInlineDataImages', () => {
	it('restores only matching img src CID references', () => {
		const attachments = [
			{
				content: 'aGVsbG8=',
				filename: 'inline-image-1.jpg',
				type: 'image/jpeg',
				disposition: 'inline' as const,
				content_id: 'arelay-inline-1'
			}
		];
		const html = '<img src="cid:arelay-inline-1"><a href="cid:arelay-inline-1">link</a>';
		const restored = restoreInlineDataImages(html, attachments);

		expect(restored).toContain('src="data:image/jpeg;base64,aGVsbG8="');
		expect(restored).toContain('href="cid:arelay-inline-1"');
	});
});
