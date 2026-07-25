<!-- apps/web/src/lib/components/time-blocks/TimeRangeSelector.svelte -->
<script lang="ts">
	import {
		startOfWeek,
		endOfWeek,
		startOfMonth,
		endOfMonth,
		addWeeks,
		startOfDay,
		endOfDay
	} from 'date-fns';
	import { Calendar } from 'lucide-svelte';

	interface Props {
		dateRange: { start: Date; end: Date };
		onDateRangeChange?: (range: { start: Date; end: Date }) => void;
	}

	type PresetId = 'this_week' | 'next_week' | 'this_month' | 'custom';

	let { dateRange, onDateRangeChange }: Props = $props();

	let selectedPreset = $state<PresetId>('custom');
	let customStart = $state('');
	let customEnd = $state('');

	const rangeFormatter = new Intl.DateTimeFormat(undefined, {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});

	function toInputValue(date: Date): string {
		const year = date.getFullYear();
		const month = `${date.getMonth() + 1}`.padStart(2, '0');
		const day = `${date.getDate()}`.padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	function parseDateInput(value: string, boundary: 'start' | 'end'): Date | null {
		if (!value) return null;
		const [yearStr, monthStr, dayStr] = value.split('-');
		const year = Number(yearStr);
		const month = Number(monthStr);
		const day = Number(dayStr);
		if (
			Number.isNaN(year) ||
			Number.isNaN(month) ||
			Number.isNaN(day) ||
			month < 1 ||
			month > 12 ||
			day < 1 ||
			day > 31
		) {
			return null;
		}
		const date =
			boundary === 'start'
				? new Date(year, month - 1, day, 0, 0, 0, 0)
				: new Date(year, month - 1, day, 23, 59, 59, 999);

		return Number.isNaN(date.getTime()) ? null : date;
	}

	function normalizeRange(range: { start: Date; end: Date }) {
		return {
			start: startOfDay(range.start),
			end: endOfDay(range.end)
		};
	}

	function getPresetRange(id: PresetId): { start: Date; end: Date } {
		const now = new Date();
		const weekOptions = { weekStartsOn: 1 as const };

		if (id === 'this_week') {
			return {
				start: startOfWeek(now, weekOptions),
				end: endOfWeek(now, weekOptions)
			};
		}

		if (id === 'next_week') {
			const currentWeekStart = startOfWeek(now, weekOptions);
			const nextWeekStart = addWeeks(currentWeekStart, 1);
			return {
				start: nextWeekStart,
				end: endOfWeek(nextWeekStart, weekOptions)
			};
		}

		if (id === 'this_month') {
			return {
				start: startOfMonth(now),
				end: endOfMonth(now)
			};
		}

		return normalizeRange(dateRange);
	}

	function rangesMatch(a: { start: Date; end: Date }, b: { start: Date; end: Date }): boolean {
		return (
			startOfDay(a.start).getTime() === startOfDay(b.start).getTime() &&
			endOfDay(a.end).getTime() === endOfDay(b.end).getTime()
		);
	}

	function detectPreset(range: { start: Date; end: Date }): PresetId {
		const normalized = normalizeRange(range);

		if (rangesMatch(normalized, getPresetRange('this_week'))) {
			return 'this_week';
		}

		if (rangesMatch(normalized, getPresetRange('next_week'))) {
			return 'next_week';
		}

		if (rangesMatch(normalized, getPresetRange('this_month'))) {
			return 'this_month';
		}

		return 'custom';
	}

	function emitRange(range: { start: Date; end: Date }) {
		onDateRangeChange?.({
			start: startOfDay(range.start),
			end: endOfDay(range.end)
		});
	}

	function selectPreset(id: PresetId) {
		selectedPreset = id;

		if (id === 'custom') {
			return;
		}

		const range = getPresetRange(id);
		customStart = toInputValue(range.start);
		customEnd = toInputValue(range.end);
		emitRange(range);
	}

	function handleCustomInput(boundary: 'start' | 'end', value: string) {
		if (boundary === 'start') {
			customStart = value;
		} else {
			customEnd = value;
		}

		if (!customStart || !customEnd) {
			return;
		}

		const startDate = parseDateInput(customStart, 'start');
		const endDate = parseDateInput(customEnd, 'end');

		if (!startDate || !endDate || endDate.getTime() < startDate.getTime()) {
			return;
		}

		selectedPreset = 'custom';
		emitRange({ start: startDate, end: endDate });
	}

	function formatRangeLabel(range: { start: Date; end: Date }): string {
		return `${rangeFormatter.format(range.start)} – ${rangeFormatter.format(range.end)}`;
	}

	$effect(() => {
		selectedPreset = detectPreset(dateRange);
		customStart = toInputValue(dateRange.start);
		customEnd = toInputValue(dateRange.end);
	});
</script>

<div class="time-range-selector">
	<!-- Header -->
	<div class="selector-header">
		<div class="header-icon">
			<Calendar class="h-5 w-5" />
		</div>
		<div class="header-content">
			<h3 class="header-title">Time range</h3>
			<p class="header-subtitle">{formatRangeLabel(dateRange)}</p>
		</div>
	</div>

	<!-- Preset Buttons -->
	<div class="preset-grid">
		{#each [{ id: 'this_week', label: 'This week', icon: '📅' }, { id: 'next_week', label: 'Next week', icon: '⏭' }, { id: 'this_month', label: 'This month', icon: '📆' }, { id: 'custom', label: 'Custom', icon: '✏️' }] as preset (preset.id)}
			<button
				type="button"
				class="preset-button"
				class:selected={selectedPreset === preset.id}
				onclick={() => selectPreset(preset.id as PresetId)}
			>
				<span class="preset-icon" aria-hidden="true">{preset.icon}</span>
				<span class="preset-label">{preset.label}</span>
			</button>
		{/each}
	</div>

	<!-- Custom Date Inputs (shown when Custom is selected) -->
	{#if selectedPreset === 'custom'}
		<div class="custom-range">
			<div class="input-group">
				<label for="range-start" class="input-label">Start date</label>
				<input
					id="range-start"
					type="date"
					class="date-input"
					bind:value={customStart}
					onchange={(event) => handleCustomInput('start', event.currentTarget.value)}
				/>
			</div>
			<div class="input-group">
				<label for="range-end" class="input-label">End date</label>
				<input
					id="range-end"
					type="date"
					class="date-input"
					bind:value={customEnd}
					onchange={(event) => handleCustomInput('end', event.currentTarget.value)}
				/>
			</div>
		</div>
	{/if}
</div>

<style>
	/* ========================================
	   MAIN CONTAINER - Apple-inspired
	   ======================================== */
	.time-range-selector {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0.875rem 1rem;
		background: hsl(var(--card));
		border-radius: 0;
		transition: all 0.2s ease;
	}

	@media (min-width: 768px) {
		.time-range-selector {
			padding: 1rem 1.25rem;
			gap: 1rem;
		}
	}

	/* ========================================
	   HEADER - Clean title with icon
	   ======================================== */
	.selector-header {
		display: flex;
		align-items: center;
		gap: 0.625rem;
	}

	.header-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 0.375rem;
		background: hsl(var(--accent) / 0.1);
		color: hsl(var(--accent));
		flex-shrink: 0;
	}

	.header-content {
		flex: 1;
		min-width: 0;
	}

	.header-title {
		font-size: 0.8125rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		margin: 0;
		line-height: 1.3;
	}

	@media (min-width: 768px) {
		.header-title {
			font-size: 0.875rem;
		}
	}

	.header-subtitle {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
		margin: 0.125rem 0 0;
		line-height: 1.4;
	}

	/* ========================================
	   PRESET GRID - 2x2 on mobile, 4x1 on desktop
	   ======================================== */
	.preset-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.5rem;
	}

	@media (min-width: 640px) {
		.preset-grid {
			grid-template-columns: repeat(4, 1fr);
			gap: 0.625rem;
		}
	}

	/* ========================================
	   PRESET BUTTONS - Apple-style cards
	   ======================================== */
	.preset-button {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		padding: 0.5rem 0.375rem;
		border-radius: 0.5rem;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--muted) / 0.45);
		color: hsl(var(--muted-foreground));
		font-size: 0.6875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
		position: relative;
		overflow: hidden;
	}

	@media (min-width: 768px) {
		.preset-button {
			padding: 0.625rem 0.5rem;
			gap: 0.375rem;
			font-size: 0.75rem;
		}
	}

	.preset-button::before {
		content: '';
		position: absolute;
		inset: 0;
		background: hsl(var(--accent) / 0);
		opacity: 0;
		transition: opacity 0.2s ease;
	}

	.preset-button:hover {
		border-color: hsl(var(--accent) / 0.45);
		background: hsl(var(--accent) / 0.08);
		transform: translateY(-2px);
		box-shadow: var(--shadow-ink-strong);
	}

	.preset-button:hover::before {
		opacity: 1;
	}

	.preset-button:active {
		transform: translateY(-1px);
	}

	.preset-button.selected {
		border-color: hsl(var(--accent));
		background: hsl(var(--accent));
		color: hsl(var(--accent-foreground));
		box-shadow: var(--shadow-ink-strong);
	}

	.preset-button.selected:hover {
		background: hsl(var(--accent) / 0.9);
		transform: translateY(-2px);
	}

	.preset-icon {
		font-size: 1rem;
		line-height: 1;
		display: block;
	}

	@media (min-width: 768px) {
		.preset-icon {
			font-size: 1.125rem;
		}
	}

	.preset-label {
		font-weight: 600;
		letter-spacing: 0.01em;
	}

	/* ========================================
	   CUSTOM RANGE INPUTS
	   ======================================== */
	.custom-range {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.75rem;
		padding: 0.875rem;
		border-radius: 0.5rem;
		background: hsl(var(--muted) / 0.45);
		border: 1px solid hsl(var(--border));
		animation: slideDown 0.25s cubic-bezier(0.4, 0, 0.2, 1);
	}

	@media (min-width: 640px) {
		.custom-range {
			grid-template-columns: repeat(2, 1fr);
			gap: 1rem;
		}
	}

	@keyframes slideDown {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* ========================================
	   INPUT GROUPS
	   ======================================== */
	.input-group {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.input-label {
		font-size: 0.6875rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		letter-spacing: 0.01em;
	}

	.date-input {
		padding: 0.5rem 0.75rem;
		border-radius: 0.5rem;
		border: 1px solid hsl(var(--border-strong));
		background: hsl(var(--background));
		color: hsl(var(--foreground));
		font-size: 0.8125rem;
		font-weight: 500;
		transition: all 0.15s ease;
	}

	.date-input:hover {
		border-color: hsl(var(--accent) / 0.55);
	}

	.date-input:focus {
		outline: none;
		border-color: hsl(var(--accent));
		box-shadow:
			0 0 0 3px hsl(var(--ring) / 0.15),
			var(--shadow-ink);
	}

	/* ========================================
	   ACCESSIBILITY & REDUCED MOTION
	   ======================================== */
	@media (prefers-reduced-motion: reduce) {
		.time-range-selector,
		.preset-button,
		.custom-range,
		.date-input {
			animation: none;
			transition: none;
		}
	}

	.preset-button:focus-visible,
	.date-input:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: 2px;
	}
</style>
