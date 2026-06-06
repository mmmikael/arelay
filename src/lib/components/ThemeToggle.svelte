<script lang="ts">
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';
	import { onMount } from 'svelte';
	import { applyTheme, saveTheme } from '$lib/theme';

	let darkMode = $state(false);

	function toggleTheme() {
		darkMode = !darkMode;
		applyTheme(darkMode);
		saveTheme(darkMode);
	}

	onMount(() => {
		darkMode = document.documentElement.classList.contains('dark');
	});
</script>

<button
	type="button"
	role="switch"
	aria-checked={darkMode}
	aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
	title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
	onclick={toggleTheme}
	class="inline-flex h-8 w-14 items-center rounded-full border border-slate-200 bg-slate-100 p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-800"
>
	<span
		class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm transition-transform dark:bg-blue-500 dark:text-white {darkMode
			? 'translate-x-6'
			: 'translate-x-0'}"
		aria-hidden="true"
	>
		{#if darkMode}
			<Moon class="h-3.5 w-3.5" />
		{:else}
			<Sun class="h-3.5 w-3.5" />
		{/if}
	</span>
</button>
