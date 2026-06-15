export type EmailInlineAttachment = {
	content: string;
	filename: string;
	type: string;
	disposition: 'inline';
	content_id: string;
};

export type PreparedEmailInlineImages = {
	html: string;
	attachments: EmailInlineAttachment[];
};

const DATA_IMAGE_PATTERN =
	/^data:(image\/(?:png|jpeg|jpg|gif|webp));base64,([a-z0-9+/=\s]+)$/i;
const IMG_TAG_PATTERN = /<img\b[^>]*>/gi;
const SRC_ATTRIBUTE_PATTERN = /\bsrc\s*=\s*(["'])(.*?)\1/i;

function extensionForMimeType(type: string): string {
	return type === 'image/jpeg' || type === 'image/jpg' ? 'jpg' : type.slice('image/'.length);
}

/**
 * Convert base64 data images to CID references before outbound sanitization.
 * Browser previews can render data URLs, but major email clients commonly strip them.
 */
export function extractInlineDataImages(html: string): PreparedEmailInlineImages {
	const attachments: EmailInlineAttachment[] = [];
	const preparedHtml = html.replace(IMG_TAG_PATTERN, (tag) => {
		const srcAttribute = tag.match(SRC_ATTRIBUTE_PATTERN);
		if (!srcAttribute) return tag;

		const dataImage = srcAttribute[2].match(DATA_IMAGE_PATTERN);
		if (!dataImage) return tag;

		const normalizedType = dataImage[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : dataImage[1].toLowerCase();
		const content = dataImage[2].replace(/\s+/g, '');
		const index = attachments.length + 1;
		const contentId = `arelay-inline-${index}`;
		attachments.push({
			content,
			filename: `inline-image-${index}.${extensionForMimeType(normalizedType)}`,
			type: normalizedType,
			disposition: 'inline',
			content_id: contentId
		});

		return tag.replace(SRC_ATTRIBUTE_PATTERN, `src="cid:${contentId}"`);
	});

	return { html: preparedHtml, attachments };
}
