<!-- apps/web/src/lib/components/history/BraindumpModalHistory.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Brain,
		FolderOpen,
		StickyNote,
		CheckCircle2,
		MessageSquare,
		Clock,
		FileText,
		ExternalLink,
		Copy,
		LoaderCircle,
		Sparkles,
		Zap,
		Trash2
	} from 'lucide-svelte';
	import { format, formatDistanceToNow, differenceInHours } from 'date-fns';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import LinkBraindumpToProject from './LinkBraindumpToProject.svelte';
	import { renderMarkdown, getProseClasses } from '$lib/utils/markdown';

	let {
		braindump,
		isOpen = false,
		onClose,
		onDelete
	}: {
		braindump: any;
		isOpen?: boolean;
		onClose: () => void;
		onDelete?: (data: { braindump: any }) => void;
	} = $props();

	let braindumpDetails = $state<any>(null);
	let isLoading = $state(true);
	let error = $state('');

	// Fetch detailed braindump data when modal opens
	async function fetchBraindumpDetails() {
		if (!braindump?.id) return;

		isLoading = true;
		error = '';

		try {
			const response = await fetch(`/api/braindumps/${braindump.id}`);
			if (!response.ok) {
				throw new Error('Failed to fetch braindump details');
			}

			const result = await response.json();
			// Handle standardized response format
			braindumpDetails = result.success && result.data ? result.data : result;
		} catch (err) {
			console.error('Error fetching braindump details:', err);
			error = 'Failed to load braindump details';
		} finally {
			isLoading = false;
		}
	}

	// Copy content to clipboard
	async function copyContent() {
		if (!braindumpDetails?.braindump?.content) return;

		try {
			await navigator.clipboard.writeText(braindumpDetails.braindump.content);
		} catch (err) {
			console.error('Failed to copy content:', err);
		}
	}

	// Handle delete request
	function handleDelete() {
		onDelete?.({ braindump: braindumpDetails?.braindump || braindump });
		onClose();
	}

	// Helper functions
	function getTimeDisplay(dateStr: string): string {
		const date = new Date(dateStr);
		const hoursAgo = differenceInHours(new Date(), date);

		if (hoursAgo < 24) {
			return formatDistanceToNow(date, { addSuffix: true });
		}

		return format(date, "MMM d, yyyy 'at' h:mm a");
	}

	function getStatusInfo(status: string): { color: string; icon: any } {
		switch (status) {
			case 'processed':
				return {
					color: 'text-accent bg-accent/10',
					icon: CheckCircle2
				};
			case 'processing':
				return {
					color: 'text-foreground bg-muted',
					icon: Clock
				};
			case 'pending':
				return {
					color: 'text-accent bg-accent/10',
					icon: Clock
				};
			default:
				return {
					color: 'text-muted-foreground bg-muted',
					icon: Brain
				};
		}
	}

	function getLinkedTypeInfo(type: string): { label: string; icon: any; color: string } {
		switch (type) {
			case 'project':
				return {
					label: 'Project',
					icon: FolderOpen,
					color: 'text-accent'
				};
			case 'task':
				return {
					label: 'Task',
					icon: CheckCircle2,
					color: 'text-accent'
				};
			case 'note':
				return {
					label: 'Note',
					icon: MessageSquare,
					color: 'text-muted-foreground'
				};
			default:
				return { label: type, icon: FileText, color: 'text-muted-foreground' };
		}
	}

	// Watch for modal open/close and braindump changes
	$effect(() => {
		if (isOpen && braindump) {
			fetchBraindumpDetails();
		}
	});

	let statusInfo = $derived(getStatusInfo(braindump?.status));
	let timeDisplay = $derived(braindump?.updated_at ? getTimeDisplay(braindump?.updated_at) : '');
	let isUnlinked = $derived(braindump?.isNote);
	let isNewProject = $derived(braindump?.isNewProject);
	let linkedProject = $derived(braindump?.linkedProject);
	let linkedTypes = $derived(braindump?.linkedTypes || []);

	// Handle braindump linked event
	function handleBraindumpLinked() {
		// Refresh the braindump details (the derived values will update automatically)
		fetchBraindumpDetails();
	}

	onMount(() => {
		if (isOpen && braindump) {
			fetchBraindumpDetails();
		}
	});
</script>

