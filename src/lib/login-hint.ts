const LAST_LOGIN_EMAIL_KEY = 'agentRelay:lastLoginEmail';
const LAST_LOGIN_CREDENTIAL_ID_KEY = 'agentRelay:lastLoginCredentialId';

export function saveLastLoginEmail(email: string): void {
	try {
		localStorage.setItem(LAST_LOGIN_EMAIL_KEY, email.trim().toLowerCase());
	} catch {}
}

export function readLastLoginEmail(): string | null {
	try {
		const email = localStorage.getItem(LAST_LOGIN_EMAIL_KEY)?.trim().toLowerCase();
		return email || null;
	} catch {
		return null;
	}
}

export function saveLastLoginCredentialId(credentialId: string): void {
	try {
		localStorage.setItem(LAST_LOGIN_CREDENTIAL_ID_KEY, credentialId);
	} catch {}
}

export function readLastLoginCredentialId(): string | null {
	try {
		const credentialId = localStorage.getItem(LAST_LOGIN_CREDENTIAL_ID_KEY)?.trim();
		return credentialId || null;
	} catch {
		return null;
	}
}

export function clearLoginHints(): void {
	try {
		localStorage.removeItem(LAST_LOGIN_EMAIL_KEY);
		localStorage.removeItem(LAST_LOGIN_CREDENTIAL_ID_KEY);
	} catch {}
}
