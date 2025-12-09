<!-- apps/web/src/lib/components/brain-dump/TasksNotesPreview.svelte -->
<script lang="ts">
	import type { TaskNoteExtractionResult } from '$lib/types/brain-dump';
	import {
		CheckSquare,
		FileText,
		Clock,
		AlertCircle,
		Lightbulb,
		Zap,
		Eye,
		Bookmark,
		HelpCircle,
		RefreshCw,
		ChevronRight
	} from 'lucide-svelte';
	import { fade, slide } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';

	export let result: TaskNoteExtractionResult | null = null;

	// Provide default empty result if none provided
	$: safeResult = result || { tasks: [], notes: [] };

	const priorityConfig = {
		high: {
			color: 'rgb(239 68 68)',
			bg: 'rgba(239, 68, 68, 0.1)',
			label: 'High',
			dot: true
		},
		medium: {
			color: 'rgb(251 191 36)',
			bg: 'rgba(251, 191, 36, 0.1)',
			label: 'Medium',
			dot: true
		},
		low: {
			color: 'rgb(107 114 128)',
			bg: 'rgba(107, 114, 128, 0.1)',
			label: 'Low',
			dot: false
		}
	};

	const statusConfig = {
		backlog: { icon: '📋', label: 'Backlog' },
		in_progress: { icon: '🚀', label: 'In Progress' },
		done: { icon: '✅', label: 'Done' },
		blocked: { icon: '🚫', label: 'Blocked' }
	};

	// Check if this is an update operation with partial data
	function isUpdateOperation(item: any): boolean {
		return item.operation === 'update' || (item.id && !item.title);
	}

	const categoryIcons = {
		insight: Lightbulb,
		idea: Zap,
		observation: Eye,
		reference: Bookmark,
		question: HelpCircle
	};

	// Helper to truncate text properly
	function truncateText(text: string, maxLength: number): string {
		if (!text) return '';
		if (text.length <= maxLength) return text;
		return text.substring(0, maxLength).trim() + '...';
	}
</script>

