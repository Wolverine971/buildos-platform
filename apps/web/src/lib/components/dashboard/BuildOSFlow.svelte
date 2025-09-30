<!-- src/lib/components/dashboard/BuildOSFlow.svelte -->
<script lang="ts">
	import {
		Brain,
		FileText,
		CheckSquare,
		Calendar,
		FileBarChart,
		Sparkles,
		ArrowDown,
		Layers,
		Plus,
		AlertTriangle,
		Clock,
		CheckCircle,
		Zap,
		ChevronRight
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { onMount } from 'svelte';

	let mounted = false;
	let innerWidth = 0;

	onMount(() => {
		mounted = true;
	});
</script>

<svelte:window bind:innerWidth />

<div class="w-full py-8 sm:py-12 px-4 sm:px-6 lg:px-8 overflow-x-hidden">
	<div class="max-w-7xl mx-auto">
		<!-- Title - Responsive sizing -->
		<div class="text-center mb-8 sm:mb-12">
			<h2
				class="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white mb-3 sm:mb-4"
			>
				How BuildOS Works
			</h2>
			<p
				class="text-base sm:text-lg text-gray-600 dark:text-gray-300 max-w-3xl mx-auto px-4 sm:px-0"
			>
				Watch your scattered thoughts transform into organized projects, scheduled tasks,
				and daily action plans
			</p>
		</div>

		<!-- Flow Diagram - Better mobile spacing -->
		<div class="space-y-6 sm:space-y-8">
			<!-- Step 1: Brain Dump -->
			<div class="relative {mounted ? 'fade-in' : 'opacity-0'}">
				<div
					class="bg-gradient-to-br from-primary-50 to-purple-50 dark:from-primary-900/20 dark:to-purple-900/20 rounded-xl sm:rounded-2xl p-4 sm:p-6 lg:p-8 border border-primary-200 dark:border-primary-700"
				>
					<!-- Step Header - Stack on mobile -->
					<div class="mb-4 sm:mb-6">
						<div
							class="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3"
						>
							<div class="relative">
								<Brain
									class="w-8 h-8 sm:w-10 sm:h-10 text-purple-600 dark:text-purple-400"
								/>
								<div class="absolute -top-0 -right-0">
									<div class="relative">
										<div
											class="absolute inset-0 bg-yellow-400 rounded-full blur-sm opacity-40 animate-pulse"
										></div>
										<Zap
											class="w-4 h-4 sm:w-5 sm:h-5 text-yellow-500 relative z-10"
										/>
									</div>
								</div>
							</div>
							<h3
								class="text-xl sm:text-2xl font-bold text-center text-gray-900 dark:text-white"
							>
								1. Brain Dump About Your Project
							</h3>
						</div>
					</div>

					<div class="max-w-2xl mx-auto">
						<div
							class="bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl p-4 sm:p-6 shadow-lg border border-gray-200 dark:border-gray-700"
						>
							<p class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-2">
								Thinking about: Marketing Site Launch
							</p>
							<p class="italic text-sm sm:text-base text-gray-700 dark:text-gray-300">
								"Need to launch the marketing site by month end. Hero design needs
								Sarah's approval tomorrow. Copy should focus on benefits not
								features. Add pricing calculator and analytics before launch. Design
								approval needed by Friday..."
							</p>
						</div>
						<p
							class="text-center mt-3 sm:mt-4 text-sm sm:text-base text-gray-600 dark:text-gray-400"
						>
							Voice, text, or paste—just get it out of your head
						</p>
					</div>
				</div>

				<!-- Arrow - Smaller on mobile -->
				<div class="flex justify-center my-4 sm:my-6">
					<ArrowDown
						class="w-6 h-6 sm:w-8 sm:h-8 text-gray-400 dark:text-gray-500 animate-bounce"
					/>
				</div>
			</div>

			<!-- Step 2: AI Creates/Updates Project -->
			<div class="relative {mounted ? 'fade-in delay-200' : 'opacity-0'}">
				<div
					class="bg-gradient-to-br from-purple-50 to-primary-50 dark:from-purple-900/20 dark:to-primary-900/20 rounded-xl sm:rounded-2xl p-4 sm:p-6 lg:p-8 border border-purple-200 dark:border-purple-700"
				>
					<!-- Step Header -->
					<div class="mb-4 sm:mb-6">
						<div
							class="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3"
						>
							<div class="animate-twinkle">
								<Sparkles
									class="w-8 h-8 sm:w-10 sm:h-10 text-purple-600 dark:text-purple-400"
								/>
							</div>
							<h3
								class="text-xl sm:text-2xl font-bold text-center text-gray-900 dark:text-white"
							>
								2. AI Builds Your Complete Project System
							</h3>
						</div>
					</div>

					<!-- New Project Created -->
					<div class="max-w-4xl mx-auto">
						<div
							class="bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-t-lg sm:rounded-t-xl flex items-center gap-2"
						>
							<Plus class="w-3 h-3 sm:w-4 sm:h-4" />
							<span class="font-medium">New Project Created</span>
						</div>
						<div
							class="bg-white dark:bg-gray-800 rounded-b-lg sm:rounded-b-xl p-4 sm:p-6 shadow-xl border border-gray-200 dark:border-gray-700"
						>
							<!-- Project Header -->
							<div class="flex items-center gap-3 mb-4">
								<div
									class="w-10 h-10 sm:w-12 sm:h-12 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center flex-shrink-0"
								>
									<FileText
										class="w-5 h-5 sm:w-6 sm:h-6 text-primary-600 dark:text-primary-400"
									/>
								</div>
								<div class="min-w-0">
									<h4
										class="font-bold text-base sm:text-lg text-gray-900 dark:text-white truncate"
									>
										Marketing Site Launch
									</h4>
									<p class="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
										Created from your brain dump
									</p>
								</div>
							</div>

							<!-- Stack on mobile, grid on desktop -->
							<div class="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-6">
								<!-- Left: Context Document -->
								<div
									class="bg-gradient-to-br from-primary-50 to-purple-50 dark:from-primary-900/20 dark:to-purple-900/20 rounded-lg p-3 sm:p-4"
								>
									<div class="flex items-center gap-2 mb-3">
										<FileBarChart
											class="w-4 h-4 sm:w-5 sm:h-5 text-primary-600 dark:text-primary-400"
										/>
										<span
											class="font-semibold text-sm sm:text-base text-gray-900 dark:text-white"
											>Project Knowledge Base</span
										>
									</div>
									<div
										class="bg-white/70 dark:bg-gray-800/70 rounded-lg p-3 space-y-2"
									>
										{#each [{ title: 'Objectives', content: 'Convert visitors, establish brand' }, { title: 'Success Metrics', content: '5% conversion, 2min on site' }, { title: 'Key Decisions', content: 'Benefits copy, pricing calc' }, { title: 'Timeline', content: 'Design Friday, launch month end' }] as section}
											<div>
												<p
													class="font-medium text-xs sm:text-sm text-gray-700 dark:text-gray-300"
												>
													## {section.title}
												</p>
												<p class="text-xs text-gray-600 dark:text-gray-400">
													{section.content}
												</p>
											</div>
										{/each}
									</div>
								</div>

								<!-- Right: Phases and Tasks -->
								<div class="space-y-3 sm:space-y-4">
									<!-- Phases -->
									<div
										class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 sm:p-4"
									>
										<div class="flex items-center gap-2 mb-2 sm:mb-3">
											<Layers
												class="w-4 h-4 sm:w-5 sm:h-5 text-purple-600 dark:text-purple-400"
											/>
											<span
												class="font-semibold text-sm sm:text-base text-gray-900 dark:text-white"
												>3 Phases</span
											>
										</div>
										<div class="space-y-1.5 sm:space-y-2">
											{#each [{ color: 'bg-purple-500', text: 'Phase 1: Design & Content (This week)' }, { color: 'bg-purple-400', text: 'Phase 2: Development (Next week)' }, { color: 'bg-purple-300', text: 'Phase 3: Launch & Analytics' }] as phase}
												<div class="flex items-start sm:items-center gap-2">
													<span
														class="w-1.5 h-1.5 sm:w-2 sm:h-2 {phase.color} rounded-full mt-1 sm:mt-0 flex-shrink-0"
													></span>
													<span
														class="text-xs sm:text-sm text-gray-700 dark:text-gray-300 break-words"
													>
														{phase.text}
													</span>
												</div>
											{/each}
										</div>
									</div>

									<!-- Tasks -->
									<div
										class="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 sm:p-4"
									>
										<div class="flex items-center gap-2 mb-2 sm:mb-3">
											<CheckSquare
												class="w-4 h-4 sm:w-5 sm:h-5 text-green-600 dark:text-green-400"
											/>
											<span
												class="font-semibold text-sm sm:text-base text-gray-900 dark:text-white"
												>8 Tasks Generated</span
											>
										</div>
										<ul class="space-y-1">
											{#each [{ priority: 'High', color: 'text-red-600', task: 'Review hero design with Sarah' }, { priority: 'High', color: 'text-red-600', task: 'Rewrite copy for benefits' }, { priority: 'Med', color: 'text-orange-600', task: 'Build pricing calculator' }, { priority: 'Low', color: 'text-yellow-600', task: 'Set up analytics' }] as item}
												<li
													class="flex items-start gap-2 text-xs sm:text-sm text-gray-700 dark:text-gray-300"
												>
													<span
														class="text-xs {item.color} font-medium min-w-[30px]"
														>{item.priority}</span
													>
													<span class="break-words">{item.task}</span>
												</li>
											{/each}
										</ul>
									</div>
								</div>
							</div>
						</div>

						<!-- Existing Projects - Horizontal scroll on mobile -->
						<div class="mt-6 sm:mt-8">
							<p
								class="text-center text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-3 sm:mb-4"
							>
								Lives alongside your existing projects:
							</p>

							<!-- Mobile: Horizontal scroll -->
							<div class="sm:hidden overflow-x-auto pb-2">
								<div class="flex gap-3" style="width: max-content;">
									{#each [{ color: 'purple', name: 'Mobile App v2', phase: '2 of 4', tasks: 15 }, { color: 'orange', name: 'Q1 Fundraising', phase: '1 of 3', tasks: 22 }, { color: 'blue', name: 'Team Expansion', phase: '3 of 3', tasks: 8 }] as project}
										<div
											class="bg-white/60 dark:bg-gray-800/60 rounded-lg p-3 border border-gray-200 dark:border-gray-600 opacity-70"
											style="min-width: 140px;"
										>
											<div class="flex items-center gap-2 mb-2">
												<div
													class="w-6 h-6 bg-{project.color}-100 dark:bg-{project.color}-900/30 rounded flex items-center justify-center"
												>
													<FileText
														class="w-3 h-3 text-{project.color}-600 dark:text-{project.color}-400"
													/>
												</div>
												<h5
													class="text-xs font-medium text-gray-700 dark:text-gray-300 truncate"
												>
													{project.name}
												</h5>
											</div>
											<p class="text-xs text-gray-500 dark:text-gray-400">
												Phase {project.phase} • {project.tasks} tasks
											</p>
										</div>
									{/each}
								</div>
							</div>

							<!-- Desktop: Grid -->
							<div class="hidden sm:grid sm:grid-cols-3 gap-4">
								{#each [{ color: 'purple', name: 'Mobile App v2', phase: '2 of 4', tasks: 15 }, { color: 'orange', name: 'Q1 Fundraising', phase: '1 of 3', tasks: 22 }, { color: 'blue', name: 'Team Expansion', phase: '3 of 3', tasks: 8 }] as project}
									<div
										class="bg-white/60 dark:bg-gray-800/60 rounded-lg p-4 border border-gray-200 dark:border-gray-600 opacity-70"
									>
										<div class="flex items-center gap-2 mb-2">
											<div
												class="w-8 h-8 bg-{project.color}-100 dark:bg-{project.color}-900/30 rounded flex items-center justify-center"
											>
												<FileText
													class="w-4 h-4 text-{project.color}-600 dark:text-{project.color}-400"
												/>
											</div>
											<h5
												class="text-sm font-medium text-gray-700 dark:text-gray-300"
											>
												{project.name}
											</h5>
										</div>
										<p class="text-xs text-gray-500 dark:text-gray-400">
											Phase {project.phase} • {project.tasks} tasks
										</p>
									</div>
								{/each}
							</div>
						</div>
					</div>
				</div>

				<!-- Arrow -->
				<div class="flex justify-center my-4 sm:my-6">
					<ArrowDown
						class="w-6 h-6 sm:w-8 sm:h-8 text-gray-400 dark:text-gray-500 animate-bounce"
					/>
				</div>
			</div>

			<!-- Step 3: Calendar Scheduling -->
			<div class="relative {mounted ? 'fade-in delay-400' : 'opacity-0'}">
				<div
					class="bg-gradient-to-r from-orange-50 to-pink-50 dark:from-orange-900/20 dark:to-pink-900/20 rounded-xl sm:rounded-2xl p-4 sm:p-6 lg:p-8 border border-orange-200 dark:border-orange-700"
				>
					<!-- Step Header -->
					<div class="mb-4 sm:mb-6">
						<div
							class="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3"
						>
							<div class="animate-subtle-rotate">
								<Calendar
									class="w-8 h-8 sm:w-10 sm:h-10 text-orange-500 dark:text-orange-400"
								/>
							</div>
							<h3
								class="text-xl sm:text-2xl font-bold text-center text-gray-900 dark:text-white"
							>
								3. AI Finds Perfect Time Slots in Your Calendar
							</h3>
						</div>
					</div>

					<!-- Mobile: Single column with tabs, Desktop: Three columns -->
					<div class="max-w-6xl mx-auto">
						<!-- Mobile View -->
						<div class="sm:hidden">
							<!-- Tab buttons -->
							<div class="flex gap-2 mb-4 justify-center">
								{#each ['Past Due', 'Today', 'Tomorrow'] as tab, i}
									<Button
										class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium min-w-0
										{i === 1
											? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-md'
											: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}"
										variant="ghost"
										size="sm"
										btnType="container"
									>
										<span class="truncate">{tab}</span>
									</Button>
								{/each}
							</div>

							<!-- Today's tasks (shown by default on mobile) -->
							<div
								class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 border border-gray-200 dark:border-gray-700"
							>
								<div class="flex items-center gap-2 mb-3">
									<Clock class="h-4 w-4 text-blue-600" />
									<h3
										class="text-base font-semibold text-gray-900 dark:text-white"
									>
										Today
									</h3>
								</div>

								<div class="space-y-2">
									{#each [{ isNew: true, priority: 'high', time: '9:00 AM', title: 'Review hero design with Sarah', subtitle: 'Finalize before dev starts', project: 'Marketing Site' }, { isNew: true, priority: 'high', time: '10:00 AM', title: 'Rewrite benefits-focused copy', project: 'Marketing Site' }, { isNew: false, priority: 'medium', time: '2:00 PM', title: 'User interviews', project: 'Mobile App v2' }] as task}
										<div
											class="relative bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 border-l-3 {task.priority ===
											'high'
												? 'border-l-red-500'
												: 'border-l-orange-500'}"
										>
											{#if task.isNew}
												<span
													class="absolute -top-1.5 -right-1.5 text-xs px-2 py-0.5 bg-green-500 text-white rounded-full font-medium"
												>
													New
												</span>
											{/if}
											<div class="flex items-start justify-between gap-2">
												<div class="flex-1 min-w-0">
													<h4
														class="font-medium text-sm text-gray-900 dark:text-white"
													>
														{task.title}
													</h4>
													{#if task.subtitle}
														<p
															class="text-xs text-gray-600 dark:text-gray-400 mt-0.5"
														>
															{task.subtitle}
														</p>
													{/if}
													<div
														class="flex flex-wrap items-center gap-2 mt-2"
													>
														<span
															class="text-xs text-gray-500 dark:text-gray-400"
															>{task.time}</span
														>
														<span
															class="text-xs text-gray-500 dark:text-gray-400"
															>• {task.project}</span
														>
														{#if task.priority === 'high'}
															<span
																class="text-xs font-medium text-red-600 dark:text-red-400"
															>
																high
															</span>
														{:else if task.priority === 'medium'}
															<span
																class="text-xs font-medium text-orange-600 dark:text-orange-400"
															>
																med
															</span>
														{/if}
													</div>
												</div>
												<CheckCircle
													class="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5"
												/>
											</div>
										</div>
									{/each}
								</div>
							</div>
						</div>

						<!-- Desktop View - Three columns -->
						<div class="hidden sm:grid sm:grid-cols-3 gap-4">
							<!-- Past Due Column -->
							<div
								class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 border border-gray-200 dark:border-gray-700"
							>
								<div class="flex items-center justify-between mb-3">
									<h3
										class="text-base font-semibold text-gray-900 dark:text-white flex items-center"
									>
										<AlertTriangle class="mr-2 h-5 w-5 text-red-600" />
										<span>Past Due</span>
									</h3>
									<span
										class="text-sm bg-red-100 dark:bg-red-900/30 px-2 py-1 rounded-full font-medium text-red-700 dark:text-red-300"
									>
										2
									</span>
								</div>

								<div class="space-y-2">
									{#each [{ title: 'Update investor deck', subtitle: 'Q4 metrics and runway', date: 'Dec 15 • 3d late', project: 'Fundraising', priority: 'high' }, { title: 'Code review PR #425', date: 'Dec 16 • 2d late', project: 'Mobile App v2' }] as task}
										<div
											class="p-3 rounded-lg border-l-4 border-l-red-500 bg-red-50/50 dark:bg-red-900/5"
										>
											<h4
												class="font-medium text-sm text-gray-900 dark:text-white"
											>
												{task.title}
											</h4>
											{#if task.subtitle}
												<p
													class="text-xs text-gray-600 dark:text-gray-400 mt-0.5"
												>
													{task.subtitle}
												</p>
											{/if}
											<div class="flex items-center justify-between mt-1.5">
												<div class="flex items-center gap-2 text-xs">
													<span class="text-red-600 dark:text-red-400"
														>{task.date}</span
													>
													<span class="text-gray-500 dark:text-gray-400"
														>{task.project}</span
													>
													{#if task.priority}
														<span
															class="px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
														>
															{task.priority}
														</span>
													{/if}
												</div>
												<Calendar class="h-3 w-3 text-gray-400" />
											</div>
										</div>
									{/each}
								</div>
							</div>

							<!-- Today Column -->
							<div
								class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 border border-gray-200 dark:border-gray-700"
							>
								<div class="flex items-center justify-between mb-3">
									<h3
										class="text-base font-semibold text-gray-900 dark:text-white flex items-center"
									>
										<Clock class="mr-2 h-5 w-5 text-blue-600" />
										<span>Today</span>
									</h3>
									<span
										class="text-sm bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-full font-medium"
									>
										3
									</span>
								</div>

								<div class="space-y-2">
									{#each [{ isNew: true, priority: 'high', time: '9:00 AM', title: 'Review hero design with Sarah', subtitle: 'Finalize before dev starts', project: 'Marketing Site' }, { isNew: true, priority: 'high', time: '10:00 AM', title: 'Rewrite benefits-focused copy', project: 'Marketing Site' }, { isNew: false, priority: 'medium', time: '2:00 PM', title: 'User interviews', project: 'Mobile App v2' }] as task}
										<div
											class="relative p-3 rounded-lg border-l-4 {task.priority ===
											'high'
												? 'border-l-red-500 bg-red-50/50 dark:bg-red-900/5'
												: 'border-l-orange-500 bg-orange-50/50 dark:bg-orange-900/5'}"
										>
											{#if task.isNew}
												<span
													class="absolute -top-1 -right-1 text-xs px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded font-medium"
												>
													New
												</span>
											{/if}
											<h4
												class="font-medium text-sm text-gray-900 dark:text-white"
											>
												{task.title}
											</h4>
											{#if task.subtitle}
												<p
													class="text-xs text-gray-600 dark:text-gray-400 mt-0.5"
												>
													{task.subtitle}
												</p>
											{/if}
											<div class="flex items-center justify-between mt-1.5">
												<div class="flex items-center gap-2 text-xs">
													<span class="text-gray-500 dark:text-gray-400"
														>{task.time}</span
													>
													<span class="text-gray-500 dark:text-gray-400"
														>{task.project}</span
													>
													{#if task.priority === 'high'}
														<span
															class="px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
														>
															high
														</span>
													{:else if task.priority === 'medium'}
														<span
															class="px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
														>
															medium
														</span>
													{/if}
												</div>
												<CheckCircle
													class="h-3 w-3 text-green-600 dark:text-green-400"
												/>
											</div>
										</div>
									{/each}
								</div>
							</div>

							<!-- Tomorrow Column -->
							<div
								class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 border border-gray-200 dark:border-gray-700"
							>
								<div class="flex items-center justify-between mb-3">
									<h3
										class="text-base font-semibold text-gray-900 dark:text-white flex items-center"
									>
										<Calendar class="mr-2 h-5 w-5 text-green-600" />
										<span>Tomorrow</span>
									</h3>
									<span
										class="text-sm bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-full font-medium"
									>
										2
									</span>
								</div>

								<div class="space-y-2">
									{#each [{ isNew: true, title: 'Build pricing calculator widget', subtitle: 'Interactive component for landing page', date: 'Dec 19', project: 'Marketing Site', priority: 'medium' }, { isNew: false, title: 'Weekly team standup', date: 'Dec 19', project: 'Team Expansion' }] as task}
										<div
											class="relative p-3 rounded-lg border-l-4 {task.priority ===
											'medium'
												? 'border-l-orange-500 bg-orange-50/50 dark:bg-orange-900/5'
												: 'border-l-blue-500 bg-blue-50/50 dark:bg-blue-900/5'}"
										>
											{#if task.isNew}
												<span
													class="absolute -top-1 -right-1 text-xs px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded font-medium"
												>
													New
												</span>
											{/if}
											<h4
												class="font-medium text-sm text-gray-900 dark:text-white"
											>
												{task.title}
											</h4>
											{#if task.subtitle}
												<p
													class="text-xs text-gray-600 dark:text-gray-400 mt-0.5"
												>
													{task.subtitle}
												</p>
											{/if}
											<div class="flex items-center justify-between mt-1.5">
												<div class="flex items-center gap-2 text-xs">
													<span class="text-gray-500 dark:text-gray-400"
														>{task.date}</span
													>
													<span class="text-gray-500 dark:text-gray-400"
														>{task.project}</span
													>
													{#if task.priority}
														<span
															class="px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
														>
															{task.priority}
														</span>
													{/if}
												</div>
												{#if task.isNew}
													<Calendar class="h-3 w-3 text-gray-400" />
												{:else}
													<CheckCircle
														class="h-3 w-3 text-green-600 dark:text-green-400"
													/>
												{/if}
											</div>
										</div>
									{/each}
								</div>
							</div>
						</div>

						<p
							class="text-center mt-4 sm:mt-6 text-xs sm:text-sm text-gray-600 dark:text-gray-400"
						>
							AI analyzed your calendar and found the best times • Green ✓ = synced to
							Google Calendar
						</p>
					</div>
				</div>

				<!-- Arrow -->
				<div class="flex justify-center my-4 sm:my-6">
					<ArrowDown
						class="w-6 h-6 sm:w-8 sm:h-8 text-gray-400 dark:text-gray-500 animate-bounce"
					/>
				</div>
			</div>

			<!-- Step 4: Daily Brief -->
			<div class="relative {mounted ? 'fade-in delay-600' : 'opacity-0'}">
				<div
					class="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl sm:rounded-2xl p-4 sm:p-6 lg:p-8 border border-green-200 dark:border-green-700"
				>
					<!-- Step Header -->
					<div class="mb-4 sm:mb-6">
						<div
							class="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3"
						>
							<div class="animate-subtle-slide">
								<FileBarChart
									class="w-8 h-8 sm:w-10 sm:h-10 text-green-500 dark:text-green-400"
								/>
							</div>
							<h3
								class="text-xl sm:text-2xl font-bold text-center text-gray-900 dark:text-white"
							>
								4. Wake Up to Your Personalized Action Plan
							</h3>
						</div>
					</div>

					<!-- Daily Brief Preview -->
					<div
						class="max-w-3xl mx-auto bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl p-4 sm:p-6 shadow-lg border border-gray-200 dark:border-gray-700"
					>
						<h4
							class="font-semibold text-base sm:text-lg mb-3 sm:mb-4 text-gray-900 dark:text-white"
						>
							Good morning! Here's your focus across all projects:
						</h4>

						<div class="space-y-4">
							<!-- Priority Tasks -->
							<div>
								<h5
									class="font-medium text-sm sm:text-base text-gray-700 dark:text-gray-300 mb-2"
								>
									🎯 Today's Priorities
								</h5>
								<ul class="space-y-2">
									{#each [{ priority: 'high', time: '9:00 AM', task: 'Review hero design with Sarah', project: 'Marketing Site' }, { priority: 'high', time: '10:00 AM', task: 'Rewrite benefits-focused copy', project: 'Marketing Site' }, { priority: 'medium', time: '2:00 PM', task: 'User interviews', project: 'Mobile App' }, { priority: 'low', task: 'Update investor deck', project: 'Fundraising' }] as item}
										<li
											class="flex items-start sm:items-center gap-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400"
										>
											<span
												class="w-1.5 h-1.5 sm:w-2 sm:h-2 {item.priority ===
												'high'
													? 'bg-red-500'
													: item.priority === 'medium'
														? 'bg-orange-500'
														: 'bg-yellow-500'} rounded-full mt-1.5 sm:mt-0 flex-shrink-0"
											></span>
											<span class="flex-1">
												{item.task}
												{#if item.time}
													<span class="text-gray-500 dark:text-gray-400"
														>({item.time})</span
													>
												{/if}
											</span>
											<span
												class="text-xs px-2 py-0.5 rounded {item.project ===
												'Marketing Site'
													? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
													: item.project === 'Mobile App'
														? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
														: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'}"
											>
												{item.project}
											</span>
										</li>
									{/each}
								</ul>
							</div>

							<!-- All Projects Status - Horizontal scroll on mobile -->
							<div>
								<h5
									class="font-medium text-sm sm:text-base text-gray-700 dark:text-gray-300 mb-2"
								>
									📊 All Projects Status
								</h5>

								<!-- Mobile: 2x2 grid -->
								<div class="grid grid-cols-2 gap-2 sm:hidden">
									{#each [{ color: 'primary', name: 'Marketing Site', phase: 'Phase 1 of 3', status: 'New today!', statusColor: 'text-green-600 dark:text-green-400' }, { color: 'purple', name: 'Mobile App v2', phase: 'Phase 2 of 4', status: 'On track' }, { color: 'orange', name: 'Q1 Fundraising', phase: 'Phase 1 of 3', status: 'Needs attention', statusColor: 'text-orange-600 dark:text-orange-400' }, { color: 'blue', name: 'Team Expansion', phase: 'Phase 3 of 3', status: 'Final phase' }] as project}
										<div
											class="bg-{project.color}-50 dark:bg-{project.color}-900/20 rounded-lg p-2.5 {project.color ===
											'primary'
												? 'border border-primary-200 dark:border-primary-700'
												: ''}"
										>
											<p
												class="font-medium text-xs text-gray-900 dark:text-white truncate"
											>
												{project.name}
											</p>
											<p class="text-xs text-gray-600 dark:text-gray-400">
												{project.phase.split(' ').slice(-3).join(' ')}
											</p>
											<p
												class="text-xs {project.statusColor ||
													'text-gray-500'} font-medium"
											>
												{project.status}
											</p>
										</div>
									{/each}
								</div>

								<!-- Desktop: 4 columns -->
								<div class="hidden sm:grid sm:grid-cols-4 gap-3 text-sm">
									{#each [{ color: 'primary', name: 'Marketing Site', phase: 'Phase 1 of 3', status: 'New today!', statusColor: 'text-green-600 dark:text-green-400' }, { color: 'purple', name: 'Mobile App v2', phase: 'Phase 2 of 4', status: 'On track' }, { color: 'orange', name: 'Q1 Fundraising', phase: 'Phase 1 of 3', status: 'Needs attention', statusColor: 'text-orange-600 dark:text-orange-400' }, { color: 'blue', name: 'Team Expansion', phase: 'Phase 3 of 3', status: 'Final phase' }] as project}
										<div
											class="bg-{project.color}-50 dark:bg-{project.color}-900/20 rounded-lg p-3 {project.color ===
											'primary'
												? 'border border-primary-200 dark:border-primary-700'
												: ''}"
										>
											<p class="font-medium text-gray-900 dark:text-white">
												{project.name}
											</p>
											<p class="text-xs text-gray-600 dark:text-gray-400">
												{project.phase}
											</p>
											<p
												class="text-xs {project.statusColor ||
													'text-gray-500'} font-medium"
											>
												{project.status}
											</p>
										</div>
									{/each}
								</div>
							</div>

							<!-- AI Insight -->
							<div class="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
								<p class="text-xs sm:text-sm text-green-800 dark:text-green-200">
									<strong>💡 AI Insight:</strong> Your marketing site launch will boost
									your fundraising deck. Today's user interviews = tomorrow's conversion
									copy. Consider mentioning the site launch in investor updates.
								</p>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Continuous Loop -->
			<div class="relative {mounted ? 'fade-in delay-800' : 'opacity-0'} mt-8 sm:mt-12">
				<div
					class="bg-gradient-to-r from-primary-100 to-purple-100 dark:from-primary-900/20 dark:to-purple-900/20 rounded-xl sm:rounded-2xl p-4 sm:p-6 border-2 border-dashed border-primary-300 dark:border-primary-700"
				>
					<div class="text-center">
						<p
							class="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-2"
						>
							The More You Use It, The Smarter It Gets
						</p>
						<p class="text-sm sm:text-base text-gray-600 dark:text-gray-400">
							Every brain dump makes BuildOS smarter about your work style. Projects
							that used to take months now ship in weeks
							<span class="animate-ship-pulse inline-block">🚢</span>
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

	/* Sparkles twinkle animation */
	.animate-twinkle {
		display: inline-block;
		animation: twinkle 2s ease-in-out infinite;
	}

	@keyframes twinkle {
		0%,
		100% {
			opacity: 0.6;
		}
		50% {
			opacity: 1;
		}
	}

	/* Calendar rotate animation */
	.animate-subtle-rotate {
		display: inline-block;
		animation: subtleRotate 4s linear infinite;
		transform-origin: center center;
	}

	@keyframes subtleRotate {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}

	/* Chart slide animation */
	.animate-subtle-slide {
		display: inline-block;
		animation: subtleSlide 2s ease-in-out infinite;
	}

	@keyframes subtleSlide {
		0%,
		100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(-4px);
		}
	}

	/* Ship pulse animation */
	.animate-ship-pulse {
		display: inline-block;
		animation: shipPulse 2s ease-in-out infinite;
	}

	@keyframes shipPulse {
		0%,
		100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.15);
		}
	}

	/* Custom scrollbar for horizontal scroll */
	@media (max-width: 640px) {
		.overflow-x-auto::-webkit-scrollbar {
			height: 4px;
		}

		.overflow-x-auto::-webkit-scrollbar-track {
			background: rgba(156, 163, 175, 0.1);
			border-radius: 2px;
		}

		.overflow-x-auto::-webkit-scrollbar-thumb {
			background: rgba(156, 163, 175, 0.3);
			border-radius: 2px;
		}

		.overflow-x-auto::-webkit-scrollbar-thumb:hover {
			background: rgba(156, 163, 175, 0.5);
		}
	}
</style>
