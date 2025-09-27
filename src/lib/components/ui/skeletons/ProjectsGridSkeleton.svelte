<!-- src/lib/components/ui/skeletons/ProjectsGridSkeleton.svelte -->
<script lang="ts">
	import ProjectCardSkeleton from './ProjectCardSkeleton.svelte';

	export let count = 6;
</script>

<div class="projects-grid-skeleton">
	{#each Array(count) as _, i}
		<ProjectCardSkeleton />
	{/each}
</div>

<style>
	.projects-grid-skeleton {
		/* Match exact Tailwind grid classes from ProjectsGrid */
		display: grid;
		grid-template-columns: repeat(1, minmax(0, 1fr));
		gap: 1.5rem;
		animation: fade-in 0.3s ease-out;
	}

	/* md:grid-cols-2 (768px+) */
	@media (min-width: 768px) {
		.projects-grid-skeleton {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	/* lg:grid-cols-3 (1024px+) */
	@media (min-width: 1024px) {
		.projects-grid-skeleton {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
</style>
