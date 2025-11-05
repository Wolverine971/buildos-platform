<!-- apps/web/src/lib/components/history/BraindumpHistoryCard.svelte -->
<script lang="ts">
	import {
		Brain,
		FolderOpen,
		StickyNote,
		CheckCircle2,
		Clock,
		MessageSquare,
		ExternalLink,
		Sparkles,
		FileText,
		Trash2
	} from 'lucide-svelte';
	import { format, formatDistanceToNow, differenceInHours } from 'date-fns';
	import { createEventDispatcher } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';

	export let braindump: any;
	export let onClick: () => void;
	export let highlightSearch: string = '';

	const dispatch = createEventDispatcher();

	function handleDelete(e: MouseEvent) {
		e.stopPropagation();
		dispatch('delete', { braindump });
	}

	// Helper to get time display
	function getTimeDisplay(dateStr: string): string {
		const date = new Date(dateStr);
		const hoursAgo = differenceInHours(new Date(), date);

		if (hoursAgo < 24) {
			return formatDistanceToNow(date, { addSuffix: true });
		}

		return format(date, 'MMM d, yyyy');
	}

	// Helper to truncate content
	function truncateContent(content: string, maxLength: number = 100): string {
		if (!content) return '';
		const stripped = content.replace(/[#*_`]/g, '').trim();
		return stripped.length > maxLength ? stripped.substring(0, maxLength) + '...' : stripped;
	}

	// Helper to highlight search terms
	function highlightText(text: string, searchTerm: string): string {
		if (!searchTerm || !text) return text;
		const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
		return text.replace(
			regex,
			'<mark class="bg-yellow-200 dark:bg-yellow-800/50 px-0.5 rounded">$1</mark>'
		);
	}

	// Helper to get status color and icon
	function getStatusInfo(status: string): { color: string; icon: any } {
		switch (status) {
			case 'processed':
				return {
					color: 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30',
					icon: CheckCircle2
				};
			case 'processing':
				return {
					color: 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30',
					icon: Clock
				};
			case 'pending':
				return {
					color: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30',
					icon: Clock
				};
			default:
				return {
					color: 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700',
					icon: Brain
				};
		}
	}

	// Helper to get linked type display
	function getLinkedTypeInfo(type: string): { label: string; icon: any; color: string } {
		switch (type) {
			case 'project':
				return {
					label: 'Project',
					icon: FolderOpen,
					color: 'text-blue-600 dark:text-blue-400'
				};
			case 'task':
				return {
					label: 'Task',
					icon: CheckCircle2,
					color: 'text-green-600 dark:text-green-400'
				};
			case 'note':
				return {
					label: 'Note',
					icon: MessageSquare,
					color: 'text-amber-600 dark:text-amber-400'
				};
			default:
				return {
					label: type,
					icon: FileText,
					color: 'text-gray-600 dark:text-gray-400'
				};
		}
	}

	$: statusInfo = getStatusInfo(braindump.status);
	$: timeDisplay = getTimeDisplay(braindump.updated_at);
	$: isUnlinked = braindump.isNote;
	$: isNewProject = braindump.isNewProject;
	$: linkedProject = braindump.linkedProject;
	$: linkedTypes = braindump.linkedTypes || [];
</script>

<Card
	variant="interactive"
	class="group cursor-pointer border-2 transition-all duration-200
	{isUnlinked
		? 'border-amber-200 dark:border-amber-800 hover:border-amber-300 dark:hover:border-amber-700'
		: isNewProject
			? 'border-green-200 dark:border-green-800 hover:border-green-300 dark:hover:border-green-700'
			: 'border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600'}"
	onclick={onClick}
	onkeydown={(e) => e.key === 'Enter' && onClick()}
	role="button"
	tabindex="0"
>
	<!-- Header: Project/Note name + Time -->
	<CardHeader variant="default">
		<div class="flex items-center justify-between">
			<div class="flex items-center space-x-2 min-w-0 flex-1">
				{#if isUnlinked}
					<div class="flex items-center space-x-1 text-amber-700 dark:text-amber-300">
						<StickyNote class="w-4 h-4 flex-shrink-0" />
						<span class="text-sm font-medium">Unlinked Note</span>
					</div>
				{:else if linkedProject}
					<div
						class="flex items-center space-x-1 text-blue-700 dark:text-blue-300 min-w-0"
					>
						<FolderOpen class="w-4 h-4 flex-shrink-0" />
						<span class="text-sm font-medium truncate">{linkedProject.name}</span>
					</div>
					{#if isNewProject}
						<div
							class="flex items-center space-x-1 px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-xs font-medium flex-shrink-0"
						>
							<Sparkles class="w-3 h-3" />
							<span>New</span>
						</div>
					{/if}
				{:else}
					<div class="flex items-center space-x-1 text-gray-600 dark:text-gray-400">
						<Brain class="w-4 h-4 flex-shrink-0" />
						<span class="text-sm font-medium">Braindump</span>
					</div>
				{/if}
			</div>

			<div class="flex items-center space-x-2 flex-shrink-0">
				<span class="text-xs text-gray-500 dark:text-gray-400 font-medium">
					{timeDisplay}
				</span>
				<Button
					onclick={handleDelete}
					variant="ghost"
					size="sm"
					btnType="container"
					class="p-1.5 min-h-0 min-w-0 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-all duration-200 opacity-0 group-hover:opacity-100"
					aria-label="Delete braindump"
					title="Delete braindump"
				>
					<Trash2 class="w-4 h-4" />
				</Button>
			</div>
		</div>
	</CardHeader>

	<!-- Content -->
	<CardBody padding="md">
		<!-- Content preview -->
		{#if braindump.content || braindump.ai_summary}
			{@const contentToShow = braindump.ai_summary || braindump.content}
			<div class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
				{#if highlightSearch}
					{@html highlightText(truncateContent(contentToShow), highlightSearch)}
				{:else}
					{truncateContent(contentToShow)}
				{/if}
			</div>
		{/if}

		<!-- Processed types and status row -->
		<div class="flex items-center justify-between gap-2">
			<!-- Linked types -->
			<div class="flex items-center gap-2 min-w-0 flex-1">
				{#if linkedTypes.length > 0}
					<div class="flex items-center gap-1 flex-wrap">
						{#each linkedTypes.slice(0, 2) as type}
							{@const typeInfo = getLinkedTypeInfo(type)}
							<div class="flex items-center space-x-1 text-xs {typeInfo.color}">
								{@const Icon = typeInfo.icon}
								<Icon class="w-3 h-3" />
								<span>{typeInfo.label}</span>
							</div>
						{/each}
						{#if linkedTypes.length > 2}
							<span class="text-xs text-gray-500 dark:text-gray-400">
								+{linkedTypes.length - 2}
							</span>
						{/if}
					</div>
				{/if}

				<!-- Project link -->
				{#if linkedProject?.id && !isUnlinked}
					<a
						href="/projects/{linkedProject.id}"
						class="flex items-center space-x-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
						onclick={(e) => e.stopPropagation()}
					>
						<ExternalLink class="w-3 h-3" />
						<span class="hidden sm:inline">View</span>
					</a>
				{/if}
			</div>

			<!-- Status -->
			<div class="flex-shrink-0">
				<div
					class="inline-flex items-center px-2 py-1 rounded text-xs font-medium {statusInfo.color}"
				>
					{@const Icon = statusInfo.icon}
					<Icon class="w-3 h-3 mr-1" />
					<span class="capitalize">{braindump.status || 'draft'}</span>
				</div>
			</div>
		</div>
	</CardBody>
</Card>
