<!-- apps/web/src/lib/components/ui/CardBody.svelte -->
<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { twMerge } from 'tailwind-merge';

	type BodyPadding = 'sm' | 'md' | 'lg';

	interface $$Props extends HTMLAttributes<HTMLDivElement> {
		padding?: BodyPadding;
		class?: string;
	}

	export let padding: BodyPadding = 'md';

	let className = '';
	export { className as class };

	const paddingClasses = {
		sm: 'px-3 sm:px-4 py-3 sm:py-4',
		md: 'px-4 sm:px-5 md:px-6 py-4 sm:py-5 md:py-6',
		lg: 'px-6 sm:px-8 md:px-10 py-6 sm:py-8 md:py-10'
	};

	$: bodyClasses = twMerge(paddingClasses[padding], className);
</script>

<div class={bodyClasses} {...$$restProps}>
	<slot />
</div>
