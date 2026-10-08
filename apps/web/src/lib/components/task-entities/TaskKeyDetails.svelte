<!-- apps/web/src/lib/components/task-entities/TaskKeyDetails.svelte -->
<!--
	At most three things the owner needs at hand to do a task: the link to join, when the meeting
	is, where to go, the one number to call (docs/research/task-entity-layer-2026-10-07.md). A
	model marks them; everything else stays in the text, where names open their card. Renders
	nothing when no detail earns the space.
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

	let { chips, class: className = '' }: { chips: TaskEntityChip[]; class?: string } = $props();

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
</script>

{#if chips.length}
	<div
		class="flex min-w-0 flex-wrap items-center gap-1.5 {className}"
		aria-label="Key details"
		role="group"
	>
		{#each chips as chip (chip.key)}
			{@const Icon =
				chip.kind === 'time' && chip.role === 'deadline' ? CalendarClock : ICONS[chip.kind]}
			<svelte:element
				this={chip.href ? 'a' : 'span'}
				href={chip.href ?? undefined}
				target={external(chip.href) ? '_blank' : undefined}
				rel={external(chip.href) ? 'noopener noreferrer' : undefined}
				title={chip.about ? `${chip.display} · ${chip.about}` : chip.display}
				class="inline-flex min-h-8 min-w-0 max-w-full items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs leading-tight text-foreground shadow-ink {chip.href
					? 'pressable hover:border-accent/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
					: ''}"
			>
				<Icon class="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
				<span class="shrink-0 font-semibold">{chip.label}</span>
				<span class="truncate text-muted-foreground"
					>{chip.about && chip.kind !== 'meeting_link'
						? `${chip.about} · `
						: ''}{chip.display}</span
				>
			</svelte:element>
		{/each}
	</div>
{/if}
