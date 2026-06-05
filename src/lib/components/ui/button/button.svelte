<script lang="ts">
	import { Button as ButtonPrimitive } from "bits-ui";
	import { buttonVariants } from "./index.js";
	import { cn } from "$lib/utils.js";

	let className: string | undefined = undefined;
	export let variant: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" = "default";
	export let size: "default" | "sm" | "lg" | "icon" = "default";
	export let type: "button" | "submit" | "reset" = "button";
	export { className as class };
</script>

<ButtonPrimitive.Root
	class={cn(buttonVariants({ variant, size, className }))}
	{type}
	{...$$restProps}
	on:click
	on:keydown
>
	<slot />
</ButtonPrimitive.Root>
