<!-- apps/web/src/lib/components/time-blocks/TimeAllocationPanel.svelte -->
<script lang="ts">
	import type { TimeAllocation } from '@buildos/shared-types';
	import {
		BUILD_BLOCK_COLOR_HEX,
		DEFAULT_PROJECT_COLOR_HEX,
		resolveProjectColor
	} from '$lib/utils/time-block-colors';

	interface Props {
		allocation: TimeAllocation | null;
		isLoading?: boolean;
		dateRange: { start: Date; end: Date };
	}

	let { allocation = null, isLoading = false, dateRange }: Props = $props();

	// State for collapsible breakdown section
	let isBreakdownExpanded = $state(true);

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

	const totalHours = $derived(toSafeNumber(allocation?.total_hours));
	const buildBlockHours = $derived(toSafeNumber(allocation?.build_block_hours));

	const enrichedAllocations = $derived.by(() => {
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

	const buildBlockPercentage = $derived.by(() => {
		if (!allocation || totalHours <= 0) return 0;
		return toSafeNumber((buildBlockHours / totalHours) * 100);
	});

	const chartGradient = $derived.by(() => {
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
		allocation !== null &&
			(totalHours > 0 || buildBlockHours > 0 || enrichedAllocations.length > 0)
	);
</script>

<div class="time-allocation-panel">
	<header class="panel__header">
		<div class="panel__title">
			<h3>Time allocation</h3>
			<p>{formatRangeLabel(dateRange)}</p>
		</div>
	</header>

	{#if isLoading}
		<div class="flex flex-col items-center justify-center gap-3 py-16 text-center">
			<div
				class="h-10 w-10 animate-spin rounded-full border-[3px] border-gray-300 border-t-blue-600 dark:border-gray-600 dark:border-t-blue-400"
			></div>
			<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
				Calculating your time allocation…
			</p>
		</div>
	{:else if !hasData}
		<div
			class="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center dark:border-gray-600 dark:bg-gray-800"
		>
			<p class="text-sm font-semibold text-gray-700 dark:text-gray-300">
				No focus blocks scheduled in this range yet.
			</p>
			<p class="text-xs text-gray-600 dark:text-gray-400">
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
			<button
				type="button"
				class="panel__breakdown-header"
				onclick={() => (isBreakdownExpanded = !isBreakdownExpanded)}
				aria-expanded={isBreakdownExpanded}
			>
				<div class="panel__breakdown-title">
					<h4>Project breakdown</h4>
					<span class="panel__breakdown-count">
						{enrichedAllocations.length + (buildBlockHours > 0 ? 1 : 0)} items
					</span>
				</div>
				<svg
					class="panel__breakdown-chevron"
					class:expanded={isBreakdownExpanded}
					width="20"
					height="20"
					viewBox="0 0 20 20"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
				>
					<path
						d="M5 7.5L10 12.5L15 7.5"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</button>

			{#if isBreakdownExpanded}
				<ul class="panel__breakdown-list">
					{#each enrichedAllocations as project (project.project_id)}
						<li
							class="panel__breakdown-item"
							data-testid={`allocation-project-${project.project_id}`}
						>
							<div class="panel__breakdown-meta">
								<span
									class="panel__indicator"
									style={`background: ${project.color}`}
								></span>
								<div>
									<p class="panel__breakdown-name">{project.project_name}</p>
									<p class="panel__breakdown-sub">
										{formatBlockCount(project.block_count)}
									</p>
								</div>
							</div>
							<div class="panel__breakdown-values">
								<span class="panel__breakdown-hours"
									>{formatHours(project.hours)}</span
								>
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
									<p class="panel__breakdown-sub">
										Flexible focus across projects
									</p>
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
			{/if}
		</div>
	{/if}
</div>

<style>
	.time-allocation-panel {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0.875rem 1rem;
	}

	@media (min-width: 768px) {
		.time-allocation-panel {
			padding: 1rem 1.25rem;
			gap: 1rem;
		}
	}

	.panel__header {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	@media (min-width: 1024px) {
		.panel__header {
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
			gap: 1rem;
		}
	}

	.panel__title h3 {
		font-size: 0.9375rem;
		font-weight: 600;
		color: #111827;
		margin: 0;
		line-height: 1.3;
	}

	@media (min-width: 768px) {
		.panel__title h3 {
			font-size: 1rem;
		}
	}

	:global(.dark) .panel__title h3 {
		color: #ffffff;
	}

	.panel__title p {
		margin: 0.25rem 0 0;
		font-size: 0.75rem;
		color: #6b7280;
		line-height: 1.4;
	}

	:global(.dark) .panel__title p {
		color: #9ca3af;
	}

	.panel__content {
		display: grid;
		gap: 0.75rem;
		grid-template-columns: 1fr;
	}

	@media (min-width: 768px) {
		.panel__content {
			grid-template-columns: auto 1fr;
			align-items: center;
			gap: 1.25rem;
		}
	}

	@media (min-width: 1280px) {
		.panel__content {
			gap: 1.5rem;
		}
	}

	.panel__visual {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.625rem;
	}

	@media (min-width: 768px) {
		.panel__visual {
			flex-direction: row;
			gap: 0.875rem;
		}
	}

	.panel__chart-shell {
		position: relative;
		height: 7rem;
		width: 7rem;
		flex-shrink: 0;
		border-radius: 9999px;
		background: #f1f5f9;
		box-shadow:
			0 1px 2px 0 rgba(0, 0, 0, 0.05),
			0 1px 3px 0 rgba(0, 0, 0, 0.1);
		padding: 0.625rem;
	}

	@media (min-width: 768px) {
		.panel__chart-shell {
			height: 8rem;
			width: 8rem;
		}
	}

	@media (min-width: 1024px) {
		.panel__chart-shell {
			height: 8.5rem;
			width: 8.5rem;
			padding: 0.75rem;
		}
	}

	:global(.dark) .panel__chart-shell {
		background: #1f2937;
		box-shadow:
			0 4px 6px -1px rgba(0, 0, 0, 0.1),
			0 2px 4px -1px rgba(0, 0, 0, 0.06);
	}

	.panel__chart {
		position: absolute;
		inset: 0.625rem;
		border-radius: 9999px;
		transition: background 0.3s ease;
	}

	@media (min-width: 1024px) {
		.panel__chart {
			inset: 0.75rem;
		}
	}

	.panel__chart-core {
		position: absolute;
		inset: 2.25rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		border-radius: 9999px;
		background: #ffffff;
		box-shadow:
			0 1px 2px 0 rgba(0, 0, 0, 0.05),
			0 1px 3px 0 rgba(0, 0, 0, 0.1);
		text-align: center;
		gap: 0.125rem;
		padding: 0.5rem;
	}

	@media (min-width: 768px) {
		.panel__chart-core {
			inset: 2.5rem;
		}
	}

	@media (min-width: 1024px) {
		.panel__chart-core {
			inset: 2.625rem;
			padding: 0.625rem;
		}
	}

	:global(.dark) .panel__chart-core {
		background: #111827;
		color: #e2e8f0;
		box-shadow:
			0 1px 2px 0 rgba(0, 0, 0, 0.05),
			0 2px 4px 0 rgba(0, 0, 0, 0.1);
	}

	.panel__chart-core p {
		margin: 0;
		font-size: 1.125rem;
		font-weight: 700;
		color: #111827;
		line-height: 1.1;
	}

	@media (min-width: 768px) {
		.panel__chart-core p {
			font-size: 1.25rem;
		}
	}

	@media (min-width: 1024px) {
		.panel__chart-core p {
			font-size: 1.375rem;
		}
	}

	.panel__chart-core span {
		font-size: 0.5625rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #6b7280;
		font-weight: 600;
	}

	@media (min-width: 1024px) {
		.panel__chart-core span {
			font-size: 0.625rem;
		}
	}

	:global(.dark) .panel__chart-core p {
		color: #ffffff;
	}

	:global(.dark) .panel__chart-core span {
		color: #9ca3af;
	}

	.panel__legend {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
		justify-content: center;
		font-size: 0.8125rem;
		color: #4b5563;
		font-weight: 500;
	}

	:global(.dark) .panel__legend {
		color: #d1d5db;
	}

	.panel__legend-item {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		border-radius: 9999px;
		padding: 0.35rem 0.85rem;
		background: #ffffff;
		box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
	}

	:global(.dark) .panel__legend-item {
		background: #1f2937;
		box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
	}

	.panel__legend-item span {
		display: inline-block;
		height: 0.625rem;
		width: 0.625rem;
		border-radius: 9999px;
		box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.75);
	}

	:global(.dark) .panel__legend-item span {
		box-shadow: 0 0 0 2px rgba(31, 41, 59, 0.75);
	}

	.panel__stats-grid {
		display: grid;
		gap: 0.5rem;
		grid-template-columns: 1fr;
	}

	@media (min-width: 640px) {
		.panel__stats-grid {
			grid-template-columns: repeat(2, 1fr);
			gap: 0.625rem;
		}
	}

	.panel__stat-card {
		border-radius: 0.5rem;
		padding: 0.625rem 0.875rem;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		position: relative;
		overflow: hidden;
		border: 1px solid;
		transition: all 0.15s ease;
	}

	@media (min-width: 1024px) {
		.panel__stat-card {
			padding: 0.75rem 1rem;
		}
	}

	.panel__stat-card--blue {
		background: linear-gradient(to right, #eff6ff 50%, #eef2ff 50%);
		background-size: 200% 100%;
		background-position: 100% 0;
		border-color: #bfdbfe;
		color: #1e40af;
	}

	:global(.dark) .panel__stat-card--blue {
		background: linear-gradient(to right, #1e3a8a 50%, #312e81 50%);
		background-size: 200% 100%;
		background-position: 100% 0;
		border-color: #3b82f6;
		color: #dbeafe;
	}

	.panel__stat-card--neutral {
		background: linear-gradient(to right, #f9fafb 50%, #f3f4f6 50%);
		background-size: 200% 100%;
		background-position: 100% 0;
		border-color: #e5e7eb;
		color: #374151;
	}

	:global(.dark) .panel__stat-card--neutral {
		background: linear-gradient(to right, #1f2937 50%, #111827 50%);
		background-size: 200% 100%;
		background-position: 100% 0;
		border-color: #4b5563;
		color: #e5e7eb;
	}

	.panel__stat-label {
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin: 0;
		opacity: 0.8;
	}

	.panel__stat-values {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}

	.panel__stat-primary {
		font-size: 1.125rem;
		font-weight: 700;
		line-height: 1.1;
	}

	@media (min-width: 1024px) {
		.panel__stat-primary {
			font-size: 1.375rem;
		}
	}

	.panel__stat-secondary {
		font-size: 0.75rem;
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
		opacity: 0.7;
		line-height: 1.3;
	}

	.panel__breakdown {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	@media (min-width: 1024px) {
		.panel__breakdown {
			gap: 0.625rem;
		}
	}

	.panel__breakdown-header {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.625rem 1rem;
		margin: 0 -1rem 0.25rem -1rem;
		border: none;
		background: transparent;
		border-radius: 0.5rem;
		cursor: pointer;
		transition: all 0.15s ease;
		-webkit-tap-highlight-color: transparent;
	}

	@media (min-width: 768px) {
		.panel__breakdown-header {
			padding: 0.75rem 1.25rem;
			margin: 0 -1.25rem 0.25rem -1.25rem;
		}
	}

	.panel__breakdown-header:hover {
		background: linear-gradient(to right, #f9fafb 50%, #f3f4f6 50%);
		background-size: 200% 100%;
		background-position: 100% 0;
	}

	:global(.dark) .panel__breakdown-header:hover {
		background: linear-gradient(to right, #1f2937 50%, #111827 50%);
		background-size: 200% 100%;
		background-position: 100% 0;
	}

	.panel__breakdown-header:focus {
		outline: none;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
	}

	.panel__breakdown-header:focus-visible {
		outline: none;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3);
	}

	:global(.dark) .panel__breakdown-header:focus-visible {
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.4);
	}

	.panel__breakdown-header:active {
		transform: scale(0.995);
	}

	.panel__breakdown-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.panel__breakdown-header h4 {
		margin: 0;
		font-size: 0.8125rem;
		font-weight: 600;
		color: #111827;
		line-height: 1.3;
	}

	@media (min-width: 1024px) {
		.panel__breakdown-header h4 {
			font-size: 0.875rem;
		}
	}

	:global(.dark) .panel__breakdown-header h4 {
		color: #ffffff;
	}

	.panel__breakdown-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 2.75rem;
		padding: 0.125rem 0.5rem;
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.025em;
		color: #6b7280;
		background: #f3f4f6;
		border-radius: 9999px;
		flex-shrink: 0;
	}

	@media (max-width: 640px) {
		.panel__breakdown-count {
			font-size: 0.5625rem;
			min-width: 2.5rem;
			padding: 0.0625rem 0.375rem;
		}
	}

	:global(.dark) .panel__breakdown-count {
		color: #9ca3af;
		background: #374151;
	}

	.panel__breakdown-chevron {
		flex-shrink: 0;
		color: #6b7280;
		transition: transform 0.2s ease;
	}

	:global(.dark) .panel__breakdown-chevron {
		color: #9ca3af;
	}

	.panel__breakdown-chevron.expanded {
		transform: rotate(180deg);
	}

	.panel__breakdown-list {
		display: grid;
		gap: 0.5rem;
		list-style: none;
		padding: 0;
		margin: 0;
		animation: slideDown 0.25s ease;
	}

	@media (min-width: 1024px) {
		.panel__breakdown-list {
			gap: 0.625rem;
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

	.panel__breakdown-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.625rem;
		border-radius: 0.5rem;
		background: #ffffff;
		border: 1px solid #e2e8f0;
		box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.03);
		transition:
			transform 0.15s ease,
			box-shadow 0.15s ease;
	}

	@media (min-width: 1024px) {
		.panel__breakdown-item {
			padding: 0.625rem 0.75rem;
		}
	}

	.panel__breakdown-item:hover {
		transform: translateY(-1px);
		box-shadow:
			0 2px 4px 0 rgba(0, 0, 0, 0.05),
			0 1px 2px 0 rgba(0, 0, 0, 0.03);
	}

	:global(.dark) .panel__breakdown-item {
		background: #1f2937;
		border-color: #374151;
		box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.03);
	}

	.panel__breakdown-item--build {
		background: linear-gradient(to right, #fef3c7 50%, #fed7aa 50%);
		background-size: 200% 100%;
		background-position: 100% 0;
		border-color: #d97706;
	}

	:global(.dark) .panel__breakdown-item--build {
		background: linear-gradient(to right, #78350f 50%, #92400e 50%);
		background-size: 200% 100%;
		background-position: 100% 0;
		border-color: #f59e0b;
	}

	.panel__breakdown-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
	}

	.panel__indicator {
		height: 0.625rem;
		width: 0.625rem;
		flex-shrink: 0;
		border-radius: 50%;
		box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.5);
	}

	:global(.dark) .panel__indicator {
		box-shadow: 0 0 0 2px rgba(31, 41, 59, 0.5);
	}

	@media (min-width: 1024px) {
		.panel__indicator {
			height: 0.6875rem;
			width: 0.6875rem;
		}
	}

	.panel__breakdown-name {
		font-size: 0.8125rem;
		font-weight: 600;
		color: #111827;
		margin: 0;
		line-height: 1.3;
	}

	@media (min-width: 1024px) {
		.panel__breakdown-name {
			font-size: 0.875rem;
		}
	}

	:global(.dark) .panel__breakdown-name {
		color: #ffffff;
	}

	.panel__breakdown-sub {
		margin: 0.125rem 0 0;
		font-size: 0.6875rem;
		color: #6b7280;
		line-height: 1.3;
	}

	@media (min-width: 1024px) {
		.panel__breakdown-sub {
			font-size: 0.75rem;
		}
	}

	:global(.dark) .panel__breakdown-sub {
		color: #9ca3af;
	}

	.panel__breakdown-values {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.125rem;
	}

	.panel__breakdown-hours {
		font-size: 0.875rem;
		font-weight: 700;
		color: #111827;
		line-height: 1.2;
	}

	@media (min-width: 1024px) {
		.panel__breakdown-hours {
			font-size: 0.9375rem;
		}
	}

	:global(.dark) .panel__breakdown-hours {
		color: #ffffff;
	}

	.panel__breakdown-percent {
		font-size: 0.6875rem;
		color: #6b7280;
		font-weight: 600;
	}

	@media (min-width: 1024px) {
		.panel__breakdown-percent {
			font-size: 0.75rem;
		}
	}

	:global(.dark) .panel__breakdown-percent {
		color: #9ca3af;
	}

	@media (max-width: 640px) {
		.time-allocation-panel {
			padding: 0.75rem 0.875rem;
			gap: 0.625rem;
		}

		.panel__breakdown-header {
			margin: 0 -0.875rem 0.25rem -0.875rem;
			padding: 0.5rem 0.875rem;
		}

		.panel__breakdown-title {
			gap: 0.375rem;
		}

		.panel__breakdown-item {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.375rem;
			padding: 0.5rem 0.625rem;
		}

		.panel__breakdown-values {
			align-items: flex-start;
		}
	}
</style>
