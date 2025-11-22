<!-- apps/web/src/routes/ontology/projects/[id]/outputs/[outputId]/edit/+page.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import Button from '$lib/components/ui/Button.svelte';
	import DocumentEditor from '$lib/components/ontology/DocumentEditor.svelte';
	import { ArrowLeft } from 'lucide-svelte';
	import type { PageData } from './$types';

	interface SaveData {
		title: string;
		content: string;
		props: Record<string, unknown>;
	}

	let { data }: { data: PageData } = $props();

	let isSaving = $state(false);
	let saveError = $state<string | null>(null);

	/**
	 * Handles saving the document output
	 * Merges props and sends PATCH request to update output
	 */
	async function handleSave(saveData: SaveData): Promise<void> {
		isSaving = true;
		saveError = null;

		try {
			const response = await fetch(`/api/onto/outputs/${data.output.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: saveData.title,
					props: {
						...data.output.props,
						...saveData.props,
						content: saveData.content,
						content_type: 'html',
						word_count: saveData.props.word_count
					}
				})
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
				throw new Error(errorData.error || 'Failed to save output');
			}

			// Success - DocumentEditor handles UI feedback
		} catch (error) {
			saveError = error instanceof Error ? error.message : 'Failed to save output';
			throw error; // Re-throw so DocumentEditor can handle it
		} finally {
			isSaving = false;
		}
	}

	/**
	 * Navigates back to the project detail page
	 */
	function goBack(): void {
		goto(`/ontology/projects/${data.project.id}`);
	}
</script>

<svelte:head>
	<title>Edit {data.output.name} - {data.project.name} | BuildOS</title>
</svelte:head>

<div class="output-edit-page h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
	<!-- Header - Responsive with mobile-first design and proper accessibility -->
	<header
		class="page-header border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4"
	>
		<!-- Back button - Mobile only -->
		<div class="lg:hidden">
			<button
				type="button"
				onclick={goBack}
				class="inline-flex items-center gap-2 rounded-xl border border-slate-200/70 bg-white/90 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-blue-400 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:border-indigo-500 dark:hover:text-indigo-200"
				aria-label="Back to project"
			>
				<ArrowLeft class="h-4 w-4" aria-hidden="true" />
				<span>Back to Project</span>
			</button>
		</div>

		<!-- Project name with responsive text and truncation -->
		<div class="flex-1 min-w-0">
			<p class="text-sm text-gray-600 dark:text-gray-400 truncate" title={data.project.name}>
				{data.project.name}
			</p>
		</div>
	</header>

	<!-- Editor - Full height with overflow handling and proper semantics -->
	<main class="flex-1 overflow-hidden">
		<DocumentEditor
			outputId={data.output.id}
			templateKey={data.output.type_key}
			resolvedTemplate={data.resolvedTemplate}
			initialContent={(data.output.props?.content as string) ?? ''}
			initialTitle={data.output.name}
			initialProps={data.output.props ?? {}}
			projectId={data.project.id}
			onSave={handleSave}
		/>
	</main>
</div>
