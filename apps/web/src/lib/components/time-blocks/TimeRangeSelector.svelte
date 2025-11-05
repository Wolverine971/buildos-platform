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
		background: white;
		border-radius: 0;
		transition: all 0.2s ease;
	}

	@media (min-width: 768px) {
		.time-range-selector {
			padding: 1rem 1.25rem;
			gap: 1rem;
		}
	}

	:global(.dark) .time-range-selector {
		background: rgb(15 23 42);
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
		background: linear-gradient(135deg, rgb(59 130 246 / 0.1), rgb(99 102 241 / 0.1));
		color: rgb(59 130 246);
		flex-shrink: 0;
	}

	:global(.dark) .header-icon {
		background: linear-gradient(135deg, rgb(59 130 246 / 0.15), rgb(99 102 241 / 0.15));
		color: rgb(96 165 250);
	}

	.header-content {
		flex: 1;
		min-width: 0;
	}

	.header-title {
		font-size: 0.8125rem;
		font-weight: 600;
		color: rgb(15 23 42);
		margin: 0;
		line-height: 1.3;
	}

	@media (min-width: 768px) {
		.header-title {
			font-size: 0.875rem;
		}
	}

	:global(.dark) .header-title {
		color: rgb(248 250 252);
	}

	.header-subtitle {
		font-size: 0.6875rem;
		color: rgb(100 116 139);
		margin: 0.125rem 0 0;
		line-height: 1.4;
	}

	:global(.dark) .header-subtitle {
		color: rgb(148 163 184);
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
		border: 1px solid rgb(226 232 240);
		background: rgb(248 250 252);
		color: rgb(71 85 105);
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
		background: linear-gradient(135deg, rgb(59 130 246 / 0), rgb(99 102 241 / 0));
		opacity: 0;
		transition: opacity 0.2s ease;
	}

	.preset-button:hover {
		border-color: rgb(147 197 253);
		background: rgb(239 246 255);
		transform: translateY(-2px);
		box-shadow:
			0 4px 12px rgb(59 130 246 / 0.15),
			0 2px 4px rgb(59 130 246 / 0.08);
	}

	.preset-button:hover::before {
		opacity: 1;
	}

	.preset-button:active {
		transform: translateY(-1px);
	}

	.preset-button.selected {
		border-color: rgb(59 130 246);
		background: linear-gradient(135deg, rgb(59 130 246), rgb(37 99 235));
		color: white;
		box-shadow:
			0 4px 12px rgb(59 130 246 / 0.3),
			0 2px 4px rgb(59 130 246 / 0.2);
	}

	.preset-button.selected:hover {
		background: linear-gradient(135deg, rgb(37 99 235), rgb(29 78 216));
		transform: translateY(-2px);
	}

	:global(.dark) .preset-button {
		background: rgb(30 41 59);
		border-color: rgb(51 65 85);
		color: rgb(203 213 225);
	}

	:global(.dark) .preset-button:hover {
		background: rgb(51 65 85);
		border-color: rgb(71 85 105);
	}

	:global(.dark) .preset-button.selected {
		background: linear-gradient(135deg, rgb(37 99 235), rgb(29 78 216));
		border-color: rgb(59 130 246);
		color: white;
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
		background: linear-gradient(135deg, rgb(248 250 252), rgb(241 245 249));
		border: 1px solid rgb(226 232 240);
		animation: slideDown 0.25s cubic-bezier(0.4, 0, 0.2, 1);
	}

	@media (min-width: 640px) {
		.custom-range {
			grid-template-columns: repeat(2, 1fr);
			gap: 1rem;
		}
	}

	:global(.dark) .custom-range {
		background: linear-gradient(135deg, rgb(30 41 59), rgb(15 23 42));
		border-color: rgb(51 65 85);
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
		color: rgb(71 85 105);
		letter-spacing: 0.01em;
	}

	:global(.dark) .input-label {
		color: rgb(148 163 184);
	}

	.date-input {
		padding: 0.5rem 0.75rem;
		border-radius: 0.5rem;
		border: 1px solid rgb(203 213 225);
		background: white;
		color: rgb(15 23 42);
		font-size: 0.8125rem;
		font-weight: 500;
		transition: all 0.15s ease;
	}

	.date-input:hover {
		border-color: rgb(147 197 253);
	}

	.date-input:focus {
		outline: none;
		border-color: rgb(59 130 246);
		box-shadow:
			0 0 0 3px rgb(59 130 246 / 0.1),
			0 1px 2px rgb(0 0 0 / 0.05);
	}

	:global(.dark) .date-input {
		background: rgb(15 23 42);
		border-color: rgb(71 85 105);
		color: rgb(226 232 240);
	}

	:global(.dark) .date-input:hover {
		border-color: rgb(100 116 139);
	}

	:global(.dark) .date-input:focus {
		border-color: rgb(59 130 246);
		box-shadow:
			0 0 0 3px rgb(59 130 246 / 0.15),
			0 1px 2px rgb(0 0 0 / 0.1);
	}

	/* ========================================
	   ACCESSIBILITY & REDUCED MOTION
	   ======================================== */
	@media (prefers-reduced-motion: reduce) {
		.time-range-selector,
		.preset-button,
		.custom-range,
		.date-input {
			animation-duration: 0.01ms !important;
			transition-duration: 0.01ms !important;
		}
	}

	.preset-buttonfocus-visible,
	.date-input:focus-visible {
		outline: 2px solid rgb(59 130 246);
		outline-offset: 2px;
	}

	:global(.dark) .preset-buttonfocus-visible,
	:global(.dark) .date-input:focus-visible {
		outline-color: rgb(96 165 250);
	}
</style>
