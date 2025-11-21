<!-- Test page for PlanVisualization component -->
<script lang="ts">
	import PlanVisualization from '$lib/components/agent/PlanVisualization.svelte';
	import {
		samplePlan,
		samplePlanWithError,
		sampleSimplePlan
	} from '$lib/components/agent/PlanVisualization.test';

	let collapsedStates = $state({
		plan1: false,
		plan2: false,
		plan3: false
	});

	function toggleCollapse(planKey: 'plan1' | 'plan2' | 'plan3') {
		collapsedStates[planKey] = !collapsedStates[planKey];
	}
</script>

<div class="min-h-screen bg-slate-50 p-8 dark:bg-slate-900">
	<div class="mx-auto max-w-4xl space-y-8">
		<h1 class="text-3xl font-bold text-slate-900 dark:text-white">
			Plan Visualization Test Page
		</h1>

		<div class="space-y-6">
			<!-- Complex Plan with Dependencies -->
			<section>
				<h2 class="mb-3 text-xl font-semibold text-slate-800 dark:text-slate-200">
					Complex Multi-Step Plan (Executing)
				</h2>
				<PlanVisualization
					plan={samplePlan}
					currentStep={3}
					isCollapsed={collapsedStates.plan1}
					onToggle={() => toggleCollapse('plan1')}
				/>
			</section>

			<!-- Plan with Error -->
			<section>
				<h2 class="mb-3 text-xl font-semibold text-slate-800 dark:text-slate-200">
					Plan with Failed Step
				</h2>
				<PlanVisualization
					plan={samplePlanWithError}
					currentStep={3}
					isCollapsed={collapsedStates.plan2}
					onToggle={() => toggleCollapse('plan2')}
				/>
			</section>

			<!-- Simple Completed Plan -->
			<section>
				<h2 class="mb-3 text-xl font-semibold text-slate-800 dark:text-slate-200">
					Simple Single-Step Plan (Completed)
				</h2>
				<PlanVisualization
					plan={sampleSimplePlan}
					isCollapsed={collapsedStates.plan3}
					onToggle={() => toggleCollapse('plan3')}
				/>
			</section>
		</div>

		<!-- Test Controls -->
		<div
			class="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
		>
			<h3 class="mb-2 font-semibold text-slate-900 dark:text-white">Test Controls</h3>
			<div class="space-y-2 text-sm text-slate-600 dark:text-slate-400">
				<p>✅ Progress bar shows completion percentage</p>
				<p>✅ Metadata pills show tools, dependencies, executors</p>
				<p>✅ Steps show status icons (executing spins, completed checks)</p>
				<p>✅ Dependencies shown in orange connectors</p>
				<p>✅ Error states display with red highlighting</p>
				<p>✅ Collapsible sections work on click</p>
				<p>✅ Dark mode compatible</p>
			</div>
		</div>
	</div>
</div>
