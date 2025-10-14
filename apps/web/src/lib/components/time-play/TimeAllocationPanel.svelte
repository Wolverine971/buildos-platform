<!-- apps/web/src/lib/components/time-play/TimeAllocationPanel.svelte -->
<script lang="ts">
	import type { TimeAllocation } from '@buildos/shared-types';
	import {
		BUILD_BLOCK_COLOR_HEX,
		DEFAULT_PROJECT_COLOR_HEX,
		resolveProjectColor
	} from '$lib/utils/time-block-colors';
	import {
		startOfWeek,
		endOfWeek,
		startOfMonth,
		endOfMonth,
		addWeeks,
		startOfDay,
		endOfDay
	} from 'date-fns';

	interface Props {
		allocation: TimeAllocation | null;
		isLoading?: boolean;
		dateRange: { start: Date; end: Date };
		onDateRangeChange?: (range: { start: Date; end: Date }) => void;
	}

	type PresetId = 'this_week' | 'next_week' | 'this_month' | 'custom';

	let { allocation = null, isLoading = false, dateRange, onDateRangeChange }: Props = $props();

	let selectedPreset = $state<PresetId>('custom');
	let customStart = $state('');
	let customEnd = $state('');

	const hourFormatter = new Intl.NumberFormat(undefined, {
		maximumFractionDigits: 1
	});
	const percentageFormatter = new Intl.NumberFormat(undefined, {
		maximumFractionDigits: 1
	});

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

	function toSafeNumber(value: unknown, fallback = 0): number {
		if (typeof value === 'number') {
			return Number.isFinite(value) ? value : fallback;
		}

		if (typeof value === 'string' && value.trim() !== '') {
			const parsed = Number.parseFloat(value);
			return Number.isFinite(parsed) ? parsed : fallback;
		}

		return fallback;
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

	function formatHours(value: number | string): string {
		const hours = toSafeNumber(value);
		return `${hourFormatter.format(hours)}h`;
	}

	function formatPercentage(value: number | string): string {
		const safeValue = toSafeNumber(value);
		return `${percentageFormatter.format(safeValue)}%`;
	}

	function formatBlockCount(count: number): string {
		return count === 1 ? '1 block' : `${count} blocks`;
	}

	function formatRangeLabel(range: { start: Date; end: Date }): string {
		return `${rangeFormatter.format(range.start)} – ${rangeFormatter.format(range.end)}`;
	}

	const totalHours = $derived(() => toSafeNumber(allocation?.total_hours));
	const buildBlockHours = $derived(() => toSafeNumber(allocation?.build_block_hours));

	const enrichedAllocations = $derived(() => {
		if (!allocation) return [];
		return allocation.project_allocations.map((project) => {
			const hours = toSafeNumber(project.hours);
			const percentage = toSafeNumber(project.percentage);
			const blockCount = Math.max(0, Math.round(toSafeNumber(project.block_count, 0)));

			return {
				...project,
				hours,
				percentage,
				block_count: blockCount,
				color: resolveProjectColor(project.project_color ?? null)
			};
		});
	});

	const buildBlockPercentage = $derived(() => {
		if (!allocation || totalHours <= 0) return 0;
		return toSafeNumber((buildBlockHours / totalHours) * 100);
	});

	const chartGradient = $derived(() => {
		if (!allocation || totalHours <= 0) {
			return 'conic-gradient(#e2e8f0 0deg, #e2e8f0 360deg)';
		}

		let offset = 0;
		const segments: string[] = [];

		for (const project of allocation.project_allocations) {
			const projectHours = toSafeNumber(project.hours);
			if (projectHours <= 0) continue;
			const percent = toSafeNumber((projectHours / totalHours) * 100);
			const start = offset;
			offset += percent;
			segments.push(
				`${resolveProjectColor(project.project_color ?? null)} ${start}% ${Math.min(offset, 100)}%`
			);
		}

		if (allocation.build_block_hours > 0) {
			const percent = toSafeNumber((buildBlockHours / totalHours) * 100);
			const start = offset;
			offset += percent;
			segments.push(`${BUILD_BLOCK_COLOR_HEX} ${start}% ${Math.min(offset, 100)}%`);
		}

		if (segments.length === 0) {
			return 'conic-gradient(#e2e8f0 0deg, #e2e8f0 360deg)';
		}

		if (offset < 100) {
			segments.push(`#e2e8f0 ${offset}% 100%`);
		}

		return `conic-gradient(${segments.join(', ')})`;
	});

	const hasData = $derived(
		() =>
			allocation !== null &&
			(totalHours > 0 || buildBlockHours > 0 || enrichedAllocations.length > 0)
	);

	$effect(() => {
		selectedPreset = detectPreset(dateRange);
		customStart = toInputValue(dateRange.start);
		customEnd = toInputValue(dateRange.end);
	});
</script>

<div class="time-allocation-panel">
	<header class="panel__header">
		<div class="panel__title">
			<h3>Time allocation</h3>
			<p>{formatRangeLabel(dateRange)}</p>
		</div>

		<div class="panel__preset-buttons">
			{#each [{ id: 'this_week', label: 'This week' }, { id: 'next_week', label: 'Next week' }, { id: 'this_month', label: 'This month' }, { id: 'custom', label: 'Custom range' }] as preset (preset.id)}
				<button
					type="button"
					class="panel__preset-button"
					class:selected={selectedPreset === preset.id}
					on:click={() => selectPreset(preset.id as PresetId)}
				>
					{preset.label}
				</button>
			{/each}
		</div>

		{#if selectedPreset === 'custom'}
			<div class="panel__custom-range">
				<label>
					Start date
					<input
						type="date"
						bind:value={customStart}
						on:change={(event) => handleCustomInput('start', event.currentTarget.value)}
					/>
				</label>
				<label>
					End date
					<input
						type="date"
						bind:value={customEnd}
						on:change={(event) => handleCustomInput('end', event.currentTarget.value)}
					/>
				</label>
			</div>
		{/if}
	</header>

	{#if isLoading}
		<div class="flex flex-col items-center justify-center gap-3 py-16 text-center">
			<div
				class="h-10 w-10 animate-spin rounded-full border-[3px] border-slate-300 border-t-blue-500 dark:border-slate-700 dark:border-t-blue-400"
			></div>
			<p class="text-sm font-medium text-slate-600 dark:text-slate-300">
				Calculating your time allocation…
			</p>
		</div>
	{:else if !hasData}
		<div
			class="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300/60 bg-slate-50/70 p-8 text-center dark:border-slate-700/60 dark:bg-slate-900/40"
		>
			<p class="text-sm font-semibold text-slate-700 dark:text-slate-200">
				No focus blocks scheduled in this range yet.
			</p>
			<p class="text-xs text-slate-500 dark:text-slate-400">
				Add a time block to see how your projects split your focus.
			</p>
		</div>
	{:else}
		<div class="panel__content">
			<div class="panel__visual">
				<div class="panel__chart-shell">
					<div class="panel__chart" style={`background: ${chartGradient}`}></div>
					<div class="panel__chart-core">
						<p>{formatHours(totalHours)}</p>
						<span>Total hours</span>
					</div>
				</div>
				<div class="panel__legend">
					<div class="panel__legend-item">
						<span style={`background: ${DEFAULT_PROJECT_COLOR_HEX}`}></span>
						Projects
					</div>
					<div class="panel__legend-item">
						<span style={`background: ${BUILD_BLOCK_COLOR_HEX}`}></span>
						Build blocks
					</div>
				</div>
			</div>

			<div class="panel__stats-grid">
				<div class="panel__stat-card panel__stat-card--blue">
					<p class="panel__stat-label">Build block focus</p>
					<div class="panel__stat-values">
						<span class="panel__stat-primary">{formatHours(buildBlockHours)}</span>
						<span class="panel__stat-secondary"
							>{formatPercentage(buildBlockPercentage)}</span
						>
					</div>
				</div>
				<div class="panel__stat-card panel__stat-card--neutral">
					<p class="panel__stat-label">Projects covered</p>
					<div class="panel__stat-values">
						<span class="panel__stat-primary">
							{allocation?.project_allocations.length ?? 0}
						</span>
					</div>
					<p class="panel__stat-hint">
						{allocation?.project_allocations.length === 1
							? 'project receiving focus'
							: 'projects receiving focus'}
					</p>
				</div>
			</div>
		</div>

		<div class="panel__breakdown">
			<div class="panel__breakdown-header">
				<h4>Project breakdown</h4>
			</div>
			<ul class="panel__breakdown-list">
				{#each enrichedAllocations as project (project.project_id)}
					<li
						class="panel__breakdown-item"
						data-testid={`allocation-project-${project.project_id}`}
					>
						<div class="panel__breakdown-meta">
							<span class="panel__indicator" style={`background: ${project.color}`}
							></span>
							<div>
								<p class="panel__breakdown-name">{project.project_name}</p>
								<p class="panel__breakdown-sub">
									{formatBlockCount(project.block_count)}
								</p>
							</div>
						</div>
						<div class="panel__breakdown-values">
							<span class="panel__breakdown-hours">{formatHours(project.hours)}</span>
							<span class="panel__breakdown-percent"
								>{formatPercentage(project.percentage)}</span
							>
						</div>
					</li>
				{/each}

				{#if buildBlockHours > 0}
					<li class="panel__breakdown-item panel__breakdown-item--build">
						<div class="panel__breakdown-meta">
							<span
								class="panel__indicator"
								style={`background: ${BUILD_BLOCK_COLOR_HEX}`}
							></span>
							<div>
								<p class="panel__breakdown-name">Build blocks</p>
								<p class="panel__breakdown-sub">Flexible focus across projects</p>
							</div>
						</div>
						<div class="panel__breakdown-values">
							<span class="panel__breakdown-hours"
								>{formatHours(buildBlockHours)}</span
							>
							<span class="panel__breakdown-percent"
								>{formatPercentage(buildBlockPercentage)}</span
							>
						</div>
					</li>
				{/if}
			</ul>
		</div>
	{/if}
</div>

<style>
	.time-allocation-panel {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		padding: 1.25rem 1.5rem;
	}

	@media (min-width: 768px) {
		.time-allocation-panel {
			padding: 1.5rem 2rem;
		}
	}

	.panel__header {
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
	}

	@media (min-width: 1024px) {
		.panel__header {
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
			gap: 1.5rem;
		}
	}

	.panel__title h3 {
		font-size: 1rem;
		font-weight: 600;
		color: #111827;
		margin: 0;
	}

	@media (min-width: 768px) {
		.panel__title h3 {
			font-size: 1.0625rem;
		}
	}

	:global(.dark) .panel__title h3 {
		color: #f8fafc;
	}

	.panel__title p {
		margin: 0.25rem 0 0;
		font-size: 0.8125rem;
		color: #64748b;
	}

	:global(.dark) .panel__title p {
		color: rgba(226, 232, 240, 0.7);
	}

	.panel__preset-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.panel__preset-button {
		border-radius: 9999px;
		border: 1px solid rgba(148, 163, 184, 0.45);
		padding: 0.45rem 1rem;
		font-size: 0.75rem;
		font-weight: 600;
		line-height: 1;
		color: #475569;
		background: rgba(255, 255, 255, 0.9);
		transition: all 0.2s ease;
		cursor: pointer;
	}

	.panel__preset-button:hover {
		border-color: rgba(59, 130, 246, 0.4);
		color: #1d4ed8;
		box-shadow: 0 6px 16px rgba(59, 130, 246, 0.18);
	}

	.panel__preset-button.selected {
		background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
		border-color: transparent;
		color: white;
		box-shadow: 0 10px 22px rgba(99, 102, 241, 0.35);
	}

	:global(.dark) .panel__preset-button {
		background: rgba(15, 23, 42, 0.75);
		color: rgba(226, 232, 240, 0.85);
		border-color: rgba(148, 163, 184, 0.3);
	}

	.panel__custom-range {
		display: grid;
		gap: 0.75rem;
		padding: 0.9rem;
		border-radius: 1.25rem;
		background: rgba(226, 232, 240, 0.45);
		border: 1px dashed rgba(148, 163, 184, 0.4);
	}

	.panel__custom-range label {
		display: flex;
		flex-direction: column;
		font-size: 0.75rem;
		font-weight: 600;
		color: #475569;
		gap: 0.4rem;
	}

	.panel__custom-range input {
		border-radius: 0.9rem;
		border: 1px solid rgba(148, 163, 184, 0.45);
		padding: 0.55rem 0.9rem;
		font-size: 0.85rem;
		background: rgba(255, 255, 255, 0.92);
		color: #0f172a;
		box-shadow: inset 0 1px 3px rgba(15, 23, 42, 0.08);
	}

	.panel__custom-range input:focus-visible {
		outline: 2px solid rgba(59, 130, 246, 0.35);
		outline-offset: 2px;
	}

	:global(.dark) .panel__custom-range {
		background: rgba(30, 41, 59, 0.6);
		border-color: rgba(59, 130, 246, 0.25);
	}

	.panel__content {
		display: grid;
		gap: 1.25rem;
		grid-template-columns: 1fr;
	}

	@media (min-width: 768px) {
		.panel__content {
			grid-template-columns: auto 1fr;
			align-items: center;
			gap: 2rem;
		}
	}

	@media (min-width: 1280px) {
		.panel__content {
			gap: 3rem;
		}
	}

	.panel__visual {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.875rem;
	}

	@media (min-width: 768px) {
		.panel__visual {
			flex-direction: row;
			gap: 1.25rem;
		}
	}

	.panel__chart-shell {
		position: relative;
		height: 9rem;
		width: 9rem;
		flex-shrink: 0;
		border-radius: 9999px;
		background: linear-gradient(145deg, rgba(203, 213, 225, 0.25), rgba(148, 163, 184, 0.15));
		box-shadow:
			inset 0 15px 28px rgba(15, 23, 42, 0.12),
			0 12px 28px rgba(15, 23, 42, 0.16);
		padding: 0.75rem;
	}

	@media (min-width: 768px) {
		.panel__chart-shell {
			height: 10rem;
			width: 10rem;
		}
	}

	@media (min-width: 1024px) {
		.panel__chart-shell {
			height: 11rem;
			width: 11rem;
			padding: 0.85rem;
		}
	}

	:global(.dark) .panel__chart-shell {
		background: linear-gradient(145deg, rgba(30, 41, 59, 0.6), rgba(15, 23, 42, 0.8));
		box-shadow:
			inset 0 18px 30px rgba(2, 6, 23, 0.55),
			0 20px 38px rgba(2, 6, 23, 0.45);
	}

	.panel__chart {
		position: absolute;
		inset: 0.75rem;
		border-radius: 9999px;
		transition: background 0.4s ease;
	}

	@media (min-width: 1024px) {
		.panel__chart {
			inset: 0.85rem;
		}
	}

	.panel__chart-core {
		position: absolute;
		inset: 2.75rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		border-radius: 9999px;
		background: rgba(255, 255, 255, 0.9);
		box-shadow: 0 6px 14px rgba(15, 23, 42, 0.12);
		text-align: center;
		gap: 0.25rem;
		padding: 0.625rem;
	}

	@media (min-width: 768px) {
		.panel__chart-core {
			inset: 3rem;
		}
	}

	@media (min-width: 1024px) {
		.panel__chart-core {
			inset: 3.2rem;
			padding: 0.75rem;
		}
	}

	:global(.dark) .panel__chart-core {
		background: rgba(15, 23, 42, 0.78);
		color: #e2e8f0;
		box-shadow: 0 10px 24px rgba(2, 6, 23, 0.55);
	}

	.panel__chart-core p {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		color: #0f172a;
	}

	@media (min-width: 768px) {
		.panel__chart-core p {
			font-size: 1.0625rem;
		}
	}

	@media (min-width: 1024px) {
		.panel__chart-core p {
			font-size: 1.125rem;
		}
	}

	.panel__chart-core span {
		font-size: 0.5625rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: rgba(71, 85, 105, 0.8);
	}

	@media (min-width: 1024px) {
		.panel__chart-core span {
			font-size: 0.625rem;
		}
	}

	:global(.dark) .panel__chart-core p {
		color: #f8fafc;
	}

	:global(.dark) .panel__chart-core span {
		color: rgba(148, 163, 184, 0.8);
	}

	.panel__legend {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		justify-content: center;
		font-size: 0.75rem;
		color: rgba(71, 85, 105, 0.85);
	}

	:global(.dark) .panel__legend {
		color: rgba(203, 213, 225, 0.85);
	}

	.panel__legend-item {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		border-radius: 9999px;
		padding: 0.35rem 0.85rem;
		background: rgba(255, 255, 255, 0.8);
		box-shadow: 0 6px 12px rgba(15, 23, 42, 0.08);
	}

	:global(.dark) .panel__legend-item {
		background: rgba(15, 23, 42, 0.75);
		box-shadow: 0 6px 16px rgba(2, 6, 23, 0.45);
	}

	.panel__legend-item span {
		display: inline-block;
		height: 0.6rem;
		width: 0.6rem;
		border-radius: 9999px;
		box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.5);
	}

	.panel__stats-grid {
		display: grid;
		gap: 0.75rem;
		grid-template-columns: 1fr;
	}

	@media (min-width: 640px) {
		.panel__stats-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	.panel__stat-card {
		border-radius: 1rem;
		padding: 0.875rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		position: relative;
		overflow: hidden;
	}

	@media (min-width: 1024px) {
		.panel__stat-card {
			padding: 1rem 1.25rem;
			border-radius: 1.125rem;
		}
	}

	.panel__stat-card::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		opacity: 0.45;
		background: linear-gradient(135deg, rgba(255, 255, 255, 0.65), transparent);
		pointer-events: none;
	}

	.panel__stat-card--blue {
		background: linear-gradient(135deg, rgba(96, 165, 250, 0.17), rgba(59, 130, 246, 0.12));
		border: 1px solid rgba(59, 130, 246, 0.25);
		color: #1e3a8a;
	}

	:global(.dark) .panel__stat-card--blue {
		background: linear-gradient(135deg, rgba(59, 130, 246, 0.18), rgba(37, 99, 235, 0.14));
		border-color: rgba(59, 130, 246, 0.32);
		color: rgba(191, 219, 254, 0.95);
	}

	.panel__stat-card--neutral {
		background: linear-gradient(135deg, rgba(226, 232, 240, 0.5), rgba(203, 213, 225, 0.28));
		border: 1px solid rgba(203, 213, 225, 0.55);
		color: #334155;
	}

	:global(.dark) .panel__stat-card--neutral {
		background: linear-gradient(135deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.55));
		border-color: rgba(71, 85, 105, 0.45);
		color: rgba(226, 232, 240, 0.9);
	}

	.panel__stat-label {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		margin: 0;
	}

	.panel__stat-values {
		display: flex;
		align-items: baseline;
		gap: 0.625rem;
	}

	.panel__stat-primary {
		font-size: 1.125rem;
		font-weight: 600;
	}

	@media (min-width: 1024px) {
		.panel__stat-primary {
			font-size: 1.25rem;
		}
	}

	.panel__stat-secondary {
		font-size: 0.8125rem;
		font-weight: 600;
		opacity: 0.7;
	}

	@media (min-width: 1024px) {
		.panel__stat-secondary {
			font-size: 0.875rem;
		}
	}

	.panel__stat-hint {
		font-size: 0.6875rem;
		margin: 0;
		opacity: 0.8;
	}

	.panel__breakdown {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	@media (min-width: 1024px) {
		.panel__breakdown {
			gap: 0.875rem;
		}
	}

	.panel__breakdown-header h4 {
		margin: 0;
		font-size: 0.875rem;
		font-weight: 600;
		color: #1f2937;
	}

	@media (min-width: 1024px) {
		.panel__breakdown-header h4 {
			font-size: 0.9375rem;
		}
	}

	:global(.dark) .panel__breakdown-header h4 {
		color: rgba(226, 232, 240, 0.95);
	}

	.panel__breakdown-list {
		display: grid;
		gap: 0.625rem;
		list-style: none;
		padding: 0;
		margin: 0;
	}

	@media (min-width: 1024px) {
		.panel__breakdown-list {
			gap: 0.75rem;
		}
	}

	.panel__breakdown-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.875rem;
		padding: 0.75rem 0.875rem;
		border-radius: 0.875rem;
		background: rgba(255, 255, 255, 0.9);
		border: 1px solid rgba(226, 232, 240, 0.7);
		box-shadow: 0 6px 14px rgba(148, 163, 184, 0.14);
		transition:
			transform 0.2s ease,
			box-shadow 0.2s ease;
	}

	@media (min-width: 1024px) {
		.panel__breakdown-item {
			padding: 0.875rem 1rem;
			border-radius: 1rem;
		}
	}

	.panel__breakdown-item:hover {
		transform: translateY(-2px);
		box-shadow: 0 16px 28px rgba(96, 165, 250, 0.18);
	}

	:global(.dark) .panel__breakdown-item {
		background: rgba(15, 23, 42, 0.78);
		border-color: rgba(71, 85, 105, 0.4);
		box-shadow: 0 16px 28px rgba(2, 6, 23, 0.45);
	}

	.panel__breakdown-item--build {
		background: linear-gradient(135deg, rgba(253, 230, 138, 0.32), rgba(253, 186, 116, 0.22));
		border-color: rgba(217, 119, 6, 0.4);
	}

	:global(.dark) .panel__breakdown-item--build {
		background: linear-gradient(135deg, rgba(217, 119, 6, 0.35), rgba(251, 191, 36, 0.2));
		border-color: rgba(251, 191, 36, 0.45);
	}

	.panel__breakdown-meta {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-width: 0;
	}

	.panel__indicator {
		height: 0.75rem;
		width: 0.75rem;
		flex-shrink: 0;
		border-radius: 50%;
		box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.12);
	}

	@media (min-width: 1024px) {
		.panel__indicator {
			height: 0.8125rem;
			width: 0.8125rem;
		}
	}

	.panel__breakdown-name {
		font-size: 0.875rem;
		font-weight: 600;
		color: #1f2937;
		margin: 0;
	}

	@media (min-width: 1024px) {
		.panel__breakdown-name {
			font-size: 0.9375rem;
		}
	}

	:global(.dark) .panel__breakdown-name {
		color: rgba(248, 250, 252, 0.95);
	}

	.panel__breakdown-sub {
		margin: 0.1875rem 0 0;
		font-size: 0.6875rem;
		color: rgba(71, 85, 105, 0.75);
	}

	@media (min-width: 1024px) {
		.panel__breakdown-sub {
			font-size: 0.75rem;
		}
	}

	:global(.dark) .panel__breakdown-sub {
		color: rgba(203, 213, 225, 0.75);
	}

	.panel__breakdown-values {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.25rem;
	}

	.panel__breakdown-hours {
		font-size: 0.875rem;
		font-weight: 600;
		color: #0f172a;
	}

	@media (min-width: 1024px) {
		.panel__breakdown-hours {
			font-size: 0.9375rem;
		}
	}

	:global(.dark) .panel__breakdown-hours {
		color: rgba(226, 232, 240, 0.95);
	}

	.panel__breakdown-percent {
		font-size: 0.6875rem;
		color: rgba(100, 116, 139, 0.85);
		font-weight: 600;
	}

	@media (min-width: 1024px) {
		.panel__breakdown-percent {
			font-size: 0.75rem;
		}
	}

	:global(.dark) .panel__breakdown-percent {
		color: rgba(148, 163, 184, 0.9);
	}

	@media (max-width: 640px) {
		.time-allocation-panel {
			padding: 1rem 1.25rem;
			gap: 1rem;
		}

		.panel__breakdown-item {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.625rem;
		}

		.panel__breakdown-values {
			align-items: flex-start;
		}

		.panel__custom-range {
			grid-template-columns: 1fr;
		}
	}
</style>
