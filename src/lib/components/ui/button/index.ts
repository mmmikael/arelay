import type { Button as ButtonPrimitive } from "bits-ui";
import { type VariantProps, tv } from "tailwind-variants";
import Root from "./button.svelte";

const buttonVariants = tv({
	base: "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:pointer-events-none disabled:opacity-50",
	variants: {
		variant: {
			default: "bg-[#3b82f6] text-white hover:bg-[#2563eb] hover:-translate-y-0.5 shadow-[0_4px_20px_rgba(59,130,246,0.3)] hover:shadow-[0_8px_30px_rgba(59,130,246,0.5)]",
			destructive: "bg-red-600 text-white hover:bg-red-700 hover:-translate-y-0.5 shadow-[0_4px_20px_rgba(239,68,68,0.3)]",
			outline: "border border-[rgba(59,130,246,0.3)] bg-transparent text-gray-900 hover:bg-[rgba(59,130,246,0.1)] hover:border-[#3b82f6] dark:text-slate-100 dark:border-blue-400/30 dark:hover:bg-blue-400/10 dark:hover:border-blue-400",
			secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700",
			ghost: "hover:bg-gray-100 text-gray-700 dark:text-slate-200 dark:hover:bg-slate-800",
			link: "text-[#3b82f6] underline-offset-4 hover:underline"
		},
		size: {
			default: "h-10 px-5 py-2.5",
			sm: "h-8 rounded-lg px-3 text-xs",
			lg: "h-11 rounded-xl px-8",
			icon: "h-10 w-10"
		}
	},
	defaultVariants: {
		variant: "default",
		size: "default"
	}
});

type Variant = VariantProps<typeof buttonVariants>["variant"];
type Size = VariantProps<typeof buttonVariants>["size"];

type Props = ButtonPrimitive.Props & {
	variant?: Variant;
	size?: Size;
	builders?: ButtonPrimitive.Props["builders"];
};

type Events = ButtonPrimitive.Events;

export {
	Root,
	type Props,
	type Events,
	Root as Button,
	buttonVariants
};
