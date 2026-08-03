<!-- apps/web/src/lib/components/admin/chat/SessionTimeWaterfall.svelte -->
<script lang="ts">
	import { Clock3, Gauge } from '$lib/icons/lucide';
	import { sessionFlowBarPosition } from '$lib/services/admin/chat-session-flow-geometry';
	import type {
		SessionFlowEvent,
		SessionFlowProfile
	} from '$lib/services/admin/chat-session-flow-profile';

	let {
		profile,
		onSelect
	}: {
		profile: SessionFlowProfile;
		onSelect: (event: SessionFlowEvent) => void | Promise<void>;
	} = $props();

	function formatElapsed(milliseconds: number): string {
		if (milliseconds < 1) return '0ms';
		if (milliseconds < 1000) return `${Math.round(milliseconds)}ms`;
		if (milliseconds < 10_000) return `${(milliseconds / 1000).toFixed(2)}s`;
		return `${(milliseconds / 1000).toFixed(1)}s`;
	}

	function categoryClasses(event: SessionFlowEvent): string {
		if (event.severity === 'error')
			return 'border-destructive bg-destructive text-destructive-foreground';
		switch (event.category) {
			case 'llm':
				return 'border-accent bg-accent text-accent-foreground';
			case 'tool':
				return 'border-success bg-success text-success-foreground';
			case 'operation':
				return 'border-info bg-info text-info-foreground';
			case 'supervisor':
				return 'border-warning bg-warning text-warning-foreground';
			default:
				return 'border-foreground bg-foreground text-background';
		}
	}

	function eventDescription(event: SessionFlowEvent): string {
		const status = event.severity === 'error' ? ', error' : '';
		return `${event.label}${status}, ${event.isPoint ? 'point event' : formatElapsed(event.durationMs)}. Select to open details.`;
	}
</script>

<div class="space-y-4 bg-muted/40 p-3 sm:p-4">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<div class="flex items-center gap-2 text-sm font-semibold text-foreground">
				<Clock3 class="h-4 w-4 shrink-0" />
				Time waterfall
			</div>
			<div class="mt-1 text-xs text-muted-foreground">
				Each turn uses its own scale so useful work is not compressed by idle gaps.
			</div>
		</div>
		<div class="flex flex-wrap gap-2 text-xs">
			<span
				class="rounded-full border border-border bg-background px-2.5 py-1 text-foreground"
			>
				{formatElapsed(profile.totalActiveDurationMs)} active turn time
			</span>
			{#if profile.slowestEvent}
				<span
					class="inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-muted-foreground"
				>
					<Gauge class="h-3.5 w-3.5 shrink-0" />
					<span class="truncate">Slowest: {profile.slowestEvent.label}</span>
					<span class="shrink-0">· {formatElapsed(profile.slowestEvent.durationMs)}</span>
				</span>
			{/if}
		</div>
	</div>

	{#if profile.turns.length === 0 || profile.events.length === 0}
		<div
			class="rounded-lg border border-dashed border-border bg-background px-4 py-8 text-center text-sm text-muted-foreground"
		>
			No timestamped flow events were recorded for this session.
		</div>
	{:else}
		<div class="space-y-3">
			{#each profile.turns as turn (turn.id)}
				{#if turn.events.length > 0}
					<section
						class="overflow-hidden rounded-lg border border-border bg-background"
						aria-label={`${turn.label} time waterfall`}
					>
						<div
							class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2"
						>
							<div class="micro-label text-foreground">
								{turn.label}
							</div>
							<div class="text-2xs text-muted-foreground">
								{turn.events.length} events · {formatElapsed(turn.durationMs)}
							</div>
						</div>
						<div
							class="overflow-x-auto overscroll-x-contain rounded-md"
							role="region"
							aria-label={`${turn.label} timeline. Scroll horizontally to inspect the full scale.`}
						>
							<div class="min-w-[720px] p-3">
								<div
									class="mb-1 grid grid-cols-[12rem_1fr_4.5rem] items-end gap-2 text-2xs text-muted-foreground"
									aria-hidden="true"
								>
									<span>Event</span>
									<div
										class="flex justify-between border-b border-border/70 pb-1"
									>
										<span>0</span>
										<span>{formatElapsed(turn.durationMs * 0.25)}</span>
										<span>{formatElapsed(turn.durationMs * 0.5)}</span>
										<span>{formatElapsed(turn.durationMs * 0.75)}</span>
										<span>{formatElapsed(turn.durationMs)}</span>
									</div>
									<span class="text-right">Duration</span>
								</div>
								<div class="space-y-1">
									{#each turn.events as event (event.id)}
										{@const position = sessionFlowBarPosition({
											start: event.startMs - turn.startMs,
											length: event.durationMs,
											total: turn.durationMs,
											minWidthPercent: 0.8,
											isPoint: event.isPoint
										})}
										<button
											type="button"
											class="pressable grid min-h-11 w-full grid-cols-[12rem_1fr_4.5rem] items-center gap-2 rounded-md px-1.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
											title={eventDescription(event)}
											aria-label={eventDescription(event)}
											onclick={() => onSelect(event)}
										>
											<span
												class="flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground"
											>
												<span class="truncate">{event.label}</span>
												{#if event.severity === 'error'}
													<span
														class="shrink-0 text-2xs font-semibold text-destructive"
														>Error</span
													>
												{/if}
											</span>
											<span
												class="relative h-7 overflow-hidden rounded-md bg-muted/70 [background-image:linear-gradient(to_right,hsl(var(--border)/0.55)_1px,transparent_1px)] [background-size:25%_100%]"
												aria-hidden="true"
											>
												<span
													class={event.isPoint
														? `absolute top-1/2 h-4 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border ${categoryClasses(event)}`
														: `absolute top-1/2 h-4 -translate-y-1/2 overflow-hidden rounded-md border px-1 text-left text-2xs font-semibold ${categoryClasses(event)}`}
													style:left={position.left}
													style:width={position.width}
												>
													{#if !event.isPoint}
														<span class="block truncate"
															>{event.label}</span
														>
													{/if}
												</span>
											</span>
											<span
												class="text-right font-mono text-2xs text-muted-foreground"
											>
												{event.isPoint
													? '—'
													: formatElapsed(event.durationMs)}
											</span>
										</button>
									{/each}
								</div>
							</div>
						</div>
					</section>
				{/if}
			{/each}
		</div>
	{/if}

	<ul
		class="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-2xs text-muted-foreground"
		aria-label="Time chart legend"
	>
		<li><span class="mr-1 inline-block h-2 w-2 rounded-full bg-accent"></span>LLM</li>
		<li><span class="mr-1 inline-block h-2 w-2 rounded-full bg-success"></span>Tool</li>
		<li><span class="mr-1 inline-block h-2 w-2 rounded-full bg-info"></span>Operation</li>
		<li><span class="mr-1 inline-block h-2 w-2 rounded-full bg-warning"></span>Supervisor</li>
		<li>
			<span class="mr-1 inline-block h-2 w-2 rounded-full bg-foreground/80"></span>Message
		</li>
	</ul>
</div>
