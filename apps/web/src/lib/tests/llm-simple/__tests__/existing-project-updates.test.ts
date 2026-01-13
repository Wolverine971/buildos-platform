// apps/web/src/lib/tests/llm-simple/__tests__/existing-project-updates.test.ts

import { describe, it, expect } from 'vitest';
import { processExistingProject } from '../helpers/simple-llm-runner';
import {
	validateBrainDumpResult,
	validateExistingProjectUpdate,
	validateRecurringTask
} from '../schemas/loose-validation';
// No need to import supabase - handled in helper

/**
 * Simplified Existing Project Update Tests
 *
 * Tests focus on updating existing projects with new context, tasks, and recurring tasks.
 * Brain dumps are inline and validation is flexible.
 */
describe('Existing Project Updates - Simplified', () => {
	// Test project ID for existing project scenarios
	const TEST_PROJECT_ID = 'existing-project-123';

	describe('Context Updates', () => {
		it('updates project with new strategic information', async () => {
			const result = await processExistingProject(
				`
        Project update: We've decided to pivot our e-commerce platform to focus 
        specifically on sustainable and eco-friendly products based on market research.
        
        New strategic direction:
        - Partner with certified sustainable brands only
        - Add carbon footprint tracking for all products
        - Implement sustainability scoring system
        - Create educational content about eco-friendly shopping
        
        This pivot should help us differentiate in a crowded market and attract 
        environmentally conscious consumers.
      `,
				TEST_PROJECT_ID
			);

			validateBrainDumpResult(result);
			validateExistingProjectUpdate(result.operations, TEST_PROJECT_ID);

			// Should have project update operation
			const projectUpdate = result.operations.find(
				(op) => op.table === 'projects' && op.operation === 'update'
			);
			expect(projectUpdate).toBeTruthy();
			expect(projectUpdate.data.context).toContain('sustainable');
		});

		it('incorporates technical architecture updates', async () => {
			const result = await processExistingProject(
				`
        Technical update: After reviewing performance issues, we're making 
        these architecture changes to our mobile app:

        ## Infrastructure Changes
        - Migrate from REST API to GraphQL for better data fetching
        - Implement Redis caching for frequently accessed data
        - Switch from SQLite to PostgreSQL for better concurrency
        - Add CDN for static assets to improve load times

        ## Code Architecture  
        - Refactor state management from Context to Redux Toolkit
        - Implement micro-frontends architecture for better team collaboration
        - Add comprehensive error boundaries and logging
        - Set up automated performance monitoring

        These changes should reduce loading times by 60% and improve scalability.
      `,
				TEST_PROJECT_ID
			);

			validateBrainDumpResult(result);

			const projectUpdate = result.operations.find(
				(op) => op.table === 'projects' && op.operation === 'update'
			);
			expect(projectUpdate).toBeTruthy();

			const context = projectUpdate.data.context.toLowerCase();
			expect(context).toMatch(/graphql|redis|architecture|performance/);
		});

		it('handles market feedback integration', async () => {
			const result = await processExistingProject(
				`
        Market feedback integration: Based on user interviews and analytics, 
        we're updating our SaaS platform strategy.

        Key findings from 50 user interviews:
        - Users want simpler onboarding (current is too complex)
        - Need better mobile experience (60% of usage is mobile)
        - Want more integrations with existing tools
        - Pricing is acceptable but features need clearer tiers

        Immediate changes:
        - Redesign onboarding flow to 3 steps instead of 8
        - Prioritize mobile-first responsive design
        - Add Slack, Discord, and Zapier integrations
        - Create feature comparison table for pricing page

        Target metrics: Reduce time-to-value from 2 weeks to 2 days.
      `,
				TEST_PROJECT_ID
			);

			validateBrainDumpResult(result);
			validateExistingProjectUpdate(result.operations);

			// Should create both context updates and new tasks
			const hasProjectUpdate = result.operations.some(
				(op) => op.table === 'projects' && op.operation === 'update'
			);
			const hasNewTasks = result.operations.some(
				(op) => op.table === 'tasks' && op.operation === 'create'
			);

			expect(hasProjectUpdate || hasNewTasks).toBe(true);
		});
	});

	describe('Task Creation for Existing Projects', () => {
		it('creates bug fix tasks with priorities', async () => {
			const result = await processExistingProject(
				`
        Found several critical bugs that need immediate attention:

        1. Payment processing fails for international cards (CRITICAL)
        2. User session expires too quickly causing data loss (HIGH)  
        3. Search results show duplicate products (MEDIUM)
        4. Email notifications have broken formatting (LOW)

        These are blocking our European launch planned for next month.
      `,
				TEST_PROJECT_ID
			);

			validateBrainDumpResult(result);

			const taskOps = result.operations.filter((op) => op.table === 'tasks');
			expect(taskOps.length).toBeGreaterThanOrEqual(3);

			// Should mention bug fixes
			const taskTitles = taskOps.map((t) => t.data.title.toLowerCase()).join(' ');
			expect(taskTitles).toMatch(/bug|fix|payment|session|search|email/);

			// Some tasks should have priority set
			const hasPriorities = taskOps.some(
				(t) => t.data.priority && ['low', 'medium', 'high'].includes(t.data.priority)
			);
			expect(hasPriorities).toBe(true);
		});

		it('creates feature request tasks', async () => {
			const result = await processExistingProject(
				`
        Based on user feedback, we need to add these features to the dashboard:

        - Dark mode toggle (highly requested)
        - Bulk actions for task management  
        - Export functionality for reports
        - Keyboard shortcuts for power users
        - Drag and drop file uploads

        These features should improve user satisfaction and reduce churn.
      `,
				TEST_PROJECT_ID
			);

			validateBrainDumpResult(result);

			const taskOps = result.operations.filter((op) => op.table === 'tasks');
			expect(taskOps.length).toBeGreaterThanOrEqual(3);

			const allContent = taskOps
				.map((t) => `${t.data.title} ${t.data.description || ''} ${t.data.details || ''}`)
				.join(' ')
				.toLowerCase();

			expect(allContent).toMatch(/dark mode|bulk|export|keyboard|drag/);
		});

		it('creates performance optimization tasks', async () => {
			const result = await processExistingProject(
				`
        Performance audit revealed several optimization opportunities:

        Database queries:
        - Add indexes on frequently queried columns
        - Optimize slow queries identified in monitoring
        - Implement query result caching

        Frontend optimization:
        - Enable lazy loading for images and components
        - Bundle size reduction through code splitting  
        - Implement service worker for offline caching

        Target: Reduce page load time from 3.2s to under 1.5s.
      `,
				TEST_PROJECT_ID
			);

			validateBrainDumpResult(result);

			const taskOps = result.operations.filter((op) => op.table === 'tasks');
			expect(taskOps.length).toBeGreaterThanOrEqual(2);

			const allContent = taskOps
				.map((t) => `${t.data.title} ${t.data.description || ''} ${t.data.details || ''}`)
				.join(' ')
				.toLowerCase();

			expect(allContent).toMatch(/database|index|cache|lazy|bundle|performance/);
		});
	});

	describe('Recurring Task Creation', () => {
		it('creates maintenance recurring tasks', async () => {
			const result = await processExistingProject(
				`
        Set up regular maintenance tasks to keep the system running smoothly:

        - Weekly database backups every Sunday at 2 AM
        - Daily log cleanup at midnight  
        - Monthly security updates on the first Saturday
        - Quarterly performance reviews and optimization
        - Annual SSL certificate renewal

        These maintenance tasks are critical for system reliability.
      `,
				TEST_PROJECT_ID
			);

			validateBrainDumpResult(result);
			validateRecurringTask(result.operations);

			const recurringTasks = result.operations.filter(
				(op) => op.table === 'tasks' && op.data.task_type === 'recurring'
			);

			// Should have multiple recurring tasks
			expect(recurringTasks.length).toBeGreaterThanOrEqual(3);

			// Should have different recurrence patterns
			const patterns = recurringTasks.map((t) => t.data.recurrence_pattern);
			expect(patterns).toContain('weekly');
			expect(patterns).toContain('daily');
			expect(patterns).toContain('monthly');
		});

		it('creates content creation recurring tasks', async () => {
			const result = await processExistingProject(
				`
        Need to establish regular content creation schedule for our blog:

        - Daily social media posts (LinkedIn, Twitter)
        - Weekly blog articles about industry trends
        - Monthly newsletter to subscribers
        - Biweekly video tutorials for YouTube channel

        This content strategy should help with SEO and user engagement.
      `,
				TEST_PROJECT_ID
			);

			validateBrainDumpResult(result);
			validateRecurringTask(result.operations);

			const recurringTasks = result.operations.filter(
				(op) => op.table === 'tasks' && op.data.task_type === 'recurring'
			);

			expect(recurringTasks.length).toBeGreaterThanOrEqual(2);

			const allContent = recurringTasks
				.map((t) => `${t.data.title} ${t.data.description || ''} ${t.data.details || ''}`)
				.join(' ')
				.toLowerCase();

			expect(allContent).toMatch(/social|blog|newsletter|video|content/);
		});

		it('creates team operations recurring tasks', async () => {
			const result = await processExistingProject(
				`
        Establish regular team operations and meeting schedule:

        - Daily standup meetings at 9 AM (weekdays only)
        - Weekly sprint planning every Monday  
        - Biweekly retrospectives on alternate Fridays
        - Monthly all-hands team meeting
        - Quarterly goal setting and review sessions

        These meetings should improve team communication and productivity.
      `,
				TEST_PROJECT_ID
			);

			validateBrainDumpResult(result);
			validateRecurringTask(result.operations);

			const recurringTasks = result.operations.filter(
				(op) => op.table === 'tasks' && op.data.task_type === 'recurring'
			);

			expect(recurringTasks.length).toBeGreaterThanOrEqual(3);

			// Check for different patterns
			const patterns = recurringTasks.map((t) => t.data.recurrence_pattern);
			const hasWeekdays = patterns.includes('weekdays');
			const hasWeekly = patterns.includes('weekly');
			const hasBiweekly = patterns.includes('biweekly');

			expect(hasWeekdays || hasWeekly || hasBiweekly).toBe(true);
		});
	});

	describe('Task Updates', () => {
		it('updates existing tasks when referenced', async () => {
			const result = await processExistingProject(
				`
        Update on the user authentication system task:

        The OAuth integration is more complex than expected. Need to:
        - Add support for multiple OAuth providers (Google, GitHub, LinkedIn)
        - Implement proper error handling for failed authentications  
        - Add rate limiting to prevent brute force attacks
        - Create comprehensive test suite for auth flows

        This will extend the timeline by 1 week but provide better security.
      `,
				TEST_PROJECT_ID
			);

			validateBrainDumpResult(result);

			// Could either update existing task or create new ones
			const hasTaskUpdate = result.operations.some(
				(op) => op.table === 'tasks' && op.operation === 'update'
			);
			const hasNewTasks = result.operations.some(
				(op) => op.table === 'tasks' && op.operation === 'create'
			);

			expect(hasTaskUpdate || hasNewTasks).toBe(true);

			// Should mention authentication somewhere
			const allContent = result.operations
				.map(
					(op) =>
						`${op.data.title || ''} ${op.data.description || ''} ${op.data.details || ''}`
				)
				.join(' ')
				.toLowerCase();

			expect(allContent).toMatch(/auth|oauth|security|login/);
		});
	});

	describe('Edge Cases and Validation', () => {
		it('handles context-only updates without new tasks', async () => {
			const result = await processExistingProject(
				`
        Strategic update: After competitor analysis, we've confirmed our 
        product differentiation strategy is on the right track.

        Key insights:
        - Our AI-powered features are 6 months ahead of competitors
        - Pricing is competitive in the mid-market segment
        - Customer satisfaction scores are higher than industry average

        No immediate action items, just updating project context with this analysis.
      `,
				TEST_PROJECT_ID
			);

			validateBrainDumpResult(result);

			// Should have project update but might not have new tasks
			const projectUpdate = result.operations.find(
				(op) => op.table === 'projects' && op.operation === 'update'
			);
			expect(projectUpdate).toBeTruthy();

			const context = projectUpdate.data.context.toLowerCase();
			expect(context).toMatch(/strategic|competitor|analysis|ai/);
		});

		it('handles task-only updates without context changes', async () => {
			const result = await processExistingProject(
				`
        Quick tasks needed for this week:

        - Fix the broken link in footer
        - Update the pricing page with new plans
        - Add loading spinner to slow API calls
        - Respond to customer support tickets

        These are small but important improvements.
      `,
				TEST_PROJECT_ID
			);

			validateBrainDumpResult(result);

			const taskOps = result.operations.filter((op) => op.table === 'tasks');
			expect(taskOps.length).toBeGreaterThanOrEqual(3);

			// Might not have project context update for task-only updates
			taskOps.forEach((task) => {
				expect(task.data.title).toBeTruthy();
				expect(task.data.project_id || task.data.project_ref).toBeTruthy();
			});
		});

		it('properly references existing project in all new tasks', async () => {
			const result = await processExistingProject(
				`
        Add these features to the dashboard:
        - Real-time notifications
        - Advanced filtering options
        - Export to PDF functionality
      `,
				TEST_PROJECT_ID
			);

			validateBrainDumpResult(result);

			const newTasks = result.operations.filter(
				(op) => op.table === 'tasks' && op.operation === 'create'
			);

			// All new tasks should reference the project
			newTasks.forEach((task) => {
				const hasProjectRef =
					task.data.project_id === TEST_PROJECT_ID ||
					task.data.project_ref ||
					task.data.project_id;
				expect(hasProjectRef).toBeTruthy();
			});
		});
	});
});
