<!-- src/lib/components/ui/skeletons/ProjectHeaderSkeleton.svelte -->
<div class="project-header-skeleton">
	<div class="header-top">
		<div class="header-main">
			<div class="skeleton-title"></div>
			<div class="skeleton-description">
				<div class="skeleton-line"></div>
				<div class="skeleton-line short"></div>
			</div>
		</div>
		<div class="header-actions">
			<div class="skeleton-button"></div>
			<div class="skeleton-button"></div>
		</div>
	</div>

	<div class="header-stats">
		{#each Array(4) as _}
			<div class="skeleton-stat">
				<div class="skeleton-stat-value"></div>
				<div class="skeleton-stat-label"></div>
			</div>
		{/each}
	</div>
</div>

<style>
	.project-header-skeleton {
		background: var(--color-surface);
		border-radius: var(--radius-lg);
		padding: 1.5rem;
		margin-bottom: 1.5rem;
		animation: skeleton-pulse 1.5s ease-in-out infinite;
	}

	.header-top {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 1.5rem;
		gap: 1rem;
	}

	.header-main {
		flex: 1;
	}

	.skeleton-title {
		height: 32px;
		width: 60%;
		background: var(--skeleton-bg);
		border-radius: var(--radius-sm);
		margin-bottom: 0.75rem;
	}

	.skeleton-description {
		space-y: 2;
	}

	.skeleton-line {
		height: 16px;
		background: var(--skeleton-bg);
		border-radius: var(--radius-sm);
		margin-bottom: 0.5rem;
	}

	.skeleton-line.short {
		width: 80%;
	}

	.header-actions {
		display: flex;
		gap: 0.5rem;
	}

	.skeleton-button {
		width: 100px;
		height: 36px;
		background: var(--skeleton-bg);
		border-radius: var(--radius-md);
	}

	.header-stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: 1rem;
	}

	.skeleton-stat {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.skeleton-stat-value {
		height: 24px;
		width: 40px;
		background: var(--skeleton-bg);
		border-radius: var(--radius-sm);
	}

	.skeleton-stat-label {
		height: 14px;
		width: 60px;
		background: var(--skeleton-bg);
		border-radius: var(--radius-sm);
	}

	@media (max-width: 768px) {
		.header-top {
			flex-direction: column;
		}

		.header-actions {
			width: 100%;
		}

		.skeleton-button {
			flex: 1;
		}

		.header-stats {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@keyframes skeleton-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	:global(.dark) .project-header-skeleton {
		--skeleton-bg: rgba(255, 255, 255, 0.1);
	}

	:global(.light) .project-header-skeleton {
		--skeleton-bg: rgba(0, 0, 0, 0.1);
	}
</style>
