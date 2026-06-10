export const THEME_KEY = 'agentRelay:theme';

export function isDarkModePreferred(): boolean {
	try {
		const savedTheme = localStorage.getItem(THEME_KEY);
		if (savedTheme) return savedTheme === 'dark';
	} catch {}
	return window.matchMedia('(prefers-color-scheme: dark)').matches;
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
