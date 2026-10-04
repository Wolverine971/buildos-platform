<!-- apps/web/src/lib/components/skills/SkillExpertLink.svelte -->
<script lang="ts">
	import { getSkillExpertPath, type ResolvedSkillExpert } from '$lib/skills/skill-experts';
	import SkillExpertMonogram from './SkillExpertMonogram.svelte';

	let { person }: { person: ResolvedSkillExpert } = $props();
</script>

{#if person.profile}
	<a
		href={getSkillExpertPath(person.profile)}
		class="group inline-flex min-h-[44px] min-w-0 items-center gap-2 rounded-md border border-border bg-background px-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
	>
		<SkillExpertMonogram name={person.name} />
		<span class="truncate">{person.name}</span>
	</a>
{:else}
	<span
		class="inline-flex min-h-[44px] min-w-0 items-center gap-2 rounded-md border border-border bg-background px-2.5 text-sm font-medium text-muted-foreground"
	>
		<SkillExpertMonogram name={person.name} />
		<span class="truncate">{person.name}</span>
	</span>
{/if}
