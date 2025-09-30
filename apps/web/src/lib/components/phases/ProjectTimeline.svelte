<!-- apps/web/src/lib/components/phases/ProjectTimeline.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { formatDateForDisplay } from '$lib/utils/date-utils';
	import type { ProcessedPhase } from '$lib/types/project-page.types';

	export let phases: ProcessedPhase[] = [];

	const dispatch = createEventDispatcher();

	// Track collapsed state for phases
	let collapsedPhases: Set<string> = new Set();

	// Enhanced phase tracking structure for overlapping support
	interface PhaseTrack {
		phase: ProcessedPhase;
		track: number;
		startPos: number;
		endPos: number;
	}

	// Calculate phase tracks to handle overlapping phases
	function calculatePhaseTracks(phases: ProcessedPhase[]): PhaseTrack[] {
		if (phases.length === 0) return [];

		// Sort phases by start date first, then by duration
		const sortedPhases = [...phases].sort((a, b) => {
			const startDiff = new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
			if (startDiff !== 0) return startDiff;

			const aDuration = new Date(a.end_date).getTime() - new Date(a.start_date).getTime();
			const bDuration = new Date(b.end_date).getTime() - new Date(b.start_date).getTime();
			return aDuration - bDuration;
		});

		// Calculate project boundaries
		const projectStart = new Date(
			Math.min(...phases.map((p) => new Date(p.start_date).getTime()))
		);
		const projectEnd = new Date(Math.max(...phases.map((p) => new Date(p.end_date).getTime())));
		const totalDuration = projectEnd.getTime() - projectStart.getTime();

		const phaseTracks: PhaseTrack[] = [];
		const tracks: Array<{ endTime: number }> = [];

		for (const phase of sortedPhases) {
			const startTime = new Date(phase.start_date).getTime();
			const endTime = new Date(phase.end_date).getTime();

			// Calculate positions
			const startPos = Math.max(
				0,
				((startTime - projectStart.getTime()) / totalDuration) * 100
			);
			const endPos = Math.min(
				100,
				((endTime - projectStart.getTime()) / totalDuration) * 100
			);

			// Find the first available track
			let trackIndex = 0;
			while (trackIndex < tracks.length && tracks[trackIndex].endTime > startTime) {
				trackIndex++;
			}

			// Ensure we have enough tracks
			while (tracks.length <= trackIndex) {
				tracks.push({ endTime: 0 });
			}

			// Assign this phase to the track
			tracks[trackIndex].endTime = endTime;

			phaseTracks.push({
				phase,
				track: trackIndex,
				startPos,
				endPos
			});
		}

		return phaseTracks;
	}

	function getTimelinePosition(date: string): number {
		if (phases.length === 0) return 0;

		const projectStart = new Date(
			Math.min(...phases.map((p) => new Date(p.start_date).getTime()))
		);
		const projectEnd = new Date(Math.max(...phases.map((p) => new Date(p.end_date).getTime())));
		const targetDate = new Date(date);

		const totalDuration = projectEnd.getTime() - projectStart.getTime();
		const elapsed = targetDate.getTime() - projectStart.getTime();

		return Math.max(0, Math.min(100, (elapsed / totalDuration) * 100));
	}

	function getPhaseProgress(phase: ProcessedPhase): number {
		if (phase.task_count === 0) return 0;
		return Math.round((phase.completed_tasks / phase.task_count) * 100);
	}

	function getPhaseStatus(phase: ProcessedPhase): 'upcoming' | 'active' | 'completed' {
		const now = new Date();
		const startDate = new Date(phase.start_date);
		const endDate = new Date(phase.end_date);

		if (now < startDate) return 'upcoming';
		if (now > endDate) return 'completed';
		return 'active';
	}

	function getTrackColor(trackIndex: number): string {
		const colors = [
			'bg-blue-500',
			'bg-green-500',
			'bg-purple-500',
			'bg-yellow-500',
			'bg-red-500',
			'bg-indigo-500',
			'bg-pink-500',
			'bg-gray-500'
		];
		return colors[trackIndex % colors.length];
	}

	function getTrackHoverColor(trackIndex: number): string {
		const colors = [
			'hover:bg-blue-600',
			'hover:bg-green-600',
			'hover:bg-purple-600',
			'hover:bg-yellow-600',
			'hover:bg-red-600',
			'hover:bg-indigo-600',
			'hover:bg-pink-600',
			'hover:bg-gray-600'
		];
		return colors[trackIndex % colors.length];
	}

	function scrollToPhase(phaseId: string) {
		dispatch('scrollToPhase', phaseId);
	}

	// Reactive calculations
	$: phaseTracks = calculatePhaseTracks(phases);
	$: maxTracks = Math.max(1, ...phaseTracks.map((pt) => pt.track + 1));
	$: currentPos = getTimelinePosition(new Date().toISOString());
	$: hasPhases = phases.length > 0;
</script>

