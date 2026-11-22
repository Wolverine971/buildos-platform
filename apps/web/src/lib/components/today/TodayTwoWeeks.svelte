<!-- apps/web/src/lib/components/today/TodayTwoWeeks.svelte -->
<!-- The calendar at a glance: this week and the next, Sunday to Saturday, with a short chip
     per event. A day opens under the grid with full titles, times and links. In a narrow
     column (phones, or beside an open task) chips become dots and the day list does the
     reading. -->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowUpRight, ExternalLink } from '$lib/icons/lucide';
	import { WEEKDAY_LABELS, type TwoWeekDay } from './today-two-weeks';

	let {
		days,
		compact = false,
		projectNameOf,
		onOpenTask
	}: {
		/** Fourteen days starting on a Sunday. */
		days: TwoWeekDay[];
		/** Narrow screens open on the next day that has something, since dots carry no titles. */
		compact?: boolean;
		projectNameOf: (projectId: string | null) => string | null;
		onOpenTask: (taskId: string, projectId: string | null) => void;
	} = $props();

	const weeks = $derived([days.slice(0, 7), days.slice(7, 14)]);
	const upcomingCount = $derived(
		days.reduce((count, day) => (day.isPast ? count : count + day.events.length), 0)
	);

	// undefined = the person hasn't picked; null = they closed the day list.
	let picked = $state<string | null | undefined>(undefined);
	const selectedDate = $derived(
		picked !== undefined
			? picked
			: compact
				? (days.find((day) => !day.isPast && day.events.length > 0)?.date ?? null)
				: null
	);
	const selected = $derived(days.find((day) => day.date === selectedDate) ?? null);

	function toggle(date: string) {
		picked = selectedDate === date ? null : date;
	}

	/** Three fit in a cell; a fourth turns the last slot into "+2 more". */
	function visibleCount(total: number): number {
		return total <= 3 ? total : 2;
	}

	function dayAria(day: TwoWeekDay): string {
		const count = day.events.length;
		const what = count === 0 ? 'nothing booked' : count === 1 ? '1 event' : `${count} events`;
		return `${day.label}${day.isToday ? ', today' : ''}: ${what}`;
	}
</script>

