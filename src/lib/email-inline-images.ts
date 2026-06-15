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
const SRC_ATTRIBUTE_PATTERN = /\ssrc\s*=\s*(["'])(.*?)\1/i;
const CID_SOURCE_PATTERN = /^cid:([a-z0-9._-]+)$/i;
const EXISTING_CID_PATTERN = /\bcid:([a-z0-9._-]+)/gi;

function extensionForMimeType(type: string): string {
	return type === 'image/jpeg' || type === 'image/jpg' ? 'jpg' : type.slice('image/'.length);
}

/**
 * Convert base64 data images to CID references before outbound sanitization.
 * Browser previews can render data URLs, but major email clients commonly strip them.
 */
export function extractInlineDataImages(html: string): PreparedEmailInlineImages {
	const attachments: EmailInlineAttachment[] = [];
	const reservedContentIds = new Set(
		[...html.matchAll(EXISTING_CID_PATTERN)].map((match) => match[1].toLowerCase())
	);
	const preparedHtml = html.replace(IMG_TAG_PATTERN, (tag) => {
		const srcAttribute = tag.match(SRC_ATTRIBUTE_PATTERN);
		if (!srcAttribute) return tag;

		const dataImage = srcAttribute[2].match(DATA_IMAGE_PATTERN);
		if (!dataImage) return tag;

		const normalizedType = dataImage[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : dataImage[1].toLowerCase();
		const content = dataImage[2].replace(/\s+/g, '');
		const index = attachments.length + 1;
		let contentId = `arelay-inline-${index}`;
		let collisionSuffix = 2;
		while (reservedContentIds.has(contentId.toLowerCase())) {
			contentId = `arelay-inline-${index}-${collisionSuffix}`;
			collisionSuffix += 1;
		}
		reservedContentIds.add(contentId.toLowerCase());
		attachments.push({
			content,
			filename: `inline-image-${index}.${extensionForMimeType(normalizedType)}`,
			type: normalizedType,
			disposition: 'inline',
			content_id: contentId
		});

		return tag.replace(SRC_ATTRIBUTE_PATTERN, ` src="cid:${contentId}"`);
	});

	return { html: preparedHtml, attachments };
}

/** Restore extracted CID images for a sandboxed browser preview. */
export function restoreInlineDataImages(
	html: string,
	attachments: EmailInlineAttachment[]
): string {
	if (!attachments.length) return html;

	const attachmentsByContentId = new Map(
		attachments.map((attachment) => [attachment.content_id.toLowerCase(), attachment])
	);

	return html.replace(IMG_TAG_PATTERN, (tag) => {
		const srcAttribute = tag.match(SRC_ATTRIBUTE_PATTERN);
		if (!srcAttribute) return tag;

		const cidSource = srcAttribute[2].match(CID_SOURCE_PATTERN);
		if (!cidSource) return tag;

		const attachment = attachmentsByContentId.get(cidSource[1].toLowerCase());
		if (!attachment) return tag;

		const dataUrl = `data:${attachment.type};base64,${attachment.content}`;
		return tag.replace(SRC_ATTRIBUTE_PATTERN, ` src="${dataUrl}"`);
	});
}
