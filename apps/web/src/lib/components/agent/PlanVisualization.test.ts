// apps/web/src/lib/components/agent/PlanVisualization.test.ts
import type { AgentPlan, AgentPlanStep } from '@buildos/shared-types';

// Sample test plan for visualization
export const samplePlan: AgentPlan = {
	id: 'test-plan-1',
	session_id: 'test-session',
	user_id: 'test-user',
	planner_agent_id: 'planner-1',
	user_message: 'Help me organize my project tasks',
	strategy: 'planner_stream',
	status: 'executing',
	created_at: new Date().toISOString(),
	updated_at: new Date().toISOString(),
	metadata: {
		estimatedDuration: 120000, // 2 minutes
		requiredTools: ['create_onto_task', 'update_onto_task', 'search_tasks'],
		executorCount: 2,
		notes: 'Multi-step plan with dependencies'
	},
	steps: [
		{
			stepNumber: 1,
			type: 'search_project',
			description: 'Search for existing project and tasks',
			executorRequired: true,
			tools: ['search_tasks', 'fetch_project_data'],
			status: 'completed',
			result: { success: true, projectId: 'proj-123', taskCount: 5 }
		},
		{
			stepNumber: 2,
			type: 'analyze',
			description: 'Analyze current project structure and identify gaps',
			executorRequired: false,
			tools: [],
			dependsOn: [1],
			status: 'completed',
			result: { success: true, message: 'Found 3 areas needing attention' }
		},
		{
			stepNumber: 3,
			type: 'create',
			description: 'Create new high-priority tasks for identified gaps',
			executorRequired: true,
			tools: ['create_onto_task'],
			dependsOn: [2],
			status: 'executing'
		},
		{
			stepNumber: 4,
			type: 'update',
			description: 'Update existing tasks with new priorities and dependencies',
			executorRequired: true,
			tools: ['update_onto_task'],
			dependsOn: [3],
			status: 'pending'
		},
		{
			stepNumber: 5,
			type: 'schedule',
			description: 'Schedule tasks on calendar based on priorities',
			executorRequired: true,
			tools: ['schedule_task', 'get_calendar_events'],
			dependsOn: [4],
			status: 'pending'
		}
	]
};

// Sample plan with error
const samplePlanWithErrorSteps: AgentPlanStep[] = samplePlan.steps.map((step) => {
	if (step.stepNumber === 3) {
		return {
			...step,
			status: 'failed',
			error: 'Failed to create task: Permission denied for project'
		};
	}

	if (step.stepNumber > 3) {
		return { ...step, status: 'pending' };
	}

	return step;
});

export const samplePlanWithError: AgentPlan = {
	...samplePlan,
	id: 'test-plan-2',
	steps: samplePlanWithErrorSteps
};

// Sample simple plan
export const sampleSimplePlan: AgentPlan = {
	id: 'test-plan-3',
	session_id: 'test-session',
	user_id: 'test-user',
	planner_agent_id: 'planner-1',
	user_message: 'Create a new task',
	strategy: 'planner_stream',
	status: 'completed',
	created_at: new Date().toISOString(),
	updated_at: new Date().toISOString(),
	steps: [
		{
			stepNumber: 1,
			type: 'create',
			description: 'Create a new task with the provided details',
			executorRequired: false,
			tools: ['create_onto_task'],
			status: 'completed',
			result: { success: true, taskId: 'task-456', name: 'Review documentation' }
		}
	]
};

// Test visualization states
export const visualizationTestCases = [
	{
		name: 'Complex plan with dependencies',
		plan: samplePlan,
		expectedFeatures: ['progress bar', 'dependencies', 'multiple tools', 'executors']
	},
	{
		name: 'Plan with error',
		plan: samplePlanWithError,
		expectedFeatures: ['error display', 'failed step highlighting']
	},
	{
		name: 'Simple single-step plan',
		plan: sampleSimplePlan,
		expectedFeatures: ['completed status', 'result display']
	}
];

console.log('Test plans created for PlanVisualization component');
console.log('Use these in a Svelte component to test the visualization:');
console.log('- samplePlan: Complex multi-step plan with dependencies');
console.log('- samplePlanWithError: Plan with a failed step');
console.log('- sampleSimplePlan: Simple single-step completed plan');
