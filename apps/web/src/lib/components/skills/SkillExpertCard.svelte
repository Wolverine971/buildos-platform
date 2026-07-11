<!-- apps/web/src/lib/components/skills/SkillExpertCard.svelte -->
<script lang="ts">
	import { ArrowRight } from '$lib/icons/lucide';
	import { getSkillExpertPath, type SkillExpertProfile } from '$lib/skills/skill-experts';

	let { expert }: { expert: SkillExpertProfile } = $props();
</script>

<article class="overflow-hidden rounded-md border border-border bg-background">
	<div class="flex min-w-0 items-start gap-3 p-3">
		<img
			src={expert.portrait.src}
			alt={expert.portrait.alt}
			width="64"
			height="64"
			loading="lazy"
			class="h-16 w-16 shrink-0 rounded-md border border-border object-cover shadow-ink"
		/>
		<div class="min-w-0 flex-1">
			<p class="truncate font-semibold text-foreground">{expert.name}</p>
			<p class="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
				{expert.headline}
			</p>
		</div>
	</div>

	<div class="border-t border-border px-3 py-3">
		<p class="micro-label">Why BuildOS listens</p>
		<p class="mt-1.5 text-sm leading-6 text-muted-foreground">{expert.cardReason}</p>
		<div class="mt-3 flex flex-wrap gap-1.5">
			{#each expert.specialties.slice(0, 2) as specialty}
				<span
					class="rounded-full border border-border bg-card px-2 py-1 text-xs font-medium text-muted-foreground"
				>
					{specialty}
				</span>
			{/each}
		</div>
	</div>

	<a
		href={getSkillExpertPath(expert)}
		class="group flex min-h-[44px] items-center justify-between gap-3 border-t border-border px-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent/10 hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
	>
		<span>View profile and sources</span>
		<ArrowRight
			class="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
		/>
	</a>
</article>