{#if hasPhases}
	<div
		class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
	>
		<!-- Timeline Header -->
		<header
			class="mb-4 text-xs sm:text-sm text-gray-600 dark:text-gray-400"
			aria-label="Project timeline"
		>
			<!-- Mobile: Stack vertically -->
			<div class="block sm:hidden text-center space-y-1">
				<div class="font-medium text-base">Project Timeline</div>
				<div class="text-xs">
					<time datetime={phases[0].start_date}>
						{formatDateForDisplay(phases[0].start_date)}
					</time>
					<span class="mx-2">—</span>
					<time datetime={phases[phases.length - 1].end_date}>
						{formatDateForDisplay(phases[phases.length - 1].end_date)}
					</time>
				</div>
				{#if maxTracks > 1}
					<div class="text-xs text-gray-500 dark:text-gray-400">
						{phases.length} phases ({maxTracks} overlapping tracks)
					</div>
				{/if}
			</div>

			<!-- Desktop: Horizontal layout -->
			<div class="hidden sm:flex items-center justify-between px-2">
				<time datetime={phases[0].start_date} class="truncate max-w-[120px] sm:max-w-none">
					{formatDateForDisplay(phases[0].start_date)}
				</time>
				<div class="text-center">
					<span class="font-medium">Project Timeline</span>
					{#if maxTracks > 1}
						<div class="text-xs text-gray-500 dark:text-gray-400">
							{phases.length} phases ({maxTracks} tracks)
						</div>
					{/if}
				</div>
				<time
					datetime={phases[phases.length - 1].end_date}
					class="truncate max-w-[120px] sm:max-w-none text-right"
				>
					{formatDateForDisplay(phases[phases.length - 1].end_date)}
				</time>
			</div>
		</header>

		<!-- Enhanced Timeline Track -->
		<div class="mb-2">
			<!-- Mobile: Enhanced vertical timeline indicators -->
			<div class="block sm:hidden">
				<div class="flex flex-col space-y-2 px-4">
					{#each phaseTracks as { phase, track }, index}
						{@const progress = getPhaseProgress(phase)}
						{@const status = getPhaseStatus(phase)}

						<div class="relative">
							<button
								class="flex items-center space-x-3 w-full text-left p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
								style="margin-left: {track * 16}px"
								on:click={() => scrollToPhase(phase.id)}
								aria-label="Click to scroll to phase {phase.name}"
								title="Click to scroll to {phase.name}"
							>
								<!-- Phase indicator dot -->
								<div
									class="flex-shrink-0 w-3 h-3 rounded-full border-2 border-gray-300 dark:border-gray-600
									{status === 'completed'
										? 'bg-green-500 border-green-500'
										: status === 'active'
											? 'bg-blue-500 border-blue-500'
											: getTrackColor(track)
													.replace('bg-', 'bg-')
													.replace('-500', '-400') +
												' border-' +
												getTrackColor(track)
													.replace('bg-', '')
													.replace('-500', '-400')}"
								></div>

								<!-- Phase mini info -->
								<div class="flex-1 min-w-0">
									<div class="flex items-center justify-between">
										<span
											class="text-sm font-medium text-gray-900 dark:text-white truncate"
										>
											{phase.name}
											{#if track > 0}
												<span class="text-xs text-gray-500 ml-1"
													>(Track {track + 1})</span
												>
											{/if}
										</span>
										<span
											class="text-xs font-medium px-2 py-0.5 rounded {status ===
											'upcoming'
												? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
												: status === 'active'
													? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
													: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'}"
										>
											{progress}%
										</span>
									</div>
								</div>
							</button>

							<!-- Connecting line -->
							{#if index < phaseTracks.length - 1}
								<div
									class="absolute left-[22px] top-full w-0.5 h-2 bg-gray-300 dark:bg-gray-600 pointer-events-none"
									style="margin-left: {track * 16}px"
								></div>
							{/if}
						</div>
					{/each}
				</div>
			</div>

			<!-- Desktop: Multi-track horizontal timeline -->
			<div class="hidden sm:block">
				<div
					class="relative mx-2 space-y-1"
					style="height: {maxTracks * 12 + (maxTracks - 1) * 4}px"
				>
					{#each Array(maxTracks) as _, trackIndex}
						<!-- Background track -->
						<div
							class="absolute w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full"
							style="top: {trackIndex * 16}px"
						></div>
					{/each}

					<!-- Phase segments -->
					{#each phaseTracks as { phase, track, startPos, endPos }}
						{@const status = getPhaseStatus(phase)}
						{@const baseColor = getTrackColor(track)}

						<button
							class="absolute h-2 rounded-full transition-all duration-300 cursor-pointer border-0 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
							{status === 'completed'
								? 'bg-green-500 hover:bg-green-600 focus:ring-green-500'
								: status === 'active'
									? 'bg-blue-500 hover:bg-blue-600 focus:ring-blue-500'
									: baseColor +
										' ' +
										getTrackHoverColor(track) +
										' focus:ring-blue-500'}"
							style="left: {startPos}%; width: {endPos - startPos}%; top: {track *
								16}px"
							role="button"
							aria-label="Click to scroll to phase {phase.name}: {status} (Track {track +
								1})"
							title="Click to scroll to {phase.name} - {status
								.charAt(0)
								.toUpperCase() + status.slice(1)} ({getPhaseProgress(phase)}%)"
							on:click={() => scrollToPhase(phase.id)}
						>
							<!-- Phase label on hover -->
							<div
								class="absolute -top-8 left-1/2 transform -translate-x-1/2
								bg-gray-900 text-white text-xs px-2 py-1 rounded
								opacity-0 hover:opacity-100 transition-opacity duration-200
								whitespace-nowrap z-1 pointer-events-none"
							>
								{phase.name} ({getPhaseProgress(phase)}%) - Click to scroll
							</div>
						</button>
					{/each}

					<!-- Current Date Marker -->
					{#if currentPos >= 0 && currentPos <= 100}
						<div
							class="absolute w-0.5 bg-red-500 z-0"
							style="left: {currentPos}%; height: {maxTracks * 16}px; top: -2px"
							role="img"
							aria-label="Current date marker"
						>
							<div
								class="absolute -top-6 left-1/2 -translate-x-1/2 text-xs text-red-600 dark:text-red-400 whitespace-nowrap font-medium"
								aria-hidden="true"
							>
								Today
							</div>
							<div
								class="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-gray-900"
							></div>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}