<div class="preview-container">
	<!-- Tasks Section -->
	<div class="section">
		<div class="section-header">
			<div class="section-icon">
				<CheckSquare class="w-4 h-4" />
			</div>
			<h3 class="section-title">
				Tasks
				<span class="count-badge">{safeResult.tasks.length}</span>
			</h3>
		</div>

		{#if safeResult?.tasks?.length}
			<div class="items-container">
				{#each safeResult.tasks.slice(0, 5) as task, i}
					{@const isUpdate = isUpdateOperation(task)}
					<div
						class="task-item {isUpdate ? 'task-update' : ''}"
						transition:slide={{ duration: 300, delay: i * 50, easing: quintOut }}
					>
						<!-- Task Checkbox/Icon -->
						<div class="task-checkbox">
							{#if task.status === 'done'}
								<CheckSquare class="w-4 h-4 text-green-500" />
							{:else}
								<div class="checkbox-empty"></div>
							{/if}
						</div>

						<!-- Task Content -->
						<div class="task-content">
							{#if isUpdate && task.id}
								<div class="update-badge">
									<RefreshCw class="w-3 h-3" />
									Updating
								</div>
							{/if}

							<h4 class="task-title">
								{task.title || (isUpdate ? '(Title unchanged)' : 'Untitled Task')}
							</h4>

							{#if task.description || task.details}
								<p class="task-description">
									{truncateText(task.description || task.details || '', 120)}
								</p>
							{/if}

							<!-- Task Metadata -->
							<div class="task-meta">
								{#if task.priority}
									{@const config =
										priorityConfig[task.priority] || priorityConfig.low}
									<div
										class="priority-badge"
										style="background: {config.bg}; color: {config.color}"
									>
										{#if config.dot}
											<span
												class="priority-dot"
												style="background: {config.color}"
											></span>
										{/if}
										{config.label}
									</div>
								{/if}

								{#if task.duration_minutes}
									<div class="time-badge">
										<Clock class="w-3 h-3" />
										{task.duration_minutes}m
									</div>
								{/if}

								{#if task.task_type === 'recurring'}
									<div class="recurring-badge">
										<RefreshCw class="w-3 h-3" />
										Recurring
									</div>
								{/if}

								{#if isUpdate}
									<div class="fields-updated">
										{Object.keys(task).filter(
											(key) =>
												![
													'id',
													'operation',
													'user_id',
													'project_id'
												].includes(key)
										).length} fields
									</div>
								{/if}
							</div>
						</div>

						<!-- Right Arrow -->
						<div class="task-arrow">
							<ChevronRight class="w-4 h-4" />
						</div>
					</div>
				{/each}

				{#if safeResult?.tasks?.length > 5}
					<div class="more-items" transition:fade={{ duration: 200 }}>
						<span class="more-dot"></span>
						<span class="more-dot"></span>
						<span class="more-dot"></span>
						<span class="more-text">+{safeResult.tasks.length - 5} more</span>
					</div>
				{/if}
			</div>
		{:else if !result || !result.tasks}
			<div class="empty-state">
				<div class="empty-icon">
					<CheckSquare class="w-6 h-6" />
				</div>
				<p>Processing tasks...</p>
				<span>Tasks will appear here shortly</span>
			</div>
		{:else}
			<div class="empty-state">
				<div class="empty-icon">
					<CheckSquare class="w-6 h-6" />
				</div>
				<p>No tasks extracted</p>
				<span>Tasks will appear here when found</span>
			</div>
		{/if}
	</div>

	<!-- Notes Section (only show if there are notes) -->
	{#if safeResult.notes.length > 0}
		<div class="section">
			<div class="section-header">
				<div class="section-icon section-icon-notes">
					<FileText class="w-4 h-4" />
				</div>
				<h3 class="section-title">
					Notes
					<span class="count-badge">{safeResult.notes.length}</span>
				</h3>
			</div>

			<div class="items-container">
				{#each safeResult.notes.slice(0, 4) as note, i}
					{@const isUpdate = isUpdateOperation(note)}
					<div
						class="note-item {isUpdate ? 'note-update' : ''}"
						transition:slide={{ duration: 300, delay: i * 50, easing: quintOut }}
					>
						<!-- Note Icon -->
						<div class="note-icon">
							{#if note.category && categoryIcons[note.category]}
								{@const Category = categoryIcons[note.category]}
								<Category class="w-4 h-4" />
							{:else}
								<FileText class="w-4 h-4" />
							{/if}
						</div>

						<!-- Note Content -->
						<div class="note-content">
							{#if isUpdate && note.id}
								<div class="update-badge update-badge-notes">
									<RefreshCw class="w-3 h-3" />
									Updating
								</div>
							{/if}

							<h4 class="note-title">
								{note.title || (isUpdate ? '(Title unchanged)' : 'Untitled Note')}
							</h4>

							{#if note.content}
								<p class="note-description">
									{truncateText(note.content, 100)}
								</p>
							{/if}

							<!-- Note Tags -->
							{#if note.tags && note.tags.length > 0}
								<div class="note-tags">
									{#each note.tags.slice(0, 3) as tag}
										<span class="tag">{tag}</span>
									{/each}
									{#if note.tags.length > 3}
										<span class="tag-more">+{note.tags.length - 3}</span>
									{/if}
								</div>
							{/if}
						</div>

						<!-- Right Arrow -->
						<div class="note-arrow">
							<ChevronRight class="w-4 h-4" />
						</div>
					</div>
				{/each}

				{#if safeResult.notes.length > 4}
					<div class="more-items" transition:fade={{ duration: 200 }}>
						<span class="more-dot"></span>
						<span class="more-dot"></span>
						<span class="more-dot"></span>
						<span class="more-text">+{safeResult.notes.length - 4} more</span>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.preview-container {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.section-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding-bottom: 0.5rem;
	}

	.section-icon {
		width: 2rem;
		height: 2rem;
		border-radius: 0.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		background: linear-gradient(135deg, rgb(59 130 246), rgb(99 102 241));
		color: white;
		box-shadow: 0 2px 4px rgba(59, 130, 246, 0.2);
	}

	.section-icon-notes {
		background: linear-gradient(135deg, rgb(168 85 247), rgb(236 72 153));
		box-shadow: 0 2px 4px rgba(168, 85, 247, 0.2);
	}

	.section-title {
		font-size: 0.9375rem;
		font-weight: 600;
		color: rgb(17 24 39);
		margin: 0;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	:global(.dark) .section-title {
		color: rgb(243 244 246);
	}

	.count-badge {
		font-size: 0.75rem;
		font-weight: 500;
		padding: 0.125rem 0.375rem;
		border-radius: 9999px;
		background: rgb(243 244 246);
		color: rgb(75 85 99);
	}

	:global(.dark) .count-badge {
		background: rgb(55 65 81);
		color: rgb(209 213 219);
	}

	.items-container {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-height: 20rem;
		overflow-y: auto;
		padding-right: 0.25rem;
	}

	/* Custom scrollbar */
	.items-container::-webkit-scrollbar {
		width: 6px;
	}

	.items-container::-webkit-scrollbar-track {
		background: transparent;
	}

	.items-container::-webkit-scrollbar-thumb {
		background: rgb(209 213 219);
		border-radius: 3px;
	}

	:global(.dark) .items-container::-webkit-scrollbar-thumb {
		background: rgb(75 85 99);
	}

	/* Task Item */
	.task-item {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 0.875rem;
		background: white;
		border: 1px solid rgb(229 231 235);
		border-radius: 0.75rem;
		transition: all 0.2s ease;
		cursor: default;
		position: relative;
	}

	:global(.dark) .task-item {
		background: rgb(31 41 55);
		border-color: rgb(55 65 81);
	}

	.task-item:hover {
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
		transform: translateY(-1px);
	}

	:global(.dark) .task-item:hover {
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
	}

	.task-update {
		background: linear-gradient(to right, rgba(59, 130, 246, 0.03), transparent);
		border-color: rgba(59, 130, 246, 0.2);
	}

	:global(.dark) .task-update {
		background: linear-gradient(to right, rgba(59, 130, 246, 0.1), transparent);
	}

	.task-checkbox {
		flex-shrink: 0;
		margin-top: 0.125rem;
	}

	.checkbox-empty {
		width: 1rem;
		height: 1rem;
		border: 2px solid rgb(209 213 219);
		border-radius: 0.25rem;
	}

	:global(.dark) .checkbox-empty {
		border-color: rgb(75 85 99);
	}

	.task-content {
		flex: 1;
		min-width: 0;
	}

	.task-title {
		font-size: 0.875rem;
		font-weight: 500;
		color: rgb(17 24 39);
		margin: 0 0 0.25rem 0;
		line-height: 1.4;
	}

	:global(.dark) .task-title {
		color: rgb(243 244 246);
	}

	.task-description {
		font-size: 0.8125rem;
		color: rgb(107 114 128);
		margin: 0 0 0.5rem 0;
		line-height: 1.5;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	:global(.dark) .task-description {
		color: rgb(156 163 175);
	}

	.task-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}

	.priority-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.125rem 0.5rem;
		border-radius: 9999px;
		font-size: 0.6875rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.025em;
	}

	.priority-dot {
		width: 0.375rem;
		height: 0.375rem;
		border-radius: 50%;
	}

	.time-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.125rem 0.375rem;
		background: rgb(243 244 246);
		color: rgb(75 85 99);
		border-radius: 0.375rem;
		font-size: 0.6875rem;
		font-weight: 500;
	}

	:global(.dark) .time-badge {
		background: rgb(55 65 81);
		color: rgb(209 213 219);
	}

	.recurring-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.125rem 0.375rem;
		background: rgba(168, 85, 247, 0.1);
		color: rgb(168 85 247);
		border-radius: 0.375rem;
		font-size: 0.6875rem;
		font-weight: 500;
	}

	:global(.dark) .recurring-badge {
		background: rgba(168, 85, 247, 0.2);
		color: rgb(196 181 253);
	}

	.fields-updated {
		font-size: 0.6875rem;
		color: rgb(107 114 128);
	}

	:global(.dark) .fields-updated {
		color: rgb(156 163 175);
	}

	.update-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0 0.375rem;
		height: 1.125rem;
		background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(99, 102, 241, 0.1));
		color: rgb(59 130 246);
		border-radius: 0.25rem;
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 0.25rem;
	}

	:global(.dark) .update-badge {
		background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(99, 102, 241, 0.2));
		color: rgb(147 197 253);
	}

	.update-badge-notes {
		background: linear-gradient(135deg, rgba(168, 85, 247, 0.1), rgba(236, 72, 153, 0.1));
		color: rgb(168 85 247);
	}

	:global(.dark) .update-badge-notes {
		background: linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(236, 72, 153, 0.2));
		color: rgb(196 181 253);
	}

	.task-arrow {
		flex-shrink: 0;
		color: rgb(209 213 219);
		opacity: 0;
		transition: opacity 0.2s ease;
	}

	:global(.dark) .task-arrow {
		color: rgb(75 85 99);
	}

	.task-item:hover .task-arrow {
		opacity: 1;
	}

	/* Note Item */
	.note-item {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 0.875rem;
		background: white;
		border: 1px solid rgb(229 231 235);
		border-radius: 0.75rem;
		transition: all 0.2s ease;
		cursor: default;
		position: relative;
	}

	:global(.dark) .note-item {
		background: rgb(31 41 55);
		border-color: rgb(55 65 81);
	}

	.note-item:hover {
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
		transform: translateY(-1px);
	}

	:global(.dark) .note-item:hover {
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
	}

	.note-update {
		background: linear-gradient(to right, rgba(168, 85, 247, 0.03), transparent);
		border-color: rgba(168, 85, 247, 0.2);
	}

	:global(.dark) .note-update {
		background: linear-gradient(to right, rgba(168, 85, 247, 0.1), transparent);
	}

	.note-icon {
		flex-shrink: 0;
		width: 2rem;
		height: 2rem;
		border-radius: 0.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		background: linear-gradient(135deg, rgb(243 244 246), rgb(229 231 235));
		color: rgb(107 114 128);
	}

	:global(.dark) .note-icon {
		background: linear-gradient(135deg, rgb(55 65 81), rgb(75 85 99));
		color: rgb(209 213 219);
	}

	.note-content {
		flex: 1;
		min-width: 0;
	}

	.note-title {
		font-size: 0.875rem;
		font-weight: 500;
		color: rgb(17 24 39);
		margin: 0 0 0.25rem 0;
		line-height: 1.4;
		display: -webkit-box;
		-webkit-line-clamp: 1;
		line-clamp: 1;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	:global(.dark) .note-title {
		color: rgb(243 244 246);
	}

	.note-description {
		font-size: 0.8125rem;
		color: rgb(107 114 128);
		margin: 0 0 0.5rem 0;
		line-height: 1.5;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	:global(.dark) .note-description {
		color: rgb(156 163 175);
	}

	.note-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.tag {
		padding: 0.125rem 0.375rem;
		background: rgb(243 244 246);
		color: rgb(75 85 99);
		border-radius: 0.25rem;
		font-size: 0.625rem;
		font-weight: 500;
	}

	:global(.dark) .tag {
		background: rgb(55 65 81);
		color: rgb(209 213 219);
	}

	.tag-more {
		font-size: 0.625rem;
		color: rgb(107 114 128);
	}

	:global(.dark) .tag-more {
		color: rgb(156 163 175);
	}

	.note-arrow {
		flex-shrink: 0;
		color: rgb(209 213 219);
		opacity: 0;
		transition: opacity 0.2s ease;
	}

	:global(.dark) .note-arrow {
		color: rgb(75 85 99);
	}

	.note-item:hover .note-arrow {
		opacity: 1;
	}

	/* More Items */
	.more-items {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		padding: 0.75rem;
	}

	.more-dot {
		width: 0.25rem;
		height: 0.25rem;
		border-radius: 50%;
		background: rgb(156 163 175);
		animation: pulse 1.5s ease-in-out infinite;
	}

	.more-dot:nth-child(2) {
		animation-delay: 0.2s;
	}

	.more-dot:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 0.3;
		}
		50% {
			opacity: 1;
		}
	}

	.more-text {
		font-size: 0.75rem;
		color: rgb(107 114 128);
		margin-left: 0.25rem;
	}

	:global(.dark) .more-text {
		color: rgb(156 163 175);
	}

	/* Empty State */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 1.5rem;
		background: linear-gradient(135deg, rgb(249 250 251), rgb(243 244 246));
		border: 2px dashed rgb(209 213 219);
		border-radius: 0.75rem;
		text-align: center;
	}

	:global(.dark) .empty-state {
		background: linear-gradient(135deg, rgb(31 41 55), rgb(17 24 39));
		border-color: rgb(75 85 99);
	}

	.empty-icon {
		width: 3rem;
		height: 3rem;
		border-radius: 0.75rem;
		display: flex;
		align-items: center;
		justify-content: center;
		background: white;
		color: rgb(156 163 175);
		margin-bottom: 1rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}

	:global(.dark) .empty-icon {
		background: rgb(55 65 81);
		color: rgb(107 114 128);
	}

	.empty-state p {
		font-size: 0.875rem;
		font-weight: 500;
		color: rgb(75 85 99);
		margin: 0 0 0.25rem 0;
	}

	:global(.dark) .empty-state p {
		color: rgb(209 213 219);
	}

	.empty-state span {
		font-size: 0.75rem;
		color: rgb(156 163 175);
	}

	:global(.dark) .empty-state span {
		color: rgb(107 114 128);
	}
</style>
