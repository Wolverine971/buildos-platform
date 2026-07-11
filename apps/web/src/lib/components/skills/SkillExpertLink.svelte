<!-- apps/web/src/lib/components/skills/SkillExpertLink.svelte -->
<script lang="ts">
	import { getSkillExpertPath, type ResolvedSkillExpert } from '$lib/skills/skill-experts';

	let { person }: { person: ResolvedSkillExpert } = $props();
	let initials = $derived(
		person.name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part.charAt(0).toUpperCase())
			.join('')
	);
</script>

{#if person.profile}
	<a
		href={getSkillExpertPath(person.profile)}
		class="group inline-flex min-h-[44px] min-w-0 items-center gap-2 rounded-md border border-border bg-background px-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
	>
		<img
			src={person.profile.portrait.src}
			alt=""
			width="28"
			height="28"
			loading="lazy"
			decoding="async"
			class="h-7 w-7 shrink-0 rounded-full border border-border object-cover shadow-ink"
		/>
		<span class="truncate">{person.name}</span>
	</a>
{:else}
	<span
		class="inline-flex min-h-[44px] min-w-0 items-center gap-2 rounded-md border border-border bg-background px-2.5 text-sm font-medium text-muted-foreground"
	>
		<span
			aria-hidden="true"
			class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-2xs font-semibold text-muted-foreground"
		>
			{initials}
		</span>
		<span class="truncate">{person.name}</span>
	</span>
{/if}
