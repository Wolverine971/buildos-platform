<!-- apps/web/src/lib/components/dashboard/ProjectOverdueIndicator.svelte -->
<script lang="ts">
	import { AlertTriangle } from 'lucide-svelte';
	import type { OverdueProjectBatch } from '$lib/types/overdue-triage';

	type Props = {
		batch: OverdueProjectBatch;
		class?: string;
	};

	let { batch, class: className = '' }: Props = $props();

	const shortCountLabel = $derived(`${batch.overdue_count} overdue`);
	const countLabel = $derived(
		`${batch.overdue_count} overdue ${batch.overdue_count === 1 ? 'task' : 'tasks'}`
	);
	const detailLabel = $derived(
		batch.assigned_to_me_count > 0
			? `${countLabel}, ${batch.assigned_to_me_count} assigned to me`
			: countLabel
	);
</script>

<span class={`overdue-project-indicator ${className}`} title={detailLabel} aria-label={detailLabel}>
	<span class="overdue-project-indicator__label" aria-hidden="true">{shortCountLabel}</span>
	<span class="overdue-project-indicator__icon-shell" aria-hidden="true">
		<AlertTriangle class="overdue-project-indicator__icon" size={11} strokeWidth={2.2} />
	</span>
</span>

<style>
	.overdue-project-indicator {
		box-sizing: border-box;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.125rem;
		height: 1.125rem;
		max-width: 6rem;
		padding: 0;
		overflow: hidden;
		border: 1px solid hsl(var(--warning) / 0.42);
		border-radius: 9999px;
		background: hsl(var(--warning) / 0.08);
		color: hsl(var(--warning));
		line-height: 1;
		transition:
			width 160ms cubic-bezier(0.4, 0, 0.2, 1),
			background-color 160ms ease,
			border-color 160ms ease;
	}

	.overdue-project-indicator:hover {
		width: 5.25rem;
		border-color: hsl(var(--warning) / 0.55);
		background: hsl(var(--warning) / 0.12);
	}

	.overdue-project-indicator__icon-shell {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: 0 0 auto;
		width: 0.6875rem;
		height: 0.6875rem;
	}

	.overdue-project-indicator__icon {
		display: block;
		width: 0.6875rem;
		height: 0.6875rem;
	}

	.overdue-project-indicator__label {
		flex: 0 1 auto;
		min-width: 0;
		max-width: 0;
		margin: 0;
		padding-left: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		font-size: 0.625rem;
		font-weight: 700;
		line-height: 1;
		opacity: 0;
		transition:
			max-width 160ms cubic-bezier(0.4, 0, 0.2, 1),
			padding-left 160ms cubic-bezier(0.4, 0, 0.2, 1),
			margin-right 160ms cubic-bezier(0.4, 0, 0.2, 1),
			opacity 120ms ease;
	}

	.overdue-project-indicator:hover .overdue-project-indicator__label {
		max-width: 4rem;
		padding-left: 0.375rem;
		margin-right: 0.25rem;
		opacity: 1;
	}

	@media (prefers-reduced-motion: reduce) {
		.overdue-project-indicator,
		.overdue-project-indicator__label {
			transition: none;
		}
	}
</style>
