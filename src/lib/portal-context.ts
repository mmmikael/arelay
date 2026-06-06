export const ENSURE_E2EE_UNLOCK_KEY = Symbol('ensureE2eeUnlock');
export const OPEN_E2EE_DIALOG_KEY = Symbol('openE2eeDialog');

export type EnsureE2eeUnlock = () => Promise<boolean>;
export type OpenE2eeDialog = () => void;