<section class="two-weeks mt-5" aria-label="Calendar, this week and next">
	<div class="mb-2 flex items-center gap-2">
		<h2 class="text-sm font-medium text-foreground">Calendar</h2>
		<span class="min-w-0 flex-1 truncate text-xs text-muted-foreground">
			{upcomingCount === 0 ? 'Nothing booked through next week' : 'This week and next'}
		</span>
		<a
			href={resolve('/dashboard/calendar')}
			data-sveltekit-preload-code="hover"
			class="inline-flex min-h-6 shrink-0 items-center gap-1 rounded-lg text-xs text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			Full calendar <ArrowUpRight class="h-3 w-3" aria-hidden="true" />
		</a>
	</div>

	<div class="grid-wrap">
		<div class="weekdays" aria-hidden="true">
			{#each WEEKDAY_LABELS as weekday (weekday)}
				<span>{weekday}</span>
			{/each}
		</div>
		{#each weeks as week, weekIndex (weekIndex)}
			<div class="week">
				{#each week as day (day.date)}
					{@const shown = visibleCount(day.events.length)}
					<button
						type="button"
						class={[
							'day',
							{
								today: day.isToday,
								past: day.isPast,
								selected: selectedDate === day.date
							}
						]}
						aria-pressed={selectedDate === day.date}
						aria-label={dayAria(day)}
						onclick={() => toggle(day.date)}
					>
						<span class="date">
							{#if day.month}<span class="month">{day.month}</span>{/if}
							<span class="num">{day.dayOfMonth}</span>
						</span>
						<span class="chips">
							{#each day.events.slice(0, shown) as event (event.id)}
								<span
									class="chip"
									style:--chip={event.color}
									title="{event.when} · {event.title}"
								>
									{#if event.time}<span class="time">{event.time}</span>{/if}
									<span class="name">{event.title}</span>
								</span>
							{/each}
							{#if day.events.length > shown}
								<span class="more">+{day.events.length - shown} more</span>
							{/if}
						</span>
						<span class="dots">
							{#each day.events.slice(0, 3) as event (event.id)}
								<span class="dot" style:--chip={event.color}></span>
							{/each}
							{#if day.events.length > 3}
								<span class="more">+{day.events.length - 3}</span>
							{/if}
						</span>
					</button>
				{/each}
			</div>
		{/each}
	</div>

	{#if selected}
		<div class="detail" aria-live="polite">
			<p class="text-xs font-medium text-foreground">
				{selected.label}{selected.isToday ? ' · Today' : ''}
			</p>
			{#if selected.events.length === 0}
				<p class="mt-1 text-xs text-muted-foreground">Nothing booked</p>
			{:else}
				<ul class="mt-1">
					{#each selected.events as event (event.id)}
						{@const projectName = projectNameOf(event.projectId)}
						<li>
							<span class="dot" style:--chip={event.color} aria-hidden="true"></span>
							<span class="when">{event.when}</span>
							<span class="what">
								<span class="text-foreground [overflow-wrap:anywhere]"
									>{event.title}</span
								>
								{#if event.source || projectName}
									<span class="where">
										{#if projectName && event.projectId}
											<a
												href={resolve('/projects/[id]', {
													id: event.projectId
												})}
												class="underline decoration-border-strong underline-offset-2 hover:text-foreground"
												>{projectName}</a
											>
										{:else if event.source}
											{event.source}
										{/if}
									</span>
								{/if}
							</span>
							{#if event.taskId}
								<button
									type="button"
									class="act"
									onclick={() => onOpenTask(event.taskId!, event.projectId)}
									>Open task</button
								>
							{/if}
							{#if event.href}
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the event's page in Google Calendar, not a route in this app -->
								<a
									class="act"
									href={event.href}
									target="_blank"
									rel="noopener noreferrer"
									aria-label="Open {event.title} in Google Calendar"
								>
									<ExternalLink class="h-3 w-3" aria-hidden="true" />
								</a>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</section>

<style>
	.two-weeks {
		container-type: inline-size;
	}
	.grid-wrap {
		overflow: hidden;
		border-radius: 12px;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--card));
	}
	.weekdays,
	.week {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
	}
	.weekdays {
		border-bottom: 1px solid hsl(var(--border));
	}
	.weekdays span {
		padding: 4px 6px;
		font-size: 11px;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
	}
	.week + .week {
		border-top: 1px solid hsl(var(--border));
	}
	.day {
		display: flex;
		min-width: 0;
		min-height: 72px;
		flex-direction: column;
		gap: 4px;
		padding: 4px;
		text-align: left;
		transition: background-color 150ms cubic-bezier(0.22, 1, 0.36, 1);
	}
	.day + .day {
		border-left: 1px solid hsl(var(--border) / 0.7);
	}
	.day:hover,
	.day.selected {
		background: hsl(var(--muted) / 0.6);
	}
	.day:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: -2px;
	}
	.day.past .chips,
	.day.past .dots,
	.day.past .date {
		opacity: 0.5;
	}
	.date {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 0 2px;
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		color: hsl(var(--muted-foreground));
	}
	.num {
		display: inline-flex;
		min-width: 20px;
		height: 20px;
		align-items: center;
		justify-content: center;
		border-radius: 999px;
	}
	.day.today .num {
		background: hsl(var(--accent));
		padding: 0 4px;
		font-weight: 600;
		color: hsl(var(--accent-foreground));
	}
	.chips {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 2px;
	}
	.chip {
		--chip: hsl(var(--accent));
		display: flex;
		min-width: 0;
		gap: 4px;
		border-left: 2px solid var(--chip);
		border-radius: 4px;
		background: color-mix(in srgb, var(--chip) 14%, transparent);
		padding: 1px 4px;
		font-size: 11px;
		line-height: 16px;
		color: hsl(var(--foreground));
	}
	.chip .time {
		flex: none;
		font-variant-numeric: tabular-nums;
		color: hsl(var(--muted-foreground));
	}
	.chip .name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.more {
		padding: 0 4px;
		font-size: 11px;
		line-height: 16px;
		color: hsl(var(--muted-foreground));
	}
	.dots {
		display: none;
		flex-wrap: wrap;
		align-items: center;
		gap: 3px;
		padding: 0 2px;
	}
	.dot {
		--chip: hsl(var(--accent));
		width: 6px;
		height: 6px;
		flex: none;
		border-radius: 999px;
		background: var(--chip);
	}
	.dots .more {
		padding: 0;
		font-size: 10px;
	}

	/* Today's own column is about 580px: the title matters more than the hour there, and
	   the hour is one click away in the day list. */
	@container (max-width: 699px) {
		.chip .time {
			display: none;
		}
	}

	/* Narrow column: titles don't fit a 45px cell, so days show dots and the list reads. */
	@container (max-width: 519px) {
		.day {
			min-height: 52px;
			align-items: center;
			padding: 4px 2px;
		}
		.date {
			flex-direction: column;
			gap: 0;
			padding: 0;
		}
		.month {
			font-size: 9px;
			line-height: 10px;
		}
		.chips {
			display: none;
		}
		.dots {
			display: flex;
			justify-content: center;
		}
		.weekdays span {
			padding: 4px 0;
			text-align: center;
		}
	}

	.detail {
		margin-top: 8px;
		border-radius: 12px;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--card));
		padding: 8px 12px;
	}
	.detail li {
		display: flex;
		min-width: 0;
		align-items: baseline;
		gap: 8px;
		padding: 4px 0;
		font-size: 13px;
	}
	.detail li + li {
		border-top: 1px solid hsl(var(--border) / 0.7);
	}
	.detail .dot {
		align-self: center;
	}
	.when {
		flex: none;
		font-size: 12px;
		font-variant-numeric: tabular-nums;
		color: hsl(var(--muted-foreground));
	}
	.what {
		display: flex;
		min-width: 0;
		flex: 1;
		flex-wrap: wrap;
		align-items: baseline;
		column-gap: 8px;
	}
	.where {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 12px;
		color: hsl(var(--muted-foreground));
	}
	.act {
		display: inline-flex;
		min-height: 24px;
		flex: none;
		align-items: center;
		align-self: center;
		border-radius: 8px;
		padding: 0 6px;
		font-size: 12px;
		color: hsl(var(--muted-foreground));
	}
	.act:hover {
		background: hsl(var(--muted));
		color: hsl(var(--foreground));
	}
	.act:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: 1px;
	}
	@media (prefers-reduced-motion: reduce) {
		.day {
			transition: none;
		}
	}
</style>
