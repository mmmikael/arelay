export const THEME_KEY = 'agentRelay:theme';

export function isDarkModePreferred(): boolean {
	try {
		const savedTheme = localStorage.getItem(THEME_KEY);
		// Dark is the default; only an explicit 'light' opts out.
		return savedTheme !== 'light';
	} catch {}
	return true;
}

export function applyTheme(isDark: boolean): void {
	const root = document.documentElement;
	root.classList.add('theme-transition-disabled');
	root.classList.toggle('dark', isDark);
	root.style.colorScheme = isDark ? 'dark' : 'light';
	requestAnimationFrame(() => {
		root.classList.remove('theme-transition-disabled');
	});
}

export function saveTheme(isDark: boolean): void {
	try {
		localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
	} catch {}
}
