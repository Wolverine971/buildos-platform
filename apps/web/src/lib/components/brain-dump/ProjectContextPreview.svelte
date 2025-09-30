<!-- apps/web/src/lib/components/brain-dump/ProjectContextPreview.svelte -->
<script lang="ts">
	import type { ProjectContextResult } from '$lib/types/brain-dump';
	import { Folder, FolderPlus, Hash, FileText, Sparkles } from 'lucide-svelte';
	import { fade } from 'svelte/transition';

	export let result: ProjectContextResult;

	$: isUpdate = !!result.projectUpdate;
	$: data = result.projectUpdate || result.projectCreate;
</script>

{#if data}
	<div class="context-preview">
		<!-- Status Header -->
		<div class="status-header" transition:fade={{ duration: 200 }}>
			<div class="status-badge {isUpdate ? 'status-update' : 'status-new'}">
				<div class="status-icon">
					{#if isUpdate}
						<Folder class="w-3.5 h-3.5" />
					{:else}
						<FolderPlus class="w-3.5 h-3.5" />
					{/if}
				</div>
				<span>{isUpdate ? 'Updating Project' : 'Creating Project'}</span>
			</div>

			{#if data.status}
				<div class="project-status" data-status={data.status}>
					<span class="status-dot"></span>
					{data.status}
				</div>
			{/if}
		</div>

		<!-- Project Name (for new projects) -->
		{#if !isUpdate && result.projectCreate?.name}
			<div class="project-name-section" transition:fade={{ duration: 300, delay: 100 }}>
				<h4 class="project-name">{result.projectCreate.name}</h4>
			</div>
		{/if}

		<!-- Executive Summary -->
		{#if data.executive_summary}
			<div class="summary-section" transition:fade={{ duration: 300, delay: 150 }}>
				<div class="section-header">
					<Sparkles class="w-3.5 h-3.5 text-amber-500" />
					<span>Executive Summary</span>
				</div>
				<p class="summary-text">{data.executive_summary}</p>
			</div>
		{/if}

		<!-- Tags -->
		{#if data.tags && data.tags.length > 0}
			<div class="tags-section" transition:fade={{ duration: 300, delay: 200 }}>
				<div class="section-header">
					<Hash class="w-3.5 h-3.5 text-blue-500" />
					<span>Tags</span>
				</div>
				<div class="tags-list">
					{#each data.tags as tag}
						<span class="tag-pill">{tag}</span>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Context Preview -->
		{#if data.context}
			<div class="context-section" transition:fade={{ duration: 300, delay: 250 }}>
				<div class="section-header">
					<FileText class="w-3.5 h-3.5 text-purple-500" />
					<span>Context Document</span>
				</div>
				<div class="context-preview-box">
					<div class="context-content">
						{@html data.context.substring(0, 400) +
							(data.context.length > 400 ? '...' : '')}
					</div>
					{#if data.context.length > 400}
						<div class="context-fade"></div>
						<p class="context-note">
							Full document will be {isUpdate ? 'updated' : 'created'} • {data.context
								.length} characters
						</p>
					{/if}
				</div>
			</div>
		{/if}
	</div>
{:else if result && !data}
	<!-- No context update needed -->
	<div class="no-update-needed" transition:fade={{ duration: 200 }}>
		<div class="no-update-icon">
			<Folder class="w-8 h-8 text-gray-400" />
		</div>
		<h4 class="no-update-title">No Context Update Needed</h4>
		<p class="no-update-message">
			The brain dump content doesn't require any changes to the project context. All
			information has been captured as tasks and notes.
		</p>
	</div>
{/if}

<style>
	.context-preview {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	/* Status Header */
	.status-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.status-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.75rem;
		border-radius: 0.5rem;
		font-size: 0.8125rem;
		font-weight: 500;
		transition: all 0.2s ease;
	}

	.status-update {
		background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(99, 102, 241, 0.1));
		color: rgb(59 130 246);
		border: 1px solid rgba(59, 130, 246, 0.2);
	}

	:global(.dark) .status-update {
		background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(99, 102, 241, 0.15));
		color: rgb(147 197 253);
		border-color: rgba(59, 130, 246, 0.3);
	}

	.status-new {
		background: linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(16, 185, 129, 0.1));
		color: rgb(34 197 94);
		border: 1px solid rgba(34, 197, 94, 0.2);
	}

	:global(.dark) .status-new {
		background: linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(16, 185, 129, 0.15));
		color: rgb(134 239 172);
		border-color: rgba(34, 197, 94, 0.3);
	}

	.status-icon {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.project-status {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.625rem;
		background: rgb(243 244 246);
		border-radius: 9999px;
		font-size: 0.75rem;
		font-weight: 500;
		text-transform: capitalize;
		color: rgb(75 85 99);
	}

	:global(.dark) .project-status {
		background: rgb(55 65 81);
		color: rgb(209 213 219);
	}

	.status-dot {
		width: 0.375rem;
		height: 0.375rem;
		border-radius: 50%;
		background: currentColor;
		animation: pulse 2s ease-in-out infinite;
	}

	.project-status[data-status='active'] {
		color: rgb(34 197 94);
		background: rgba(34, 197, 94, 0.1);
	}

	:global(.dark) .project-status[data-status='active'] {
		color: rgb(134 239 172);
		background: rgba(34, 197, 94, 0.2);
	}

	.project-status[data-status='planned'] {
		color: rgb(251 191 36);
		background: rgba(251, 191, 36, 0.1);
	}

	:global(.dark) .project-status[data-status='planned'] {
		color: rgb(254 215 170);
		background: rgba(251, 191, 36, 0.2);
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	/* Project Name Section */
	.project-name-section {
		padding: 0.75rem 0;
	}

	.project-name {
		font-size: 1.125rem;
		font-weight: 600;
		color: rgb(17 24 39);
		margin: 0;
		line-height: 1.4;
	}

	:global(.dark) .project-name {
		color: rgb(243 244 246);
	}

	/* Section Headers */
	.section-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: rgb(107 114 128);
	}

	:global(.dark) .section-header {
		color: rgb(156 163 175);
	}

	/* Summary Section */
	.summary-section {
		padding: 0.75rem;
		background: linear-gradient(135deg, rgb(254 252 232), rgb(254 249 195));
		border: 1px solid rgb(254 240 138);
		border-radius: 0.75rem;
	}

	:global(.dark) .summary-section {
		background: linear-gradient(135deg, rgba(254, 240, 138, 0.05), rgba(251, 191, 36, 0.05));
		border-color: rgba(251, 191, 36, 0.2);
	}

	.summary-text {
		font-size: 0.875rem;
		color: rgb(92 79 9);
		line-height: 1.6;
		margin: 0;
	}

	:global(.dark) .summary-text {
		color: rgb(254 240 138);
	}

	/* Tags Section */
	.tags-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.tags-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.tag-pill {
		display: inline-flex;
		align-items: center;
		padding: 0.25rem 0.625rem;
		background: linear-gradient(135deg, rgb(239 246 255), rgb(219 234 254));
		border: 1px solid rgb(191 219 254);
		border-radius: 9999px;
		font-size: 0.75rem;
		font-weight: 500;
		color: rgb(59 130 246);
		transition: all 0.2s ease;
	}

	:global(.dark) .tag-pill {
		background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(99, 102, 241, 0.1));
		border-color: rgba(59, 130, 246, 0.3);
		color: rgb(147 197 253);
	}

	.tag-pill:hover {
		transform: translateY(-1px);
		box-shadow: 0 2px 4px rgba(59, 130, 246, 0.2);
	}

	/* Context Section */
	.context-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.context-preview-box {
		position: relative;
		background: rgb(249 250 251);
		border: 1px solid rgb(229 231 235);
		border-radius: 0.75rem;
		overflow: hidden;
	}

	:global(.dark) .context-preview-box {
		background: rgb(31 41 55);
		border-color: rgb(55 65 81);
	}

	.context-content {
		padding: 1rem;
		font-size: 0.8125rem;
		line-height: 1.6;
		color: rgb(75 85 99);
		font-family:
			ui-monospace, SFMono-Regular, 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
		white-space: pre-wrap;
		word-break: break-word;
		max-height: 12rem;
		overflow-y: auto;
	}

	:global(.dark) .context-content {
		color: rgb(156 163 175);
	}

	/* Custom scrollbar for context */
	.context-content::-webkit-scrollbar {
		width: 6px;
	}

	.context-content::-webkit-scrollbar-track {
		background: transparent;
	}

	.context-content::-webkit-scrollbar-thumb {
		background: rgb(209 213 219);
		border-radius: 3px;
	}

	:global(.dark) .context-content::-webkit-scrollbar-thumb {
		background: rgb(75 85 99);
	}

	.context-fade {
		position: absolute;
		bottom: 2.5rem;
		left: 0;
		right: 0;
		height: 3rem;
		background: linear-gradient(to bottom, transparent, rgb(249 250 251));
		pointer-events: none;
	}

	:global(.dark) .context-fade {
		background: linear-gradient(to bottom, transparent, rgb(31 41 55));
	}

	.context-note {
		margin: 0;
		padding: 0.5rem 1rem;
		background: white;
		border-top: 1px solid rgb(229 231 235);
		font-size: 0.6875rem;
		color: rgb(107 114 128);
		text-align: center;
	}

	:global(.dark) .context-note {
		background: rgb(17 24 39);
		border-top-color: rgb(55 65 81);
		color: rgb(156 163 175);
	}

	/* No update needed styles */
	.no-update-needed {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 2rem;
		min-height: 12rem;
		gap: 0.75rem;
	}

	.no-update-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 3rem;
		height: 3rem;
		border-radius: 50%;
		background: rgb(243 244 246);
		margin-bottom: 0.5rem;
	}

	:global(.dark) .no-update-icon {
		background: rgb(55 65 81);
	}

	.no-update-title {
		font-size: 1rem;
		font-weight: 600;
		color: rgb(75 85 99);
		margin: 0;
	}

	:global(.dark) .no-update-title {
		color: rgb(156 163 175);
	}

	.no-update-message {
		font-size: 0.875rem;
		color: rgb(107 114 128);
		line-height: 1.5;
		max-width: 20rem;
		margin: 0;
	}

	:global(.dark) .no-update-message {
		color: rgb(156 163 175);
	}
</style>
