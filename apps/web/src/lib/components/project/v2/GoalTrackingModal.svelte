<!-- apps/web/src/lib/components/project/v2/GoalTrackingModal.svelte -->
<script lang="ts">
	import { untrack } from 'svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import { BarChart3, Flag, Gauge, ListChecks, PencilLine } from '$lib/icons/lucide';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';
	import type { Goal } from '$lib/types/onto';
	import type { GoalConnectionSummary } from '$lib/types/goal-connection-summary';
	import {
		buildGoalTrackingView,
		readGoalTrackingConfig,
		type GoalTrackingConfig,
		type GoalTrackingMethod
	} from '$lib/types/goal-tracking';

	interface Props {
		goal: Goal;
		summary?: GoalConnectionSummary | null;
		onClose: () => void;
		onSaved: (goal: Goal) => void;
	}

	let { goal, summary = null, onClose, onSaved }: Props = $props();
	const initialConfig = untrack(() => readGoalTrackingConfig(goal.props));

	let method = $state<GoalTrackingMethod>(initialConfig.method);
	let manualPercent = $state(String(initialConfig.manual?.percent ?? 0));
	let manualNote = $state(initialConfig.manual?.note ?? '');
	let metricLabel = $state(initialConfig.metric?.label ?? '');
	let metricStart = $state(String(initialConfig.metric?.start ?? 0));
	let metricCurrent = $state(String(initialConfig.metric?.current ?? 0));
	let metricTarget = $state(String(initialConfig.metric?.target ?? 100));
	let metricUnit = $state(initialConfig.metric?.unit ?? '');
	let isSaving = $state(false);
	let saveError = $state('');

	const methodOptions = $derived([
		{
			method: 'none' as const,
			label: 'No score',
			note: 'Keep factual work metadata without a progress bar.',
			icon: Gauge
		},
		{
			method: 'milestones' as const,
			label: 'Milestones',
			note: summary
				? `${summary.milestones.total} connected · best for outcome gates`
				: 'Best for outcome gates.',
			icon: Flag
		},
		{
			method: 'tasks' as const,
			label: 'Tasks',
			note: summary
				? `${summary.tasks.total} connected · best when execution maps to progress`
				: 'Best when execution maps to progress.',
			icon: ListChecks
		},
		{
			method: 'metric' as const,
			label: 'Metric',
			note: 'Track a numeric value from a starting point to a target.',
			icon: BarChart3
		},
		{
			method: 'manual' as const,
			label: 'Manual',
			note: 'Set a review-based percentage and optional evidence note.',
			icon: PencilLine
		}
	]);

	function parseFinite(value: string | number): number | null {
		if (String(value).trim().length === 0) return null;
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}

	function buildDraftConfig(updatedAt: string | null): GoalTrackingConfig {
		const config: GoalTrackingConfig = { version: 1, method, updated_at: updatedAt };
		if (method === 'manual') {
			config.manual = {
				percent: parseFinite(manualPercent) ?? 0,
				note: manualNote.trim() || null
			};
		}
		if (method === 'metric') {
			config.metric = {
				label: metricLabel.trim() || 'Metric',
				start: parseFinite(metricStart) ?? 0,
				current: parseFinite(metricCurrent) ?? 0,
				target: parseFinite(metricTarget) ?? 0,
				unit: metricUnit.trim() || null
			};
		}
		return config;
	}

	const validationError = $derived.by(() => {
		if (method === 'manual') {
			const percent = parseFinite(manualPercent);
			if (percent === null || percent < 0 || percent > 100) {
				return 'Manual progress must be between 0 and 100.';
			}
		}
		if (method === 'metric') {
			const start = parseFinite(metricStart);
			const current = parseFinite(metricCurrent);
			const target = parseFinite(metricTarget);
			if (!metricLabel.trim()) return 'Metric name is required.';
			if (start === null || current === null || target === null) {
				return 'Start, current, and target must be numbers.';
			}
			if (start === target) return 'Metric start and target must be different.';
		}
		return '';
	});

	const preview = $derived(buildGoalTrackingView(buildDraftConfig(null), summary));

	async function handleSave() {
		if (validationError || isSaving) return;
		isSaving = true;
		saveError = '';

		try {
			const config = buildDraftConfig(new Date().toISOString());
			const response = await fetch(`/api/onto/goals/${goal.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ props: { goal_tracking: config } })
			});
			const result = await response.json();
			if (!response.ok || !result.data?.goal) {
				throw new Error(result.error || 'Failed to update goal tracking');
			}

			onSaved(result.data.goal as Goal);
			onClose();
		} catch (error) {
			void logOntologyClientError(error, {
				endpoint: `/api/onto/goals/${goal.id}`,
				method: 'PATCH',
				projectId: goal.project_id,
				entityType: 'goal',
				entityId: goal.id,
				operation: 'goal_tracking_update'
			});
			saveError = error instanceof Error ? error.message : 'Failed to update goal tracking';
			isSaving = false;
		}
	}
</script>

<Modal isOpen={true} size="md" {onClose} closeOnEscape={!isSaving}>
	{#snippet header()}
		<div class="border-b border-border bg-muted px-4 py-3 tx tx-strip tx-weak">
			<div class="flex min-w-0 items-center gap-3">
				<div
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent/10"
				>
					<Gauge class="h-4 w-4 text-accent" />
				</div>
				<div class="min-w-0">
					<h2 class="truncate text-base font-semibold text-foreground">Track progress</h2>
					<p class="truncate text-xs text-muted-foreground">{goal.name}</p>
				</div>
			</div>
		</div>
	{/snippet}

	<form
		class="space-y-4 p-4"
		onsubmit={(event) => {
			event.preventDefault();
			void handleSave();
		}}
	>
		<fieldset class="space-y-2">
			<legend class="text-sm font-semibold text-foreground"
				>How should progress be measured?</legend
			>
			<div class="grid gap-2 sm:grid-cols-2">
				{#each methodOptions as option (option.method)}
					<label
						class="flex min-h-16 cursor-pointer items-start gap-2.5 rounded-md border p-3 transition-colors {method ===
						option.method
							? 'border-accent bg-accent/5'
							: 'border-border bg-background hover:bg-muted/40'} focus-within:ring-2 focus-within:ring-ring"
					>
						<input
							class="mt-1 h-4 w-4 shrink-0 accent-accent"
							type="radio"
							name="goal-tracking-method"
							value={option.method}
							bind:group={method}
							disabled={isSaving}
						/>
						<option.icon class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
						<span class="min-w-0">
							<span class="block text-sm font-medium text-foreground"
								>{option.label}</span
							>
							<span class="mt-0.5 block text-xs leading-snug text-muted-foreground"
								>{option.note}</span
							>
						</span>
					</label>
				{/each}
			</div>
		</fieldset>

		{#if method === 'manual'}
			<div class="grid gap-3 sm:grid-cols-[9rem_1fr]">
				<FormField
					label="Progress"
					labelFor="manual-progress"
					uppercase={false}
					showOptional={false}
					error={validationError}
				>
					<TextInput
						id="manual-progress"
						type="number"
						min="0"
						max="100"
						step="1"
						bind:value={manualPercent}
						disabled={isSaving}
					/>
				</FormField>
				<FormField label="Evidence note" labelFor="manual-note" uppercase={false}>
					<Textarea
						id="manual-note"
						rows={2}
						placeholder="What supports this estimate?"
						bind:value={manualNote}
						disabled={isSaving}
					/>
				</FormField>
			</div>
		{:else if method === 'metric'}
			<div class="space-y-3">
				<div class="grid gap-3 sm:grid-cols-[1fr_8rem]">
					<FormField
						label="Metric name"
						labelFor="metric-label"
						uppercase={false}
						showOptional={false}
						error={validationError && !metricLabel.trim() ? validationError : ''}
					>
						<TextInput
							id="metric-label"
							placeholder="Families committed"
							bind:value={metricLabel}
							disabled={isSaving}
						/>
					</FormField>
					<FormField label="Unit" labelFor="metric-unit" uppercase={false}>
						<TextInput
							id="metric-unit"
							placeholder="families"
							bind:value={metricUnit}
							disabled={isSaving}
						/>
					</FormField>
				</div>
				<div class="grid grid-cols-3 gap-3">
					<FormField
						label="Start"
						labelFor="metric-start"
						uppercase={false}
						showOptional={false}
					>
						<TextInput
							id="metric-start"
							type="number"
							step="any"
							bind:value={metricStart}
							disabled={isSaving}
						/>
					</FormField>
					<FormField
						label="Current"
						labelFor="metric-current"
						uppercase={false}
						showOptional={false}
					>
						<TextInput
							id="metric-current"
							type="number"
							step="any"
							bind:value={metricCurrent}
							disabled={isSaving}
						/>
					</FormField>
					<FormField
						label="Target"
						labelFor="metric-target"
						uppercase={false}
						showOptional={false}
						error={validationError && metricLabel.trim() ? validationError : ''}
					>
						<TextInput
							id="metric-target"
							type="number"
							step="any"
							bind:value={metricTarget}
							disabled={isSaving}
						/>
					</FormField>
				</div>
			</div>
		{/if}

		<div class="border-y border-border/60 py-3">
			<div class="flex items-start justify-between gap-3">
				<div class="min-w-0">
					<p class="text-sm font-medium text-foreground">{preview.label}</p>
					<p class="truncate text-xs text-muted-foreground">{preview.detail}</p>
				</div>
				{#if preview.percent !== null}
					<span class="shrink-0 text-sm font-semibold tabular-nums text-foreground"
						>{preview.percent}%</span
					>
				{/if}
			</div>
			{#if preview.percent !== null}
				<div
					class="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
					role="progressbar"
					aria-label="{preview.label}: {preview.percent}%"
					aria-valuemin="0"
					aria-valuemax="100"
					aria-valuenow={preview.percent}
				>
					<div
						class="h-full rounded-full bg-accent transition-[width] duration-200 motion-reduce:transition-none"
						style:width={`${preview.percent}%`}
					></div>
				</div>
			{/if}
		</div>

		{#if saveError}
			<p class="text-sm text-destructive" role="alert">{saveError}</p>
		{/if}
	</form>

	{#snippet footer()}
		<div class="flex justify-end gap-2 border-t border-border bg-muted/40 px-4 py-3">
			<Button variant="ghost" size="sm" onclick={onClose} disabled={isSaving}>Cancel</Button>
			<Button
				size="sm"
				onclick={handleSave}
				loading={isSaving}
				disabled={Boolean(validationError)}>Save tracking</Button
			>
		</div>
	{/snippet}
</Modal>
