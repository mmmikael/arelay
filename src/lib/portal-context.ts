export const ENSURE_E2EE_UNLOCK_KEY = Symbol('ensureE2eeUnlock');

export type EnsureE2eeUnlock = () => Promise<boolean>;
