<!-- apps/web/src/lib/components/ui/skeletons/ProjectCardSkeleton.svelte -->
<!-- Inkprint Design System -->
<div class="project-card-skeleton tx tx-grain tx-weak">
	<!-- Header - matches ProjectCard line 101-128 -->
	<div class="skeleton-header">
		<div class="skeleton-title-row">
			<div class="skeleton-title"></div>
			<div class="skeleton-edit-btn"></div>
		</div>
		<div class="skeleton-status-badge"></div>
	</div>

	<!-- Description - matches min-h-[2.5rem] from ProjectCard -->
	<div class="skeleton-description">
		<div class="skeleton-line"></div>
		<div class="skeleton-line short"></div>
	</div>

	<!-- Task stats section - matches ProjectCard lines 143-189 -->
	<div class="skeleton-task-stats">
		<div class="skeleton-progress-section">
			<div class="skeleton-progress-header">
				<div class="skeleton-progress-label"></div>
				<div class="skeleton-progress-percent"></div>
			</div>
			<div class="skeleton-progress-bar"></div>
		</div>
		<div class="skeleton-stats-row">
			<div class="skeleton-stat-item"></div>
			<div class="skeleton-stat-item"></div>
			<div class="skeleton-stat-item"></div>
		</div>
	</div>

	<!-- Brief button placeholder -->
	<div class="skeleton-brief-btn"></div>

	<!-- Tags - matches ProjectCard tags section -->
	<div class="skeleton-tags">
		<div class="skeleton-tag"></div>
		<div class="skeleton-tag"></div>
		<div class="skeleton-tag short"></div>
	</div>
</div>

<style>
	.project-card-skeleton {
		/* Match ProjectCard container - Inkprint design */
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: 0.5rem; /* rounded-lg */
		padding: 1rem; /* p-4 */
		overflow: hidden;
		animation: skeleton-pulse 1.5s ease-in-out infinite;
		box-shadow: var(--shadow-ink);
	}

	/* Header section - matches ProjectCard lines 101-128 */
	.skeleton-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		margin-bottom: 0.5rem; /* mb-2 */
	}

	.skeleton-title-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex: 1;
		min-width: 0;
		padding-right: 0.5rem;
	}

	.skeleton-title {
		height: 20px; /* text-base */
		width: 65%;
		background: var(--skeleton-bg);
		border-radius: 0.25rem;
	}

	.skeleton-edit-btn {
		height: 14px;
		width: 14px;
		background: var(--skeleton-bg);
		border-radius: 0.25rem;
		opacity: 0; /* matches group-hover:opacity-100 */
	}

	.skeleton-status-badge {
		height: 16px; /* text-xs */
		width: 50px;
		background: var(--skeleton-bg);
		border-radius: 0.25rem;
		flex-shrink: 0;
	}

	/* Description - matches min-h-[2.5rem] */
	.skeleton-description {
		margin-bottom: 0.75rem; /* mb-3 */
		min-height: 2.5rem; /* min-h-[2.5rem] */
	}

	.skeleton-line {
		height: 14px; /* text-sm */
		background: var(--skeleton-bg);
		border-radius: 0.25rem;
		margin-bottom: 0.25rem;
	}

	.skeleton-line.short {
		width: 70%;
	}

	/* Task stats section - matches ProjectCard lines 143-189 */
	.skeleton-task-stats {
		margin-bottom: 0.5rem;
	}

	.skeleton-progress-section {
		margin-bottom: 0.5rem;
	}

	.skeleton-progress-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.25rem;
	}

	.skeleton-progress-label {
		height: 12px; /* text-xs */
		width: 50px;
		background: var(--skeleton-bg);
		border-radius: 0.25rem;
	}

	.skeleton-progress-percent {
		height: 12px;
		width: 30px;
		background: var(--skeleton-bg);
		border-radius: 0.25rem;
	}

	.skeleton-progress-bar {
		height: 6px; /* h-1.5 */
		width: 100%;
		background: var(--skeleton-bg);
		border-radius: 9999px; /* rounded-full */
	}

	.skeleton-stats-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.skeleton-stat-item {
		height: 12px; /* text-xs */
		width: 30px;
		background: var(--skeleton-bg);
		border-radius: 0.25rem;
	}

	/* Brief button */
	.skeleton-brief-btn {
		height: 32px; /* size="sm" button */
		width: 100%;
		background: var(--skeleton-bg);
		border-radius: 0.375rem;
		margin: 0.75rem 0 0.5rem 0; /* mt-3 mb-2 */
	}

	/* Tags section */
	.skeleton-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem; /* gap-1.5 */
	}

	.skeleton-tag {
		height: 20px; /* py-0.5 + text-xs */
		width: 60px;
		background: var(--skeleton-bg);
		border-radius: 0.375rem; /* rounded-md */
	}

	.skeleton-tag.short {
		width: 40px;
	}

	/* Skeleton background variables */
	.project-card-skeleton {
		--skeleton-bg: rgba(0, 0, 0, 0.1);
	}

	:global(.dark) .project-card-skeleton {
		--skeleton-bg: rgba(255, 255, 255, 0.1);
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
</style>
