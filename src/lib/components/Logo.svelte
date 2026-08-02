<script lang="ts">
	let className = 'w-10 h-10';
	let fill = '#172033';
	export { className as class, fill };
</script>

<svg class={`${className} logo-mark`} viewBox="0 0 256 256" fill="none" aria-hidden="true">
	<path
		{fill}
		d="M118 28 50 48c-12 4-19 15-19 28v85c0 29 18 54 37 67 16 11 33 17 50 19 5 1 8-2 8-7v-57l-46-48 46-48V36c0-5-3-9-8-8Z"
	/>
	<path
		{fill}
		d="M138 28 206 48c12 4 19 15 19 28v85c0 29-18 54-37 67-16 11-33 17-50 19-5 1-8-2-8-7v-57l46-48-46-48V36c0-5 3-9 8-8Z"
	/>
</svg>

<style>
	:global(.dark) .logo-mark path {
		fill: #f8fafc;
	}
</style>
