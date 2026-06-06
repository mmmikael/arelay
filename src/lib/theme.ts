export const THEME_KEY = 'agentRelay:theme';

export function isDarkModePreferred(): boolean {
	try {
		const savedTheme = localStorage.getItem(THEME_KEY);
		if (savedTheme) return savedTheme === 'dark';
	} catch {}
	return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyTheme(isDark: boolean): void {
	document.documentElement.classList.toggle('dark', isDark);
	document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
}

export function saveTheme(isDark: boolean): void {
	try {
		localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
	} catch {}
}
