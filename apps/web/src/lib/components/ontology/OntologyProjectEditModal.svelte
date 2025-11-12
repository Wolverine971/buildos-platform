<!-- apps/web/src/lib/components/ontology/OntologyProjectEditModal.svelte -->
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import type { Project } from '$lib/types/onto';

	interface Props {
		isOpen?: boolean;
		project: Project | null;
		onClose?: () => void;
		onSaved?: (project: Project) => void;
	}

	const FACET_CONTEXT_OPTIONS = [
		'personal',
		'client',
		'commercial',
		'internal',
		'open_source',
		'community',
		'academic',
		'nonprofit',
		'startup'
	];

	const FACET_SCALE_OPTIONS = ['micro', 'small', 'medium', 'large', 'epic'];
	const FACET_STAGE_OPTIONS = [
		'discovery',
		'planning',
		'execution',
		'launch',
		'maintenance',
		'complete'
	];

	let { isOpen = $bindable(false), project, onClose, onSaved }: Props = $props();

	let name = $state('');
	let description = $state('');
	let facetContext = $state('');
	let facetScale = $state('');
	let facetStage = $state('');
	let startDate = $state('');
	let endDate = $state('');
	let isSaving = $state(false);
	let error = $state<string | null>(null);

	$effect(() => {
		if (!project || !isOpen) return;

		name = project.name ?? '';
		description = project.description ?? '';
		facetContext = project.facet_context ?? '';
		facetScale = project.facet_scale ?? '';
		facetStage = project.facet_stage ?? '';
		startDate = toDateInput(project.start_at);
		endDate = toDateInput(project.end_at);
		error = null;
	});

	function toDateInput(value?: string | null): string {
		if (!value) return '';
		const date = new Date(value);
		if (isNaN(date.getTime())) return '';
		return date.toISOString().slice(0, 10);
	}

	function parseDateInput(value: string): string | null {
		if (!value) return null;
		const date = new Date(`${value}T00:00:00Z`);
		if (isNaN(date.getTime())) {
			return null;
		}
		return date.toISOString();
	}

	function handleClose() {
		if (isSaving) return;
		onClose?.();
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!project) return;

		error = null;

		const payload: Record<string, unknown> = {};

		if (name.trim() && name.trim() !== project.name) {
			payload.name = name.trim();
		}

		if ((description || '') !== (project.description || '')) {
			payload.description = description.trim() || null;
		}

		if ((facetContext || '') !== (project.facet_context || '')) {
			payload.facet_context = facetContext || null;
		}

		if ((facetScale || '') !== (project.facet_scale || '')) {
			payload.facet_scale = facetScale || null;
		}

		if ((facetStage || '') !== (project.facet_stage || '')) {
			payload.facet_stage = facetStage || null;
		}

		const parsedStart = parseDateInput(startDate);
		const parsedEnd = parseDateInput(endDate);

		if (parsedStart !== (project.start_at ?? null)) {
			payload.start_at = parsedStart;
		}

		if (parsedEnd !== (project.end_at ?? null)) {
			payload.end_at = parsedEnd;
		}

		if (Object.keys(payload).length === 0) {
			toastService.info('No changes to save');
			return;
		}

		try {
			isSaving = true;
			const response = await fetch(`/api/onto/projects/${project.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			const result = await response.json().catch(() => ({}));

			if (!response.ok) {
				throw new Error(result.error ?? 'Failed to update project');
			}

			const updated = result.project as Project;
			toastService.success('Project updated');
			onSaved?.(updated);
			onClose?.();
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to update project';
			error = message;
			toastService.error(message);
		} finally {
			isSaving = false;
		}
	}

	function facetLabel(value: string) {
		return value
			.split('_')
			.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
			.join(' ');
	}
</script>

<Modal bind:isOpen onClose={handleClose} title="Edit Ontology Project" size="lg">
	{#if !project}
		<p class="text-gray-600 dark:text-gray-300">Project data is unavailable.</p>
	{:else}
		<form class="space-y-6 px-2" onsubmit={handleSubmit}>
			<div class="grid gap-5">
				<div class="space-y-2">
					<label class="text-sm font-medium text-gray-700 dark:text-gray-200"
						>Project Name</label
					>
					<TextInput
						bind:value={name}
						required
						placeholder="Project name"
						disabled={isSaving}
					/>
				</div>
				<div class="space-y-2">
					<label class="text-sm font-medium text-gray-700 dark:text-gray-200"
						>Description</label
					>
					<Textarea
						bind:value={description}
						placeholder="Brief project description"
						rows={4}
						disabled={isSaving}
					/>
				</div>
			</div>

			<div class="grid gap-5 md:grid-cols-2">
				<div class="space-y-2">
					<label class="text-sm font-medium text-gray-700 dark:text-gray-200"
						>Facet Context</label
					>
					<select
						class="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
						bind:value={facetContext}
						disabled={isSaving}
					>
						<option value="">Not set</option>
						{#each FACET_CONTEXT_OPTIONS as option}
							<option value={option}>{facetLabel(option)}</option>
						{/each}
					</select>
				</div>

				<div class="space-y-2">
					<label class="text-sm font-medium text-gray-700 dark:text-gray-200"
						>Facet Scale</label
					>
					<select
						class="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
						bind:value={facetScale}
						disabled={isSaving}
					>
						<option value="">Not set</option>
						{#each FACET_SCALE_OPTIONS as option}
							<option value={option}>{facetLabel(option)}</option>
						{/each}
					</select>
				</div>

				<div class="space-y-2">
					<label class="text-sm font-medium text-gray-700 dark:text-gray-200"
						>Facet Stage</label
					>
					<select
						class="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
						bind:value={facetStage}
						disabled={isSaving}
					>
						<option value="">Not set</option>
						{#each FACET_STAGE_OPTIONS as option}
							<option value={option}>{facetLabel(option)}</option>
						{/each}
					</select>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div class="space-y-2">
						<label class="text-sm font-medium text-gray-700 dark:text-gray-200"
							>Start Date</label
						>
						<TextInput type="date" bind:value={startDate} disabled={isSaving} />
					</div>
					<div class="space-y-2">
						<label class="text-sm font-medium text-gray-700 dark:text-gray-200"
							>End Date</label
						>
						<TextInput type="date" bind:value={endDate} disabled={isSaving} />
					</div>
				</div>
			</div>

			{#if error}
				<p class="text-sm text-red-600">{error}</p>
			{/if}

			<div class="flex justify-end gap-2 pt-2">
				<Button type="button" variant="ghost" onclick={handleClose} disabled={isSaving}>
					Cancel
				</Button>
				<Button type="submit" variant="primary" disabled={isSaving}>
					{isSaving ? 'Saving...' : 'Save Changes'}
				</Button>
			</div>
		</form>
	{/if}
</Modal>
