<!-- apps/web/src/lib/components/admin/model-incidents/IncidentTimelineChart.svelte -->
<!--
	Bytes received over the life of one model call: a step line of the running
	total, the longest silence shaded, and the call's events as vertical rules.
	Hover reads out the time, the bytes so far, and the nearest event.
-->
<script lang="ts">
	import type { IncidentEvent } from '$lib/services/admin/model-incidents/types';
	import { longestSilence, seconds } from '$lib/services/admin/model-incidents/story';

	let {
		bytes,
		events,
		streamed = true
	}: {
		bytes: Array<[number, number]>;
		events: IncidentEvent[];
		/** False for one-shot JSON replies: the body lands at once, so gaps mean nothing. */
		streamed?: boolean;
	} = $props();

	const EVENT_LABELS: Record<string, string> = {
		request_sent: 'Sent',
		response_opened: 'Response opened',
		first_byte: 'First bytes',
		stall: 'Stall detected',
		attempt_aborted: 'We hung up',
		attempt_ended: 'Attempt ended',
		request_failed: 'Request failed',
		drain_started: 'Left running',
		drain_skipped: 'Not left running',
		drain_ended: 'Finished in background',
		stream_end: 'Stream ended',
		stream_error: 'Stream broke'
	};
	/** Events drawn as rules; the rest are in the hover readout and the event table. */
	const RULED = new Set(['response_opened', 'stall', 'attempt_ended', 'drain_ended']);

	const HEIGHT = 240;
	const LABEL_ROW = 16;
	const LABEL_ROWS = 3;
	const PAD = { top: 12 + LABEL_ROW * LABEL_ROWS, right: 16, bottom: 28, left: 56 };
	const plotHeight = HEIGHT - PAD.top - PAD.bottom;
	/** Approximate width of one 11px monospace character, for label placement. */
	const CHAR_PX = 6.7;

	// Drawn at the container's pixel width so text stays 11px at any size.
	let width = $state(800);
	const plotWidth = $derived(Math.max(120, width - PAD.left - PAD.right));

	/** Where the recording stops: the end of the background run, or of the attempt. */
	const recordEndMs = $derived(
		(
			events.find((event) => event.event === 'drain_ended') ??
			events.find((event) => event.event === 'attempt_ended')
		)?.at_ms ?? null
	);
	const domainMs = $derived(
		Math.max(1_000, ...events.map((event) => event.at_ms), ...bytes.map(([at]) => at))
	);
	const maxBytes = $derived(Math.max(1, ...bytes.map(([, total]) => total)));
	const silence = $derived.by(() => {
		if (!streamed) return null;
		const gap = longestSilence(bytes, recordEndMs);
		return gap && gap.toMs - gap.fromMs >= 1_000 ? gap : null;
	});

	function eventLabel(name: string): string {
		return EVENT_LABELS[name] ?? name.replace(/_/g, ' ');
	}

	const x = (ms: number) => PAD.left + (Math.min(ms, domainMs) / domainMs) * plotWidth;
	const y = (total: number) => PAD.top + plotHeight - (total / maxBytes) * plotHeight;

	const path = $derived.by(() => {
		if (!bytes.length) return '';
		let d = `M ${x(0)} ${y(0)}`;
		let previous = 0;
		for (const [at, total] of bytes) {
			d += ` H ${x(at)} V ${y(total)}`;
			previous = total;
		}
		const lastAt = bytes.at(-1)![0];
		return `${d} H ${x(Math.max(lastAt, recordEndMs ?? lastAt))} V ${y(previous)}`;
	});

	const ticks = $derived.by(() => {
		const step = [1, 2, 5, 10, 15, 30, 60].find((s) => domainMs / (s * 1000) <= 8) ?? 120;
		const out: number[] = [];
		for (let ms = 0; ms <= domainMs; ms += step * 1000) out.push(ms);
		return out;
	});

	/** Rule labels placed left to right in the first row with room, so none overlap. */
	const ruled = $derived.by(() => {
		const rowEnds = new Array<number>(LABEL_ROWS).fill(-Infinity);
		return events
			.filter((event) => RULED.has(event.event))
			.sort((a, b) => a.at_ms - b.at_ms)
			.map((event) => {
				const label = `${eventLabel(event.event)} · ${seconds(event.at_ms)}`;
				const labelWidth = label.length * CHAR_PX;
				const at = x(event.at_ms);
				const anchorEnd = at + labelWidth > width - PAD.right;
				const start = anchorEnd ? at - labelWidth : at;
				let row = rowEnds.findIndex((end) => end + 8 <= start);
				if (row === -1) row = rowEnds.indexOf(Math.min(...rowEnds));
				rowEnds[row] = anchorEnd ? at : at + labelWidth;
				return { ...event, label, row, anchorEnd };
			});
	});

	const formatBytes = (value: number) =>
		value >= 10_000 ? `${(value / 1000).toFixed(0)} kB` : `${value.toLocaleString('en-US')} B`;

	let hoverMs = $state<number | null>(null);
	let svgElement = $state<SVGSVGElement | null>(null);

	const readout = $derived.by(() => {
		if (hoverMs === null) return null;
		const at = hoverMs;
		let total = 0;
		for (const [sampleAt, sampleTotal] of bytes) {
			if (sampleAt > at) break;
			total = sampleTotal;
		}
		const nearest = events.reduce<IncidentEvent | null>(
			(best, event) =>
				Math.abs(event.at_ms - at) <= domainMs * 0.02 &&
				(!best || Math.abs(event.at_ms - at) < Math.abs(best.at_ms - at))
					? event
					: best,
			null
		);
		return { at, total, nearest };
	});

	function pointerToMs(clientX: number): number | null {
		if (!svgElement) return null;
		const box = svgElement.getBoundingClientRect();
		const viewX = clientX - box.left;
		if (viewX < PAD.left || viewX > width - PAD.right) return null;
		return ((viewX - PAD.left) / plotWidth) * domainMs;
	}
