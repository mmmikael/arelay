<script lang="ts">
	import { AlertDialog as AlertDialogPrimitive } from "bits-ui";
	import * as AlertDialog from "./index.js";
	import { cn, flyAndScale } from "$lib/utils.js";

	type $$Props = AlertDialogPrimitive.ContentProps;

	let className: $$Props["class"] = undefined;
	export let transition: $$Props["transition"] = flyAndScale;
	export let transitionConfig: $$Props["transitionConfig"] = undefined;
	export { className as class };
</script>

<AlertDialog.Portal>
	<AlertDialog.Overlay />
	<AlertDialogPrimitive.Content
		{transition}
		{transitionConfig}
		class={cn(
			"fixed left-[50%] top-[50%] z-50 grid w-[calc(100%-2rem)] max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-lg sm:p-6 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100",
			className
		)}
		{...$$restProps}
	>
		<slot />
	</AlertDialogPrimitive.Content>
</AlertDialog.Portal>
