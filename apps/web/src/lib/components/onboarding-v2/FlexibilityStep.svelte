<!-- apps/web/src/lib/components/onboarding-v2/FlexibilityStep.svelte -->
<script lang="ts">
	import {
		Sparkles,
		Calendar,
		RefreshCw,
		Layout,
		MessageSquare,
		CheckCircle
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { ONBOARDING_V2_CONFIG } from '$lib/config/onboarding.config';

	interface Props {
		onNext: () => void;
	}

	let { onNext }: Props = $props();

	// State for active section
	let activeSection = $state<'braindump' | 'phases' | 'calendar'>('braindump');
</script>

<div class="max-w-4xl mx-auto px-4">
	<!-- Header -->
	<div class="mb-8 text-center">
		<div class="flex justify-center mb-6">
			<div
				class="w-16 h-16 bg-gradient-to-br from-orange-100 to-amber-100 dark:from-orange-900/30 dark:to-amber-900/30 rounded-2xl flex items-center justify-center shadow-lg"
			>
				<RefreshCw class="w-8 h-8 text-orange-600 dark:text-orange-400" />
			</div>
		</div>

		<h2 class="text-3xl sm:text-4xl font-bold mb-3 text-gray-900 dark:text-white">
			Step 3: Flexibility - BuildOS Adapts to You
		</h2>
		<p class="text-lg text-gray-600 dark:text-gray-400 leading-relaxed max-w-2xl mx-auto">
			Life changes. Priorities shift. BuildOS keeps up. Here's how.
		</p>
	</div>

	<!-- Section Tabs -->
	<div class="flex gap-2 mb-8 flex-wrap justify-center">
		<button
			onclick={() => (activeSection = 'braindump')}
			class="px-5 py-3 rounded-lg font-medium transition-all duration-200 {activeSection ===
			'braindump'
				? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-lg'
				: 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-700'}"
		>
			<MessageSquare class="w-4 h-4 inline mr-2" />
			Braindump Flexibility
		</button>
		<button
			onclick={() => (activeSection = 'phases')}
			class="px-5 py-3 rounded-lg font-medium transition-all duration-200 {activeSection ===
			'phases'
				? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg'
				: 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700'}"
		>
			<Layout class="w-4 h-4 inline mr-2" />
			Flexible Phases
		</button>
		<button
			onclick={() => (activeSection = 'calendar')}
			class="px-5 py-3 rounded-lg font-medium transition-all duration-200 {activeSection ===
			'calendar'
				? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg'
				: 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-green-300 dark:hover:border-green-700'}"
		>
			<Calendar class="w-4 h-4 inline mr-2" />
			Calendar Flexibility
		</button>
	</div>

	<!-- Dynamic Content Based on Active Section -->
	<div class="min-h-[500px]">
		{#if activeSection === 'braindump'}
			<!-- Braindump Flexibility Section -->
			<div class="space-y-6">
				<div class="text-center mb-6">
					<h3 class="text-2xl font-bold mb-2 text-gray-900 dark:text-white">
						Braindumps Adapt to Your Needs
					</h3>
					<p class="text-gray-600 dark:text-gray-400">
						Braindumps aren't just for creating—use them to update, reschedule, or
						modify existing work.
					</p>
				</div>

				<!-- Update Tasks -->
				<div
					class="bg-white dark:bg-gray-800 rounded-xl border-2 border-purple-200 dark:border-purple-800 p-6 shadow-sm"
				>
					<div class="flex items-start gap-4 mb-4">
						<div
							class="flex-shrink-0 w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center"
						>
							<CheckCircle class="w-6 h-6 text-purple-600 dark:text-purple-400" />
						</div>
						<div class="flex-1">
							<h4 class="font-semibold text-lg mb-2 text-gray-900 dark:text-white">
								Update Tasks via Braindump
							</h4>
							<p class="text-sm text-gray-700 dark:text-gray-300 mb-3">
								Mark tasks complete, add context, or update details—all through
								natural language.
							</p>
							<div
								class="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
							>
								<p class="text-sm italic text-gray-700 dark:text-gray-300">
									"The API integration is complete, but we need to add error
									handling. Also, let's update the design task to high priority."
								</p>
							</div>
						</div>
					</div>

					{#if ONBOARDING_V2_CONFIG.features.showPlaceholderAssets}
						<div
							class="mt-4 bg-gray-100 dark:bg-gray-800 rounded-lg p-8 text-center border-2 border-dashed border-gray-300 dark:border-gray-600"
						>
							<MessageSquare class="w-12 h-12 text-gray-400 mx-auto mb-4" />
							<p class="text-gray-500 text-sm">
								[Screenshot: Braindump modal updating existing task]
							</p>
						</div>
					{:else}
						<img
							src={ONBOARDING_V2_CONFIG.assets.screenshots.braindumpUpdateTask}
							alt="Braindump updating task"
							class="rounded-lg shadow-lg"
						/>
					{/if}
				</div>

				<!-- Reschedule Tasks -->
				<div
					class="bg-white dark:bg-gray-800 rounded-xl border-2 border-purple-200 dark:border-purple-800 p-6 shadow-sm"
				>
					<div class="flex items-start gap-4 mb-4">
						<div
							class="flex-shrink-0 w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center"
						>
							<Calendar class="w-6 h-6 text-purple-600 dark:text-purple-400" />
						</div>
						<div class="flex-1">
							<h4 class="font-semibold text-lg mb-2 text-gray-900 dark:text-white">
								Reschedule Tasks via Braindump
							</h4>
							<p class="text-sm text-gray-700 dark:text-gray-300 mb-3">
								Need to reschedule? Just mention it, and BuildOS automatically
								adjusts your calendar.
							</p>
							<div
								class="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
							>
								<p class="text-sm italic text-gray-700 dark:text-gray-300">
									"This week got busy—let's push all Q1 planning tasks to next
									week and move the design review to next Friday afternoon."
								</p>
							</div>
						</div>
					</div>

					{#if ONBOARDING_V2_CONFIG.features.showPlaceholderAssets}
						<div
							class="mt-4 bg-gray-100 dark:bg-gray-800 rounded-lg p-8 text-center border-2 border-dashed border-gray-300 dark:border-gray-600"
						>
							<Calendar class="w-12 h-12 text-gray-400 mx-auto mb-4" />
							<p class="text-gray-500 text-sm">
								[Screenshot: Braindump processing task rescheduling]
							</p>
						</div>
					{:else}
						<img
							src={ONBOARDING_V2_CONFIG.assets.screenshots.braindumpReschedule}
							alt="Braindump rescheduling tasks"
							class="rounded-lg shadow-lg"
						/>
					{/if}
				</div>
			</div>
		{:else if activeSection === 'phases'}
			<!-- Phase Flexibility Section -->
			<div class="space-y-6">
				<div class="text-center mb-6">
					<h3 class="text-2xl font-bold mb-2 text-gray-900 dark:text-white">
						Phases That Evolve With You
					</h3>
					<p class="text-gray-600 dark:text-gray-400">
						Organize tasks into phases, regenerate anytime, and schedule with AI.
					</p>
				</div>

				<!-- Create Phases -->
				<div
					class="bg-white dark:bg-gray-800 rounded-xl border-2 border-blue-200 dark:border-blue-800 p-6 shadow-sm"
				>
					<div class="flex items-start gap-4 mb-4">
						<div
							class="flex-shrink-0 w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center"
						>
							<Layout class="w-6 h-6 text-blue-600 dark:text-blue-400" />
						</div>
						<div class="flex-1">
							<h4 class="font-semibold text-lg mb-2 text-gray-900 dark:text-white">
								Create Phases
							</h4>
							<p class="text-sm text-gray-700 dark:text-gray-300 mb-3">
								Organize tasks into logical phases—BuildOS can generate them
								automatically based on your project timeline.
							</p>
							<div class="space-y-2 text-sm text-gray-700 dark:text-gray-300">
								<div class="flex items-center gap-2">
									<div class="w-2 h-2 rounded-full bg-blue-500"></div>
									<span
										><strong>Phases only</strong> - Just organize, no scheduling</span
									>
								</div>
								<div class="flex items-center gap-2">
									<div class="w-2 h-2 rounded-full bg-blue-500"></div>
									<span
										><strong>Schedule in phases</strong> - Auto-schedule all phase
										tasks</span
									>
								</div>
								<div class="flex items-center gap-2">
									<div class="w-2 h-2 rounded-full bg-blue-500"></div>
									<span
										><strong>Calendar-optimized</strong> - Smart scheduling around
										your calendar</span
									>
								</div>
							</div>
						</div>
					</div>

					{#if ONBOARDING_V2_CONFIG.features.showPlaceholderAssets}
						<div
							class="mt-4 bg-gray-100 dark:bg-gray-800 rounded-lg p-8 text-center border-2 border-dashed border-gray-300 dark:border-gray-600"
						>
							<Layout class="w-12 h-12 text-gray-400 mx-auto mb-4" />
							<p class="text-gray-500 text-sm">
								[Screenshot: Phase generation modal with 3 strategy options]
							</p>
						</div>
					{:else}
						<img
							src={ONBOARDING_V2_CONFIG.assets.screenshots.phaseGenerationModal}
							alt="Phase generation modal"
							class="rounded-lg shadow-lg"
						/>
					{/if}
				</div>

				<!-- Regenerate Phases -->
				<div
					class="bg-white dark:bg-gray-800 rounded-xl border-2 border-blue-200 dark:border-blue-800 p-6 shadow-sm"
				>
					<div class="flex items-start gap-4 mb-4">
						<div
							class="flex-shrink-0 w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center"
						>
							<RefreshCw class="w-6 h-6 text-blue-600 dark:text-blue-400" />
						</div>
						<div class="flex-1">
							<h4 class="font-semibold text-lg mb-2 text-gray-900 dark:text-white">
								Regenerate Phases
							</h4>
							<p class="text-sm text-gray-700 dark:text-gray-300 mb-3">
								Projects evolve. Regenerate phases anytime—BuildOS preserves your
								completed work and reorganizes the rest.
							</p>
						</div>
					</div>

					{#if ONBOARDING_V2_CONFIG.features.showPlaceholderAssets}
						<div
							class="mt-4 bg-gray-100 dark:bg-gray-800 rounded-lg p-8 text-center border-2 border-dashed border-gray-300 dark:border-gray-600"
						>
							<RefreshCw class="w-12 h-12 text-gray-400 mx-auto mb-4" />
							<p class="text-gray-500 text-sm">
								[Screenshot: Before/after view showing phase regeneration]
							</p>
						</div>
					{:else}
						<img
							src={ONBOARDING_V2_CONFIG.assets.screenshots
								.phaseRegenerationBeforeAfter}
							alt="Phase regeneration before and after"
							class="rounded-lg shadow-lg"
						/>
					{/if}
				</div>

				<!-- Schedule Phase Tasks -->
				<div
					class="bg-white dark:bg-gray-800 rounded-xl border-2 border-blue-200 dark:border-blue-800 p-6 shadow-sm"
				>
					<div class="flex items-start gap-4 mb-4">
						<div
							class="flex-shrink-0 w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center"
						>
							<Sparkles class="w-6 h-6 text-blue-600 dark:text-blue-400" />
						</div>
						<div class="flex-1">
							<h4 class="font-semibold text-lg mb-2 text-gray-900 dark:text-white">
								Schedule All Tasks in a Phase
							</h4>
							<p class="text-sm text-gray-700 dark:text-gray-300 mb-3">
								Let AI find the perfect time for every task in a phase, considering
								your calendar and work hours.
							</p>
						</div>
					</div>

					{#if ONBOARDING_V2_CONFIG.features.showPlaceholderAssets}
						<div
							class="mt-4 bg-gray-100 dark:bg-gray-800 rounded-lg p-8 text-center border-2 border-dashed border-gray-300 dark:border-gray-600"
						>
							<Sparkles class="w-12 h-12 text-gray-400 mx-auto mb-4" />
							<p class="text-gray-500 text-sm">
								[Screenshot: Calendar view with scheduled phase tasks]
							</p>
						</div>
					{:else}
						<img
							src={ONBOARDING_V2_CONFIG.assets.screenshots.phaseScheduling}
							alt="Phase scheduling with AI"
							class="rounded-lg shadow-lg"
						/>
					{/if}
				</div>
			</div>
		{:else if activeSection === 'calendar'}
			<!-- Calendar Flexibility Section -->
			<div class="space-y-6">
				<div class="text-center mb-6">
					<h3 class="text-2xl font-bold mb-2 text-gray-900 dark:text-white">
						Your Calendar, Your Way
					</h3>
					<p class="text-gray-600 dark:text-gray-400">
						Schedule, unschedule, and block time—all seamlessly integrated.
					</p>
				</div>

				<!-- Schedule/Unschedule Tasks -->
				<div
					class="bg-white dark:bg-gray-800 rounded-xl border-2 border-green-200 dark:border-green-800 p-6 shadow-sm"
				>
					<div class="flex items-start gap-4 mb-4">
						<div
							class="flex-shrink-0 w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center"
						>
							<Calendar class="w-6 h-6 text-green-600 dark:text-green-400" />
						</div>
						<div class="flex-1">
							<h4 class="font-semibold text-lg mb-2 text-gray-900 dark:text-white">
								Schedule & Unschedule Tasks
							</h4>
							<p class="text-sm text-gray-700 dark:text-gray-300 mb-3">
								Schedule tasks to your calendar with one click—or unschedule them
								just as easily.
							</p>
						</div>
					</div>

					{#if ONBOARDING_V2_CONFIG.features.showPlaceholderAssets}
						<div
							class="mt-4 bg-gray-100 dark:bg-gray-800 rounded-lg p-8 text-center border-2 border-dashed border-gray-300 dark:border-gray-600"
						>
							<Calendar class="w-12 h-12 text-gray-400 mx-auto mb-4" />
							<p class="text-gray-500 text-sm">
								[Screenshot: Task detail showing schedule/unschedule buttons]
							</p>
						</div>
					{:else}
						<img
							src={ONBOARDING_V2_CONFIG.assets.screenshots.taskScheduleUnschedule}
							alt="Task schedule and unschedule"
							class="rounded-lg shadow-lg"
						/>
					{/if}
				</div>

				<!-- Timeblocks -->
				<div
					class="bg-white dark:bg-gray-800 rounded-xl border-2 border-green-200 dark:border-green-800 p-6 shadow-sm"
				>
					<div class="flex items-start gap-4 mb-4">
						<div
							class="flex-shrink-0 w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center"
						>
							<Sparkles class="w-6 h-6 text-green-600 dark:text-green-400" />
						</div>
						<div class="flex-1">
							<h4 class="font-semibold text-lg mb-2 text-gray-900 dark:text-white">
								Timeblocks
							</h4>
							<p class="text-sm text-gray-700 dark:text-gray-300 mb-3">
								Block off time on your calendar to work on specific projects—BuildOS
								even suggests what to work on during each block.
							</p>
							<div
								class="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700 mt-3"
							>
								<div class="flex items-center gap-2 mb-2">
									<div class="text-2xl">🕐</div>
									<div class="font-semibold text-gray-900 dark:text-white">
										10:00 AM - 12:00 PM: Marketing Campaign
									</div>
								</div>
								<div
									class="text-sm text-gray-700 dark:text-gray-300 space-y-1 ml-8"
								>
									<p class="font-medium">AI Suggestions for this block:</p>
									<div class="flex items-center gap-2">
										<CheckCircle class="w-4 h-4 text-green-600" />
										<span>Finalize social media calendar</span>
									</div>
									<div class="flex items-center gap-2">
										<CheckCircle class="w-4 h-4 text-green-600" />
										<span>Draft email sequence #3</span>
									</div>
									<div class="flex items-center gap-2">
										<CheckCircle class="w-4 h-4 text-green-600" />
										<span>Review landing page copy</span>
									</div>
								</div>
							</div>
						</div>
					</div>

					{#if ONBOARDING_V2_CONFIG.features.showPlaceholderAssets}
						<div
							class="mt-4 bg-gray-100 dark:bg-gray-800 rounded-lg p-8 text-center border-2 border-dashed border-gray-300 dark:border-gray-600"
						>
							<Sparkles class="w-12 h-12 text-gray-400 mx-auto mb-4" />
							<p class="text-gray-500 text-sm">
								[Screenshot: Calendar with timeblock and AI task suggestions]
							</p>
						</div>
					{:else}
						<img
							src={ONBOARDING_V2_CONFIG.assets.screenshots.timeblockWithSuggestions}
							alt="Timeblock with AI suggestions"
							class="rounded-lg shadow-lg"
						/>
					{/if}
				</div>
			</div>
		{/if}
	</div>

	<!-- Navigation -->
	<div class="flex justify-end mt-8">
		<Button variant="primary" size="lg" onclick={onNext} class="min-w-[200px]">
			Continue
			<Sparkles class="w-5 h-5 ml-2" />
		</Button>
	</div>
</div>