</script>

<figure class="space-y-2">
	<!-- Hover readout is a mouse aid; the event table below carries the same facts. -->
	<div
		class="relative"
		role="presentation"
		bind:clientWidth={width}
		onpointermove={(event) => (hoverMs = pointerToMs(event.clientX))}
		onpointerleave={() => (hoverMs = null)}
	>
		<svg
			bind:this={svgElement}
			viewBox="0 0 {width} {HEIGHT}"
			{width}
			height={HEIGHT}
			class="block select-none"
			role="img"
			aria-label="Bytes received over {seconds(domainMs)}: {formatBytes(
				maxBytes
			)} in total{silence
				? `, longest silence ${seconds(silence.toMs - silence.fromMs)}`
				: ''}"
		>
			{#if silence}
				<rect
					x={x(silence.fromMs)}
					y={PAD.top}
					width={Math.max(1, x(silence.toMs) - x(silence.fromMs))}
					height={plotHeight}
					class="chart-silence"
				/>
				<text
					x={(x(silence.fromMs) + x(silence.toMs)) / 2}
					y={PAD.top + plotHeight - 8}
					text-anchor="middle"
					class="chart-label">silent {seconds(silence.toMs - silence.fromMs)}</text
				>
			{/if}

			<line x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} class="chart-axis" />
			<line
				x1={PAD.left}
				x2={width - PAD.right}
				y1={y(maxBytes)}
				y2={y(maxBytes)}
				class="chart-grid"
			/>
			{#if bytes.length}
				<text x={PAD.left - 8} y={y(maxBytes) + 4} text-anchor="end" class="chart-label"
					>{formatBytes(maxBytes)}</text
				>
			{/if}
			<text x={PAD.left - 8} y={y(0) + 4} text-anchor="end" class="chart-label">0</text>
			{#each ticks as tick (tick)}
				<text x={x(tick)} y={HEIGHT - 8} text-anchor="middle" class="chart-label"
					>{Math.round(tick / 1000)} s</text
				>
			{/each}

			{#each ruled as event (`${event.event}-${event.at_ms}`)}
				<line
					x1={x(event.at_ms)}
					x2={x(event.at_ms)}
					y1={16 + event.row * LABEL_ROW}
					y2={PAD.top + plotHeight}
					class={event.event === 'stall' ? 'chart-rule-stall' : 'chart-rule'}
				/>
				<text
					x={x(event.at_ms)}
					y={12 + event.row * LABEL_ROW}
					text-anchor={event.anchorEnd ? 'end' : 'start'}
					class="chart-label">{event.label}</text
				>
			{/each}

			{#if path}
				<path d={path} class="chart-line" />
			{:else}
				<text
					x={PAD.left + plotWidth / 2}
					y={PAD.top + plotHeight / 2}
					text-anchor="middle"
					class="chart-label">No bytes arrived</text
				>
			{/if}

			{#if readout}
				<line
					x1={x(readout.at)}
					x2={x(readout.at)}
					y1={PAD.top}
					y2={PAD.top + plotHeight}
					class="chart-crosshair"
				/>
				<circle cx={x(readout.at)} cy={y(readout.total)} r="4" class="chart-dot" />
			{/if}
		</svg>
		{#if readout}
			<div
				class="pointer-events-none absolute top-1 rounded-md border border-border bg-card px-2 py-1 text-xs shadow-ink"
				style="left: {Math.min(78, (x(readout.at) / width) * 100)}%"
			>
				<span class="stamp">{seconds(readout.at)}</span> ·
				<span class="stamp">{formatBytes(readout.total)}</span> so far
				{#if readout.nearest}
					<span class="block text-muted-foreground"
						>{eventLabel(readout.nearest.event)}</span
					>
				{/if}
			</div>
		{/if}
	</div>
	<figcaption class="text-xs text-muted-foreground">
		{#if streamed}
			Running total of bytes received, seconds after the request was sent.
			{#if silence}The shaded stretch is the longest silence in the recording.{/if}
		{:else}
			This job does not stream: the whole reply arrives at once when the model finishes.
		{/if}
	</figcaption>
</figure>

<style>
	.chart-line {
		fill: none;
		stroke: hsl(var(--accent));
		stroke-width: 2;
		stroke-linejoin: round;
	}
	.chart-silence {
		fill: hsl(var(--warning) / 0.1);
	}
	.chart-axis {
		stroke: hsl(var(--border-strong));
		stroke-width: 1;
	}
	.chart-grid {
		stroke: hsl(var(--border));
		stroke-width: 1;
		stroke-dasharray: 2 4;
	}
	.chart-rule {
		stroke: hsl(var(--muted-foreground) / 0.6);
		stroke-width: 1;
		stroke-dasharray: 3 3;
	}
	.chart-rule-stall {
		stroke: hsl(var(--warning));
		stroke-width: 1.5;
		stroke-dasharray: 4 3;
	}
	.chart-crosshair {
		stroke: hsl(var(--foreground) / 0.4);
		stroke-width: 1;
	}
	.chart-dot {
		fill: hsl(var(--accent));
		stroke: hsl(var(--card));
		stroke-width: 2;
	}
	.chart-label {
		fill: hsl(var(--muted-foreground));
		font-size: 11px;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
	}
</style>
