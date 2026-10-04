<!-- apps/web/src/lib/components/skills/SkillExpertMonogram.svelte -->
<script lang="ts">
	// Expert profiles show initials, never a photo or a generated likeness: we have no license to
	// publish these people's faces, and the name is always printed next to the mark.
	let { name, size = 'sm' }: { name: string; size?: 'sm' | 'md' | 'lg' } = $props();

	let initials = $derived(
		name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part.charAt(0).toUpperCase())
			.join('')
	);

	const sizeClasses = {
		sm: 'h-7 w-7 rounded-full text-2xs',
		md: 'h-16 w-16 rounded-md text-lg',
		lg: 'aspect-square w-full max-w-48 rounded-lg text-5xl'
	} as const;
</script>

<span
	aria-hidden="true"
	class="flex shrink-0 select-none items-center justify-center border border-border bg-muted font-semibold tracking-wide text-muted-foreground shadow-ink {sizeClasses[
		size
	]}"
>
	{initials}
</span>
