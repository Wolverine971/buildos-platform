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
			'<mark class="bg-accent/30 text-foreground font-semibold px-0.5 rounded-sm">$1</mark>'
		);
	}

	// Helper to get status color and icon
	function getStatusInfo(status: string): { color: string; icon: any } {
		switch (status) {
			case 'processed':
				return {
					color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
					icon: CheckCircle2
				};
			case 'processing':
				return {
					color: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
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

	// Helper to get linked type display
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
					color: 'text-emerald-600 dark:text-emerald-400'
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
					color: 'text-muted-foreground'
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
	class="group cursor-pointer border transition-all duration-200 pressable
	{isUnlinked
		? 'border-amber-500/40 hover:border-amber-500/60'
		: isNewProject
			? 'border-emerald-500/40 hover:border-emerald-500/60'
			: 'border-border hover:border-accent/50'}"
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
					<div class="flex items-center space-x-1 text-amber-600 dark:text-amber-400">
						<StickyNote class="w-4 h-4 flex-shrink-0" />
						<span class="text-sm font-medium">Unlinked Note</span>
					</div>
				{:else if linkedProject}
					<div class="flex items-center space-x-1 text-accent min-w-0">
						<FolderOpen class="w-4 h-4 flex-shrink-0" />
						<span class="text-sm font-medium truncate">{linkedProject.name}</span>
					</div>
					{#if isNewProject}
						<div
							class="flex items-center space-x-1 px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full text-xs font-medium flex-shrink-0"
						>
							<Sparkles class="w-3 h-3" />
							<span>New</span>
						</div>
					{/if}
				{:else}
					<div class="flex items-center space-x-1 text-muted-foreground">
						<Brain class="w-4 h-4 flex-shrink-0" />
						<span class="text-sm font-medium">Braindump</span>
					</div>
				{/if}
			</div>

			<div class="flex items-center space-x-2 flex-shrink-0">
				<span class="text-xs text-muted-foreground font-medium">
					{timeDisplay}
				</span>
				<Button
					onclick={handleDelete}
					variant="ghost"
					size="sm"
					btnType="container"
					class="p-1.5 min-h-0 min-w-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-all duration-200 opacity-0 group-hover:opacity-100"
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
			<div class="text-xs sm:text-sm text-muted-foreground mb-3 line-clamp-2">
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
							{@const Icon = typeInfo.icon}
							<div class="flex items-center space-x-1 text-xs {typeInfo.color}">
								{#if typeInfo.icon}
									<Icon class="w-3 h-3" />
								{/if}
								<span>{typeInfo.label}</span>
							</div>
						{/each}
						{#if linkedTypes.length > 2}
							<span class="text-xs text-muted-foreground">
								+{linkedTypes.length - 2}
							</span>
						{/if}
					</div>
				{/if}

				<!-- Project link -->
				{#if linkedProject?.id && !isUnlinked}
					<a
						href="/projects/{linkedProject.id}"
						class="flex items-center space-x-1 text-xs text-accent hover:text-accent/80 transition-colors"
						onclick={(e) => e.stopPropagation()}
					>
						<ExternalLink class="w-3 h-3 shrink-0" />
						<span class="hidden sm:inline">View</span>
					</a>
				{/if}
			</div>

			<!-- Status -->
			<div class="flex-shrink-0">
				<div
					class="inline-flex items-center px-2 py-1 rounded text-xs font-medium {statusInfo.color}"
				>
					{#if statusInfo.icon}
						{@const StatusIcon = statusInfo.icon}
						<StatusIcon class="w-3 h-3 mr-1" />
					{/if}
					<span class="capitalize">{braindump.status || 'draft'}</span>
				</div>
			</div>
		</div>
	</CardBody>
</Card>
