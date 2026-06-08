/** Markdown/text srcdoc previews. No scripts, forms, or popups. */
export const STRICT_PREVIEW_SANDBOX = '';

/**
 * HTML artifact previews: allow-same-origin so cross-origin @font-face (Google Fonts) can load.
 * Scripts remain blocked (no allow-scripts token).
 */
export const HTML_ARTIFACT_PREVIEW_SANDBOX = 'allow-same-origin';

/** Blob PDF previews need same-origin access; scripts remain blocked. */
export const PDF_PREVIEW_SANDBOX = 'allow-same-origin';

export const PREVIEW_REFERRER_POLICY = 'no-referrer' as const;

/** Google Fonts and similar CDNs often expect a normal Referer on the CSS request. */
export const HTML_PREVIEW_REFERRER_POLICY = 'strict-origin-when-cross-origin' as const;
