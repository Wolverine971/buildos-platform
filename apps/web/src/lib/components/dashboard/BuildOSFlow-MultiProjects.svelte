<!-- src/lib/components/dashboard/BuildOSFlow-MultiProjects.svelte -->
<script lang="ts">
	import {
		Brain,
		FileText,
		CheckSquare,
		Calendar,
		FileBarChart,
		Sparkles,
		ArrowDown,
		Layers
	} from 'lucide-svelte';
	import { onMount } from 'svelte';

	let mounted = false;

	onMount(() => {
		mounted = true;
	});
</script>

<div class="w-full py-12 px-4 sm:px-6 lg:px-8">
	<div class="max-w-7xl mx-auto">
		<!-- Title -->
		<div class="text-center mb-12">
			<h2 class="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
				How BuildOS Works
			</h2>
			<p class="text-lg text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
				From chaotic thoughts to completed projects - your brain dump becomes your execution
				system
			</p>
		</div>

		<!-- Flow Diagram -->
		<div class="space-y-8">
			<!-- Step 1: Brain Dump -->
			<div class="relative {mounted ? 'fade-in' : 'opacity-0'}">
				<div
					class="bg-gradient-to-r from-primary-600 to-purple-600 rounded-2xl p-8 text-white shadow-xl"
				>
					<div class="flex items-center justify-center mb-6">
						<div
							class="w-16 h-16 bg-white/20 backdrop-blur rounded-full flex items-center justify-center"
						>
							<Brain class="w-8 h-8" />
						</div>
					</div>
					<h3 class="text-2xl font-bold text-center mb-4">1. Brain Dump Everything</h3>
					<div class="max-w-2xl mx-auto">
						<div class="bg-white/10 backdrop-blur rounded-xl p-6">
							<p class="italic text-white/90 text-center">
								"Need to finish the marketing site... should reach out to Sarah
								about the design... pricing strategy needs work... don't forget the
								investor update... maybe we should pivot the feature roadmap..."
							</p>
						</div>
						<p class="text-center mt-4 text-white/80">
							Voice or text - just dump it all out. No structure needed.
						</p>
					</div>
				</div>

				<!-- Arrow -->
				<div class="flex justify-center my-6">
					<ArrowDown class="w-8 h-8 text-gray-400 dark:text-gray-500 animate-bounce" />
				</div>
			</div>

			<!-- Step 2: AI Processing -->
			<div class="relative {mounted ? 'fade-in delay-200' : 'opacity-0'}">
				<div
					class="bg-gradient-to-br from-purple-50 to-primary-50 dark:from-purple-900/20 dark:to-primary-900/20 rounded-2xl p-8 border border-purple-200 dark:border-purple-700"
				>
					<div class="flex items-center justify-center mb-6">
						<div
							class="w-16 h-16 bg-gradient-to-r from-purple-600 to-primary-600 rounded-full flex items-center justify-center animate-pulse"
						>
							<Sparkles class="w-8 h-8 text-white" />
						</div>
					</div>
					<h3 class="text-2xl font-bold text-center mb-6 text-gray-900 dark:text-white">
						2. AI Organizes Into Projects
					</h3>

					<!-- Projects Grid -->
					<div class="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
						<!-- Project 1 -->
						<div
							class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-700"
						>
							<div class="flex items-center gap-3 mb-4">
								<div
									class="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center"
								>
									<FileText
										class="w-5 h-5 text-primary-600 dark:text-primary-400"
									/>
								</div>
								<h4 class="font-semibold text-gray-900 dark:text-white">
									Marketing Site Launch
								</h4>
							</div>

							<div class="space-y-3 text-sm">
								<!-- Phases -->
								<div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
									<div class="flex items-center gap-2 mb-2">
										<Layers
											class="w-4 h-4 text-purple-600 dark:text-purple-400"
										/>
										<span class="font-medium text-gray-700 dark:text-gray-300"
											>3 Phases</span
										>
									</div>
									<ul class="text-xs text-gray-600 dark:text-gray-400 space-y-1">
										<li>• Design & Content</li>
										<li>• Development</li>
										<li>• Launch & Promote</li>
									</ul>
								</div>

								<!-- Context Doc -->
								<div class="bg-primary-50 dark:bg-primary-900/20 rounded-lg p-3">
									<div class="flex items-center gap-2 mb-1">
										<FileBarChart
											class="w-4 h-4 text-primary-600 dark:text-primary-400"
										/>
										<span class="font-medium text-gray-700 dark:text-gray-300"
											>Context Doc</span
										>
									</div>
									<p class="text-xs text-gray-600 dark:text-gray-400">
										Strategy, goals, target audience, success metrics
									</p>
								</div>

								<!-- Tasks -->
								<div class="flex items-center gap-2">
									<CheckSquare
										class="w-4 h-4 text-green-600 dark:text-green-400"
									/>
									<span class="text-gray-700 dark:text-gray-300">12 Tasks</span>
								</div>
							</div>
						</div>

						<!-- Project 2 -->
						<div
							class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-700"
						>
							<div class="flex items-center gap-3 mb-4">
								<div
									class="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center"
								>
									<FileText
										class="w-5 h-5 text-purple-600 dark:text-purple-400"
									/>
								</div>
								<h4 class="font-semibold text-gray-900 dark:text-white">
									Pricing Strategy
								</h4>
							</div>

							<div class="space-y-3 text-sm">
								<!-- Phases -->
								<div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
									<div class="flex items-center gap-2 mb-2">
										<Layers
											class="w-4 h-4 text-purple-600 dark:text-purple-400"
										/>
										<span class="font-medium text-gray-700 dark:text-gray-300"
											>2 Phases</span
										>
									</div>
									<ul class="text-xs text-gray-600 dark:text-gray-400 space-y-1">
										<li>• Research & Analysis</li>
										<li>• Implementation</li>
									</ul>
								</div>

								<!-- Context Doc -->
								<div class="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3">
									<div class="flex items-center gap-2 mb-1">
										<FileBarChart
											class="w-4 h-4 text-purple-600 dark:text-purple-400"
										/>
										<span class="font-medium text-gray-700 dark:text-gray-300"
											>Context Doc</span
										>
									</div>
									<p class="text-xs text-gray-600 dark:text-gray-400">
										Competitor analysis, value prop, pricing tiers
									</p>
								</div>

								<!-- Tasks -->
								<div class="flex items-center gap-2">
									<CheckSquare
										class="w-4 h-4 text-green-600 dark:text-green-400"
									/>
									<span class="text-gray-700 dark:text-gray-300">8 Tasks</span>
								</div>
							</div>
						</div>

						<!-- Project 3 -->
						<div
							class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-700"
						>
							<div class="flex items-center gap-3 mb-4">
								<div
									class="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center"
								>
									<FileText
										class="w-5 h-5 text-orange-600 dark:text-orange-400"
									/>
								</div>
								<h4 class="font-semibold text-gray-900 dark:text-white">
									Investor Update
								</h4>
							</div>

							<div class="space-y-3 text-sm">
								<!-- Phases -->
								<div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
									<div class="flex items-center gap-2 mb-2">
										<Layers
											class="w-4 h-4 text-purple-600 dark:text-purple-400"
										/>
										<span class="font-medium text-gray-700 dark:text-gray-300"
											>2 Phases</span
										>
									</div>
									<ul class="text-xs text-gray-600 dark:text-gray-400 space-y-1">
										<li>• Data Collection</li>
										<li>• Writing & Send</li>
									</ul>
								</div>

								<!-- Context Doc -->
								<div class="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3">
									<div class="flex items-center gap-2 mb-1">
										<FileBarChart
											class="w-4 h-4 text-orange-600 dark:text-orange-400"
										/>
										<span class="font-medium text-gray-700 dark:text-gray-300"
											>Context Doc</span
										>
									</div>
									<p class="text-xs text-gray-600 dark:text-gray-400">
										KPIs, milestones, asks, narrative
									</p>
								</div>

								<!-- Tasks -->
								<div class="flex items-center gap-2">
									<CheckSquare
										class="w-4 h-4 text-green-600 dark:text-green-400"
									/>
									<span class="text-gray-700 dark:text-gray-300">6 Tasks</span>
								</div>
							</div>
						</div>
					</div>
				</div>

				<!-- Arrow -->
				<div class="flex justify-center my-6">
					<ArrowDown class="w-8 h-8 text-gray-400 dark:text-gray-500 animate-bounce" />
				</div>
			</div>

			<!-- Step 3: Calendar Scheduling -->
			<div class="relative {mounted ? 'fade-in delay-400' : 'opacity-0'}">
				<div
					class="bg-gradient-to-r from-orange-50 to-pink-50 dark:from-orange-900/20 dark:to-pink-900/20 rounded-2xl p-8 border border-orange-200 dark:border-orange-700"
				>
					<div class="flex items-center justify-center mb-6">
						<div
							class="w-16 h-16 bg-gradient-to-r from-orange-500 to-pink-500 rounded-full flex items-center justify-center"
						>
							<Calendar class="w-8 h-8 text-white" />
						</div>
					</div>
					<h3 class="text-2xl font-bold text-center mb-6 text-gray-900 dark:text-white">
						3. Tasks Auto-Schedule to Calendar
					</h3>

					<!-- Calendar Preview -->
					<div
						class="max-w-3xl mx-auto bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-700"
					>
						<div class="space-y-3">
							<div
								class="flex items-center gap-4 p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg"
							>
								<span
									class="text-sm font-medium text-gray-700 dark:text-gray-300 w-20"
									>9:00 AM</span
								>
								<div class="flex-1">
									<p class="font-medium text-gray-900 dark:text-white">
										Review design mockups
									</p>
									<p class="text-xs text-gray-600 dark:text-gray-400">
										Marketing Site Launch • 45 min
									</p>
								</div>
							</div>
							<div
								class="flex items-center gap-4 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg"
							>
								<span
									class="text-sm font-medium text-gray-700 dark:text-gray-300 w-20"
									>10:00 AM</span
								>
								<div class="flex-1">
									<p class="font-medium text-gray-900 dark:text-white">
										Research competitor pricing
									</p>
									<p class="text-xs text-gray-600 dark:text-gray-400">
										Pricing Strategy • 2 hours
									</p>
								</div>
							</div>
							<div
								class="flex items-center gap-4 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg"
							>
								<span
									class="text-sm font-medium text-gray-700 dark:text-gray-300 w-20"
									>2:00 PM</span
								>
								<div class="flex-1">
									<p class="font-medium text-gray-900 dark:text-white">
										Draft investor update
									</p>
									<p class="text-xs text-gray-600 dark:text-gray-400">
										Investor Update • 90 min
									</p>
								</div>
							</div>
						</div>
						<p class="text-center mt-4 text-sm text-gray-600 dark:text-gray-400">
							Intelligently scheduled around your existing calendar
						</p>
					</div>
				</div>

				<!-- Arrow -->
				<div class="flex justify-center my-6">
					<ArrowDown class="w-8 h-8 text-gray-400 dark:text-gray-500 animate-bounce" />
				</div>
			</div>

			<!-- Step 4: Daily Brief -->
			<div class="relative {mounted ? 'fade-in delay-600' : 'opacity-0'}">
				<div
					class="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-2xl p-8 border border-green-200 dark:border-green-700"
				>
					<div class="flex items-center justify-center mb-6">
						<div
							class="w-16 h-16 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center justify-center"
						>
							<FileBarChart class="w-8 h-8 text-white" />
						</div>
					</div>
					<h3 class="text-2xl font-bold text-center mb-6 text-gray-900 dark:text-white">
						4. Wake Up to Your Daily Brief
					</h3>

					<!-- Daily Brief Preview -->
					<div
						class="max-w-3xl mx-auto bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-700"
					>
						<h4 class="font-semibold text-lg mb-4 text-gray-900 dark:text-white">
							Good morning! Here's your focus for today:
						</h4>

						<div class="space-y-4">
							<!-- Priority Tasks -->
							<div>
								<h5 class="font-medium text-gray-700 dark:text-gray-300 mb-2">
									🎯 Priority Tasks
								</h5>
								<ul class="space-y-2 text-sm text-gray-600 dark:text-gray-400">
									<li class="flex items-center gap-2">
										<span class="w-2 h-2 bg-red-500 rounded-full"></span>
										Review design mockups with Sarah (9:00 AM)
									</li>
									<li class="flex items-center gap-2">
										<span class="w-2 h-2 bg-orange-500 rounded-full"></span>
										Complete pricing analysis (10:00 AM - 12:00 PM)
									</li>
									<li class="flex items-center gap-2">
										<span class="w-2 h-2 bg-yellow-500 rounded-full"></span>
										Draft investor update (2:00 PM)
									</li>
								</ul>
							</div>

							<!-- Project Status -->
							<div>
								<h5 class="font-medium text-gray-700 dark:text-gray-300 mb-2">
									📊 Project Status
								</h5>
								<div class="grid grid-cols-3 gap-3 text-sm">
									<div
										class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 text-center"
									>
										<p class="font-medium text-gray-900 dark:text-white">
											Marketing Site
										</p>
										<p class="text-xs text-gray-600 dark:text-gray-400">
											Phase 1 of 3
										</p>
									</div>
									<div
										class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 text-center"
									>
										<p class="font-medium text-gray-900 dark:text-white">
											Pricing
										</p>
										<p class="text-xs text-gray-600 dark:text-gray-400">
											Research phase
										</p>
									</div>
									<div
										class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 text-center"
									>
										<p class="font-medium text-gray-900 dark:text-white">
											Investor Update
										</p>
										<p class="text-xs text-gray-600 dark:text-gray-400">
											Due in 3 days
										</p>
									</div>
								</div>
							</div>

							<!-- AI Insight -->
							<div class="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
								<p class="text-sm text-green-800 dark:text-green-200">
									<strong>💡 AI Insight:</strong> Your pricing research will inform
									the investor update. Consider completing the competitive analysis
									first to strengthen your narrative.
								</p>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Continuous Loop -->
			<div class="relative {mounted ? 'fade-in delay-800' : 'opacity-0'} mt-12">
				<div
					class="bg-gradient-to-r from-primary-100 to-purple-100 dark:from-primary-900/20 dark:to-purple-900/20 rounded-2xl p-6 border-2 border-dashed border-primary-300 dark:border-primary-700"
				>
					<div class="text-center">
						<p class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
							🔄 Continuous Improvement Loop
						</p>
						<p class="text-gray-600 dark:text-gray-400">
							Complete tasks → Brain dump progress → AI refines projects → Stay on
							track
						</p>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.fade-in {
		animation: fadeIn 0.6s ease-out forwards;
		opacity: 0;
	}

	.delay-200 {
		animation-delay: 0.2s;
	}

	.delay-400 {
		animation-delay: 0.4s;
	}

	.delay-600 {
		animation-delay: 0.6s;
	}

	.delay-800 {
		animation-delay: 0.8s;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.animate-bounce {
		animation: bounce 2s infinite;
	}

	@keyframes bounce {
		0%,
		100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(10px);
		}
	}

	.animate-pulse {
		animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.8;
		}
	}
</style>
