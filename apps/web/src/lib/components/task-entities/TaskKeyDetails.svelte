<!-- apps/web/src/lib/components/task-entities/TaskKeyDetails.svelte -->
<!--
	At most three things the owner needs at hand to do a task: the link to join, when the meeting
	is, where to go, the one number to call (docs/research/task-entity-layer-2026-10-07.md). A
	model marks them; everything else stays in the text, where names open their card. A person or
	organization pill opens that card too. Renders nothing when no detail earns the space.
-->
<script lang="ts">
	import type { TaskEntityChip, TaskEntityKind } from '@buildos/shared-agent-ops/task-entities';
	import {
		Building,
		CalendarClock,
		Clock,
		Link,
		Mail,
		MapPin,
		Phone,
		User,
		Video
	} from '$lib/icons/lucide';
	import type { TaskEntities } from './task-entities.svelte';

	let {
		chips,
		entities,
		class: className = ''
	}: { chips: TaskEntityChip[]; entities: TaskEntities; class?: string } = $props();

	const cardIds = $derived(new Set(entities.cards.map((card) => card.id)));

	const ICONS: Record<TaskEntityKind, typeof Phone> = {
		meeting_link: Video,
		time: Clock,
		place: MapPin,
		person: User,
		phone: Phone,
		email: Mail,
		link: Link,
		org: Building,
		reference: Link
	};

	const external = (href: string | null) => !!href && /^https?:/i.test(href);
	const PILL =
		'inline-flex min-h-8 min-w-0 max-w-full items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs leading-tight text-foreground shadow-ink';
	const ACTIVE =
		'pressable hover:border-accent/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
</script>

{#snippet pill(chip: TaskEntityChip)}
	{@const Icon =
		chip.kind === 'time' && chip.role === 'deadline' ? CalendarClock : ICONS[chip.kind]}
	<Icon class="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
	<span class="shrink-0 font-semibold">{chip.label}</span>
	<span class="truncate text-muted-foreground"
		>{chip.about && chip.kind !== 'meeting_link' ? `${chip.about} · ` : ''}{chip.display}</span
	>
{/snippet}

{#if chips.length}
	<div
		class="flex min-w-0 flex-wrap items-center gap-1.5 {className}"
		aria-label="Key details"
		role="group"
	>
		{#each chips as chip (chip.key)}
			{@const title = chip.about ? `${chip.display} · ${chip.about}` : chip.display}
			{#if chip.href}
				<a
					href={chip.href}
					target={external(chip.href) ? '_blank' : undefined}
					rel={external(chip.href) ? 'noopener noreferrer' : undefined}
					{title}
					class="{PILL} {ACTIVE}">{@render pill(chip)}</a
				>
			{:else if chip.id && cardIds.has(chip.id)}
				{@const cardId = chip.id}
				<button
					type="button"
					aria-haspopup="dialog"
					{title}
					class="{PILL} {ACTIVE}"
					onclick={(event) => entities.openCardFor(cardId, event.currentTarget)}
					>{@render pill(chip)}</button
				>
			{:else}
				<span {title} class={PILL}>{@render pill(chip)}</span>
			{/if}
		{/each}
	</div>
{/if}
