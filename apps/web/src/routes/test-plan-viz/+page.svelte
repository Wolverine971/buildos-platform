<!-- apps/web/src/routes/test-plan-viz/+page.svelte -->
<script lang="ts">
	import PlanVisualization from '$lib/components/agent/PlanVisualization.svelte';
	import type { AgentPlan } from '@buildos/shared-types';

	const now = new Date().toISOString();
	const basePlanFields = {
		session_id: 'test-session-id',
		user_id: 'test-user-id',
		planner_agent_id: 'test-planner-id',
		strategy: 'planner_stream' as const,
		created_at: now,
		updated_at: now
	};

	const samplePlan = {
		...basePlanFields,
		id: 'test-plan-complex',
		user_message: 'Create and schedule project kickoff tasks',
		status: 'executing' as const,
		metadata: {
			estimatedDuration: 420000,
			requiredTools: ['search_tasks', 'create_onto_task', 'schedule_task'],
			executorCount: 1
		},
		steps: [
			{
				stepNumber: 1,
				type: 'search_project',
				description: 'Find existing project tasks and deadlines',
				executorRequired: false,
				tools: ['search_tasks'],
				status: 'completed' as const,
				result: { success: true, message: 'Found 4 related tasks' }
			},
			{
				stepNumber: 2,
				type: 'create_tasks',
				description: 'Create kickoff checklist tasks',
				executorRequired: true,
				tools: ['create_onto_task'],
				dependsOn: [1],
				status: 'completed' as const,
				result: { id: 'task_123', name: 'Kickoff checklist created' }
			},
			{
				stepNumber: 3,
				type: 'schedule_tasks',
				description: 'Schedule kickoff tasks on project calendar',
				executorRequired: true,
				tools: ['schedule_task', 'set_project_calendar'],
				dependsOn: [2],
				status: 'executing' as const
			},
			{
				stepNumber: 4,
				type: 'notify_team',
				description: 'Prepare team notification draft',
				executorRequired: false,
				tools: ['fetch_project_data'],
				dependsOn: [3],
				status: 'pending' as const
			}
		]
	} satisfies AgentPlan;

	const samplePlanWithError = {
		...basePlanFields,
		id: 'test-plan-error',
		user_message: 'Schedule onboarding sequence',
		status: 'failed' as const,
		metadata: {
			estimatedDuration: 180000,
			actualDuration: 120000
		},
		steps: [
			{
				stepNumber: 1,
				type: 'search_project',
				description: 'Locate onboarding task template',
				executorRequired: false,
				tools: ['search_tasks'],
				status: 'completed' as const,
				result: { success: true }
			},
			{
				stepNumber: 2,
				type: 'create_tasks',
				description: 'Generate onboarding tasks from template',
				executorRequired: true,
				tools: ['create_onto_task'],
				dependsOn: [1],
				status: 'completed' as const,
				result: { success: true, message: 'Created 6 tasks' }
			},
			{
				stepNumber: 3,
				type: 'schedule_tasks',
				description: 'Schedule tasks based on team availability',
				executorRequired: true,
				tools: ['get_calendar_events', 'schedule_task'],
				dependsOn: [2],
				status: 'failed' as const,
				error: 'Calendar API rate limit reached while scheduling the final task'
			}
		]
	} satisfies AgentPlan;

	const sampleSimplePlan = {
		...basePlanFields,
		id: 'test-plan-simple',
		user_message: 'Create a single follow-up reminder',
		status: 'completed' as const,
		metadata: {
			estimatedDuration: 30000,
			actualDuration: 12000
		},
		steps: [
			{
				stepNumber: 1,
				type: 'create_task',
				description: 'Create reminder task for follow-up',
				executorRequired: false,
				tools: ['create_onto_task'],
				status: 'completed' as const,
				result: { id: 'task_789', name: 'Follow-up reminder' }
			}
		]
	} satisfies AgentPlan;

	let collapsedStates = $state({
		plan1: false,
		plan2: false,
		plan3: false
	});

	function toggleCollapse(planKey: 'plan1' | 'plan2' | 'plan3') {
		collapsedStates[planKey] = !collapsedStates[planKey];
	}
</script>

<!-- apps/web/src/routes/test-plan-viz/+page.svelte -->
<svelte:head>
	<meta name="robots" content="noindex, nofollow" />
	<title>Plan Visualization Test - BuildOS (Internal)</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 p-8">
	<div class="mx-auto max-w-4xl space-y-8">
		<h1 class="text-3xl font-bold text-foreground">Plan Visualization Test Page</h1>

		<div class="space-y-6">
			<!-- Complex Plan with Dependencies -->
			<section>
				<h2 class="mb-3 text-xl font-semibold text-foreground">
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
				<h2 class="mb-3 text-xl font-semibold text-foreground">Plan with Failed Step</h2>
				<PlanVisualization
					plan={samplePlanWithError}
					currentStep={3}
					isCollapsed={collapsedStates.plan2}
					onToggle={() => toggleCollapse('plan2')}
				/>
			</section>

			<!-- Simple Completed Plan -->
			<section>
				<h2 class="mb-3 text-xl font-semibold text-foreground">
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
		<div class="rounded-lg border border-border bg-card p-4">
			<h3 class="mb-2 font-semibold text-foreground">Test Controls</h3>
			<div class="space-y-2 text-sm text-muted-foreground">
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
