/** Strict sandbox for HTML/markdown/text srcdoc previews. No scripts, forms, or popups. */
export const STRICT_PREVIEW_SANDBOX = '';

/** Blob PDF previews need same-origin access; scripts remain blocked. */
export const PDF_PREVIEW_SANDBOX = 'allow-same-origin';

export const PREVIEW_REFERRER_POLICY = 'no-referrer' as const;
