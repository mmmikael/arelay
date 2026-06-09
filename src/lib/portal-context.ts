export const ENSURE_E2EE_UNLOCK_KEY = Symbol('ensureE2eeUnlock');
export const OPEN_E2EE_DIALOG_KEY = Symbol('openE2eeDialog');
export const SESSION_UPDATED_AT_LOOKUP_KEY = Symbol('sessionUpdatedAtLookup');

export type EnsureE2eeUnlock = () => Promise<boolean>;
export type OpenE2eeDialog = () => void;
export type SessionUpdatedAtLookup = (sessionId: string) => string | Date | undefined;