<Modal {isOpen} {onClose} size="xl" showCloseButton={true} title="Braindump Details">
	{#snippet children()}
		<div class="px-3 sm:px-4 py-3 sm:py-4">
			<!-- Info Header -->
			<div
				class="flex flex-col sm:flex-row sm:items-center gap-3 p-3 sm:p-4 bg-muted/50 border-b border-border -mx-3 sm:-mx-4 -mt-3 sm:-mt-4 mb-4"
			>
				<div class="flex items-center space-x-2 min-w-0 flex-1">
					<!-- Type indicator -->
					{#if isUnlinked}
						<div
							class="flex items-center space-x-1 px-2 py-1 bg-muted text-muted-foreground rounded-md flex-shrink-0"
						>
							<StickyNote class="w-4 h-4" />
							<span class="text-sm font-medium">Unlinked Note</span>
						</div>
					{:else if linkedProject}
						<div
							class="flex items-center space-x-1 px-2 py-1 bg-accent/10 text-accent rounded-md flex-shrink-0"
						>
							<FolderOpen class="w-4 h-4" />
							<span class="text-sm font-medium truncate">{linkedProject.name}</span>
						</div>
						{#if isNewProject}
							<div
								class="flex items-center space-x-1 px-2 py-1 bg-accent/10 text-accent rounded-md flex-shrink-0"
							>
								<Sparkles class="w-3 h-3" />
								<span class="text-xs font-medium">New</span>
							</div>
						{/if}
					{:else}
						<div class="p-1.5 bg-accent/10 rounded-md flex-shrink-0">
							<Brain class="w-4 h-4 text-accent" />
						</div>
					{/if}

					<!-- Status -->
					<div
						class="inline-flex items-center px-2 py-1 rounded text-xs font-medium {statusInfo.color} flex-shrink-0"
					>
						{#if statusInfo.icon}
							{@const Icon = statusInfo.icon}
							<Icon class="w-3 h-3 mr-1" />
						{/if}
						<span class="capitalize">{braindump?.status || 'draft'}</span>
					</div>
				</div>

				<!-- Actions -->
				<div class="flex items-center space-x-2 flex-shrink-0">
					{#if isUnlinked && braindump?.id}
						<LinkBraindumpToProject
							braindumpId={braindump.id}
							on:linked={handleBraindumpLinked}
						/>
					{/if}

					{#if braindumpDetails?.braindump?.content}
						<Button
							onclick={copyContent}
							variant="ghost"
							size="sm"
							icon={Copy}
							title="Copy content"
							class="p-3 min-w-[44px]"
						></Button>
					{/if}

					<Button
						onclick={handleDelete}
						variant="ghost"
						size="sm"
						icon={Trash2}
						title="Delete braindump"
						class="p-3 min-w-[44px] text-muted-foreground hover:text-destructive"
					></Button>

					{#if linkedProject?.id && !isUnlinked}
						<a
							href="/projects/{linkedProject.id}"
							class="inline-flex items-center px-3 py-3 sm:py-2 text-xs text-accent hover:text-accent/80 transition-colors bg-accent/5 rounded-md touch-manipulation min-h-[44px]"
							title="View project"
						>
							<ExternalLink class="w-3 h-3 mr-1 shrink-0" />
							<span class="hidden sm:inline">Project</span>
						</a>
					{/if}
				</div>
			</div>

			{#if isLoading}
				<!-- Loading state -->
				<div class="flex items-center justify-center py-8">
					<LoaderCircle class="w-6 h-6 animate-spin text-accent" />
					<span class="ml-2 text-sm text-muted-foreground">Loading...</span>
				</div>
			{:else if error}
				<!-- Error state -->
				<div class="text-center">
					<div class="text-destructive text-sm mb-2">{error}</div>
					<Button onclick={fetchBraindumpDetails} variant="ghost" size="sm">
						Try again
					</Button>
				</div>
			{:else if braindumpDetails}
				<!-- Main content -->
				<div class="space-y-4 sm:space-y-6">
					<!-- Title and time -->
					<div>
						{#if braindump?.title}
							<h2 class="text-base sm:text-lg font-semibold text-foreground mb-1">
								{braindump.title}
							</h2>
						{/if}
						<p class="text-sm text-muted-foreground">
							{timeDisplay}
						</p>
					</div>

					<!-- Linked types -->
					{#if linkedTypes.length > 0}
						<div class="flex flex-wrap gap-2">
							{#each linkedTypes as type}
								{@const typeInfo = getLinkedTypeInfo(type)}
								<div
									class="inline-flex items-center px-2 py-1 bg-muted rounded text-xs {typeInfo.color}"
								>
									{#if typeInfo.icon}
										{@const Icon = typeInfo.icon}
										<Icon class="w-3 h-3 mr-1" />
									{/if}
									{typeInfo.label}
								</div>
							{/each}
						</div>
					{/if}

					<!-- Main content -->
					{#if braindumpDetails.braindump.content}
						<div>
							<h3
								class="text-sm font-semibold text-foreground mb-2 flex items-center"
							>
								<FileText class="w-4 h-4 mr-2" />
								Content
							</h3>
							<div class="bg-muted/50 rounded-lg p-3 overflow-x-auto">
								<div class={getProseClasses('sm')}>
									{@html renderMarkdown(braindumpDetails.braindump.content)}
								</div>
							</div>
						</div>
					{/if}

					<!-- AI Summary -->
					{#if braindumpDetails.braindump.ai_summary}
						<div>
							<h3
								class="text-sm font-semibold text-foreground mb-2 flex items-center"
							>
								<Zap class="w-4 h-4 mr-2 text-accent" />
								AI Summary
							</h3>
							<div
								class="bg-accent/5 rounded-lg p-3 border border-accent/20 overflow-x-auto"
							>
								<div class={getProseClasses('sm')}>
									{@html renderMarkdown(braindumpDetails.braindump.ai_summary)}
								</div>
							</div>
						</div>
					{/if}

					<!-- Linked content sections (if available from API) -->
					{#if braindumpDetails.linkedData}
						<!-- Linked Tasks -->
						{#if braindumpDetails.linkedData.tasks?.length > 0}
							<div>
								<h3
									class="text-sm font-semibold text-foreground mb-2 flex items-center"
								>
									<CheckCircle2 class="w-4 h-4 mr-2 text-accent" />
									Tasks ({braindumpDetails.linkedData.tasks.length})
								</h3>
								<div class="space-y-2">
									{#each braindumpDetails.linkedData.tasks as task}
										<div
											class="bg-accent/5 rounded-lg p-2 border border-accent/20"
										>
											<div class="flex items-start space-x-2">
												{#if task.status === 'done'}
													<CheckCircle2
														class="w-3 h-3 text-accent mt-0.5 flex-shrink-0"
													/>
												{:else if task.status === 'in_progress'}
													<Clock
														class="w-3 h-3 text-muted-foreground mt-0.5 flex-shrink-0"
													/>
												{:else}
													<div
														class="w-3 h-3 border border-border rounded mt-0.5 flex-shrink-0"
													></div>
												{/if}
												<div class="min-w-0 flex-1">
													<h4 class="font-medium text-foreground text-xs">
														{task.title}
													</h4>
													{#if task.description}
														<p
															class="text-xs text-muted-foreground mt-0.5 line-clamp-2"
														>
															{task.description}
														</p>
													{/if}
												</div>
											</div>
										</div>
									{/each}
								</div>
							</div>
						{/if}

						<!-- Linked Notes -->
						{#if braindumpDetails.linkedData.notes?.length > 0}
							<div>
								<h3
									class="text-sm font-semibold text-foreground mb-2 flex items-center"
								>
									<MessageSquare class="w-4 h-4 mr-2 text-muted-foreground" />
									Notes ({braindumpDetails.linkedData.notes.length})
								</h3>
								<div class="space-y-2">
									{#each braindumpDetails.linkedData.notes as note}
										<div
											class="bg-muted/50 rounded-lg p-2 border border-border"
										>
											<h4 class="font-medium text-foreground text-xs mb-1">
												{note.title || 'Untitled Note'}
											</h4>
											{#if note.content}
												<p
													class="text-xs text-muted-foreground line-clamp-2"
												>
													{note.content.substring(0, 100)}{note.content
														.length > 100
														? '...'
														: ''}
												</p>
											{/if}
										</div>
									{/each}
								</div>
							</div>
						{/if}
					{/if}
				</div>
			{/if}
		</div>
	{/snippet}
	{#snippet footer()}
		<div class="px-3 sm:px-4 py-3 border-t border-border bg-muted/50">
			{#if braindumpDetails?.metadata}
				<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 text-center mb-3">
					<div>
						<div class="text-xs sm:text-sm font-medium text-foreground">
							{braindumpDetails.metadata.linkCount || 0}
						</div>
						<div class="text-xs text-muted-foreground">Links</div>
					</div>
					<div>
						<div class="text-xs sm:text-sm font-medium text-foreground">
							{braindumpDetails.metadata.wordCount || 0}
						</div>
						<div class="text-xs text-muted-foreground">Words</div>
					</div>
					<div>
						<div class="text-xs sm:text-sm font-medium text-foreground">
							{Math.round((braindumpDetails.metadata.characterCount || 0) / 1024)}KB
						</div>
						<div class="text-xs text-muted-foreground">Size</div>
					</div>
					<div>
						<div class="text-xs sm:text-sm font-medium text-foreground">
							{format(new Date(braindumpDetails.braindump.updated_at), 'MMM d')}
						</div>
						<div class="text-xs text-muted-foreground">Created</div>
					</div>
				</div>
			{/if}
			<div class="flex justify-end">
				<Button onclick={onClose} variant="outline" size="md">Close</Button>
			</div>
		</div>
	{/snippet}
</Modal>
