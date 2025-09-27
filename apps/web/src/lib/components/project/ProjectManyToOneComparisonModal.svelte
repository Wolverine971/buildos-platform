<!-- src/lib/components/project/ProjectManyToOneComparisonModal.svelte -->
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ManyToOneDiffView from '$lib/components/ui/ManyToOneDiffView.svelte';
	import {
		createManyToOneComparison,
		type ManyToOneItem,
		type FieldConfig
	} from '$lib/utils/many-to-one-diff';
	import { createEventDispatcher } from 'svelte';

	export let isOpen = false;
	export let projectVersions: any[] = [];
	export let referenceVersion: any = null;
	export let title = 'Compare Project Versions';

	const dispatch = createEventDispatcher();

	let comparison: any = null;
	let showOnlyDifferences = true;

	// Project field configuration
	const projectFieldConfigs: Record<string, FieldConfig> = {
		name: {
			label: 'Project Name',
			priority: 1
		},
		status: {
			label: 'Status',
			priority: 2
		},
		description: {
			label: 'Description',
			priority: 3
		},
		context: {
			label: 'Project Context',
			priority: 4
		},
		executive_summary: {
			label: 'Executive Summary',
			priority: 5
		},
		start_date: {
			label: 'Start Date',
			priority: 6,
			formatter: (value) => {
				if (!value) return '';
				try {
					return new Date(value).toLocaleDateString();
				} catch {
					return String(value);
				}
			}
		},
		end_date: {
			label: 'End Date',
			priority: 7,
			formatter: (value) => {
				if (!value) return '';
				try {
					return new Date(value).toLocaleDateString();
				} catch {
					return String(value);
				}
			}
		},
		tags: {
			label: 'Tags',
			priority: 8,
			formatter: (value) => (Array.isArray(value) ? value.join(', ') : String(value || ''))
		}
	};

	function handleClose() {
		isOpen = false;
		dispatch('close');
	}

	function createComparison() {
		if (!projectVersions.length || !referenceVersion) {
			comparison = null;
			return;
		}

		// Convert project versions to ManyToOneItem format
		const leftItems: ManyToOneItem[] = projectVersions.map((version) => ({
			id: String(version.version_number),
			label: `v${version.version_number}`,
			data: version.project_data
		}));

		const rightItem: ManyToOneItem = {
			id: String(referenceVersion.version_number),
			label: `v${referenceVersion.version_number}`,
			data: referenceVersion.project_data
		};

		comparison = createManyToOneComparison(leftItems, rightItem, projectFieldConfigs);
	}

	// Reactive comparison creation
	$: if (projectVersions.length && referenceVersion) {
		createComparison();
	}
</script>

<Modal {isOpen} size="xl" onClose={handleClose} {title}>
	<div class="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 flex flex-col h-full max-h-[80vh]">
		<!-- Controls -->
		<div
			class="mb-4 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-4"
		>
			<div class="text-sm text-gray-600 dark:text-gray-400">
				Comparing {projectVersions.length} versions against reference version {referenceVersion?.version_number ||
					'Unknown'}
			</div>

			<div class="flex items-center space-x-2">
				<label class="flex items-center text-sm text-gray-700 dark:text-gray-300">
					<input
						type="checkbox"
						bind:checked={showOnlyDifferences}
						class="mr-2 rounded border-gray-300 dark:border-gray-600"
					/>
					Show only differences
				</label>
			</div>
		</div>

		<!-- Content -->
		<div class="flex-1 overflow-auto">
			{#if !projectVersions.length}
				<div class="text-center py-8">
					<p class="text-gray-600 dark:text-gray-400">
						No project versions provided for comparison.
					</p>
				</div>
			{:else if !referenceVersion}
				<div class="text-center py-8">
					<p class="text-gray-600 dark:text-gray-400">No reference version provided.</p>
				</div>
			{:else if comparison}
				<ManyToOneDiffView
					{comparison}
					leftLabel="Versions to Compare"
					rightLabel="Reference Version"
					{showOnlyDifferences}
				/>
			{:else}
				<div class="text-center py-8">
					<div
						class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4"
					></div>
					<p class="text-gray-600 dark:text-gray-400">Creating comparison...</p>
				</div>
			{/if}
		</div>

		<!-- Actions -->
		<div class="mt-4 flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
			<Button onclick={handleClose} variant="outline">Close</Button>
		</div>
	</div>
</Modal>
