<!-- apps/web/src/routes/projects/[id]/outputs/[outputId]/edit/+page.svelte -->
<!--
	Output Edit Page - Full-Screen Document Editor

	A focused editing experience for project outputs:
	- Compact mobile-first header with project context
	- Full-height Tiptap editor with AI generation
	- Fixed bottom save bar on mobile
	- Inkprint design system throughout

	Documentation:
	- Ontology System: /apps/web/docs/features/ontology/README.md
	- Inkprint Design: /apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { toastService } from '$lib/stores/toast.store';
	import DocumentEditor from '$lib/components/ontology/DocumentEditor.svelte';
	import { ArrowLeft, Layers, ChevronRight, ExternalLink, Save, Loader } from 'lucide-svelte';
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

			toastService.success('Output saved');
		} catch (error) {
			saveError = error instanceof Error ? error.message : 'Failed to save output';
			toastService.error(saveError);
			throw error;
		} finally {
			isSaving = false;
		}
	}

	/**
	 * Navigates back to the project detail page
	 */
	function goBack(): void {
		goto(`/projects/${data.project.id}`);
	}
</script>

<!-- Keyboard Shortcuts - Cmd+S/Ctrl+S to save -->
<svelte:window
	onkeydown={(e) => {
		if ((e.metaKey || e.ctrlKey) && e.key === 's') {
			e.preventDefault();
			// DocumentEditor handles its own save via onSave callback
			// This is a fallback notification
			toastService.info('Press Save in editor or use editor shortcuts');
		}
	}}
/>

<svelte:head>
	<title>Edit {data.output.name} - {data.project.name} | BuildOS</title>
</svelte:head>

<div class="output-edit-page h-screen flex flex-col bg-background overflow-hidden">
	<!-- Header - Compact Mobile-First with Inkprint -->
	<header
		class="shrink-0 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
	>
		<div class="px-2 sm:px-4 lg:px-6 py-1.5 sm:py-2">
			<!-- Title Row -->
			<div class="flex items-center justify-between gap-2">
				<div class="flex items-center gap-1.5 sm:gap-3 min-w-0">
					<!-- Back Button -->
					<button
						type="button"
						onclick={goBack}
						class="p-1 sm:p-2 rounded-lg hover:bg-muted transition-colors shrink-0 pressable"
						aria-label="Back to project"
					>
						<ArrowLeft class="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
					</button>

					<!-- Output Icon & Title -->
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-2">
							<div
								class="w-7 h-7 sm:w-9 sm:h-9 rounded-md sm:rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0"
							>
								<Layers class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-500" />
							</div>
							<div class="min-w-0">
								<h1
									class="text-sm sm:text-lg font-semibold text-foreground leading-tight line-clamp-1"
								>
									{data.output.name || 'Untitled Output'}
								</h1>
								<!-- Desktop: Show type key -->
								{#if data.output.type_key}
									<span
										class="text-[10px] sm:text-xs font-mono text-muted-foreground hidden sm:block"
									>
										{data.output.type_key}
									</span>
								{/if}
							</div>
						</div>
					</div>
				</div>

				<!-- Desktop: View Project Link -->
				<a
					href="/projects/{data.project.id}"
					class="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground border border-border rounded-lg hover:border-accent hover:text-accent transition-colors pressable"
				>
					<span>View Project</span>
					<ExternalLink class="w-3 h-3" />
				</a>
			</div>

			<!-- Mobile: Project Context Row -->
			<div
				class="flex sm:hidden items-center justify-between gap-2 mt-1 text-muted-foreground"
			>
				<a
					href="/projects/{data.project.id}"
					class="flex items-center gap-1 text-xs hover:text-foreground transition-colors truncate"
				>
					<ChevronRight class="w-3 h-3 rotate-180" />
					<span class="truncate">{data.project.name || 'Project'}</span>
				</a>
				{#if data.output.type_key}
					<span class="text-[10px] font-mono text-muted-foreground shrink-0">
						{data.output.type_key}
					</span>
				{/if}
			</div>
		</div>
	</header>

	<!-- Editor - Full Height with Inkprint Styling -->
	<main class="flex-1 overflow-hidden">
		<DocumentEditor
			outputId={data.output.id}
			typeKey={data.output.type_key}
			initialContent={(data.output.props?.content as string) ?? ''}
			initialTitle={data.output.name}
			initialProps={data.output.props ?? {}}
			projectId={data.project.id}
			onSave={handleSave}
		/>
	</main>
</div>
