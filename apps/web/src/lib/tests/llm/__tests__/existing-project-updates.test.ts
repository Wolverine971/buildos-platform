// src/lib/tests/llm/__tests__/existing-project-updates.test.ts
import { describe, it, expect } from 'vitest';
import { processExistingProject } from '../helpers/simple-runner';
import {
	validateBrainDumpResult,
	validateExistingProjectOperations,
	validateTaskOperation,
	validateRecurringTask
} from '../schemas/validators';
import type { ProjectWithRelations } from '$lib/types';

describe('Existing Project Update LLM Tests', () => {
	// Mock existing projects for testing
	const mockProjects = {
		ecommerce: {
			id: 'proj-ecom-123',
			name: 'E-commerce Platform',
			context:
				'## Original Context\nBuilding a general e-commerce solution for small businesses.',
			status: 'active',
			tags: ['ecommerce', 'platform'],
			tasks: []
		} as Partial<ProjectWithRelations>,

		mobile: {
			id: 'proj-mobile-456',
			name: 'Mobile App',
			status: 'active',
			tasks: [
				{
					id: 'task-001',
					title: 'Setup React Native project',
					status: 'done',
					priority: 'high'
				}
			]
		} as Partial<ProjectWithRelations>,

		saas: {
			id: 'proj-saas-789',
			name: 'SaaS Platform',
			context: '## Platform Overview\nBuilding a comprehensive SaaS solution.',
			executive_summary: 'A next-generation platform for teams.',
			status: 'active',
			tasks: []
		} as Partial<ProjectWithRelations>
	};

	describe('Context Updates', () => {
		it('should update project context with strategic pivot', async () => {
			const existingProject = mockProjects.ecommerce;

			const result = await processExistingProject(
				`
        We've made a significant strategic decision about our e-commerce platform.

        After extensive user research and market analysis, we're pivoting from 
        a general e-commerce solution to focus specifically on the handmade and 
        artisan goods market.

        Key insights from our research:
        - Handmade sellers struggle with existing platforms due to high fees
        - There's a 40% annual growth in the handmade goods market
        - Artisans need better tools for inventory management
        - Premium pricing is justified for specialized features

        Updated target market:
        - Individual artisans and small craft businesses
        - Annual revenue between $10K-$500K
        - Need for custom product pages and storytelling capabilities
        - Value authenticity and direct customer relationships

        This pivot doesn't change our core technical architecture but will 
        influence our feature prioritization and go-to-market strategy.
      `,
				existingProject.id!,
				existingProject
			);

			validateBrainDumpResult(result);

			// Should have project update operation
			const updateOp = result.operations.find(
				(op) => op.table === 'projects' && op.operation === 'update'
			);

			expect(updateOp).toBeDefined();
			expect(updateOp?.data.id).toBe(existingProject.id);

			// Context should include new strategic information
			if (updateOp?.data.context) {
				expect(updateOp.data.context.toLowerCase()).toMatch(/pivot|handmade|artisan/);
				// Should preserve original context
				expect(updateOp.data.context).toContain('Original Context');
			}
		});

		it('should update with technical architecture decisions', async () => {
			const existingProject = mockProjects.saas;

			const result = await processExistingProject(
				`
        Important technical architecture update for our SaaS platform:

        We've decided to migrate from REST API to GraphQL for our backend.

        Reasons for the change:
        - Better performance with reduced over-fetching
        - Strongly typed schema improves developer experience
        - Single endpoint simplifies client implementation
        - Real-time subscriptions support built-in

        Migration plan:
        - Phase 1: Set up Apollo Server alongside existing REST
        - Phase 2: Migrate core endpoints to GraphQL
        - Phase 3: Add subscriptions for real-time features
        - Phase 4: Deprecate REST endpoints

        This is a major architectural change that will affect all frontend 
        development going forward.
      `,
				existingProject.id!,
				existingProject
			);

			const updateOp = result.operations.find(
				(op) => op.table === 'projects' && op.operation === 'update'
			);

			expect(updateOp).toBeDefined();
			if (updateOp?.data.context) {
				expect(updateOp.data.context.toLowerCase()).toMatch(/graphql|apollo|api/);
			}
		});
	});

	describe('Task Creation for Existing Projects', () => {
		it('should create bug fix tasks with priorities', async () => {
			const existingProject = mockProjects.mobile;

			const result = await processExistingProject(
				`
        Found several critical bugs during QA testing that need immediate attention:

        1. User authentication tokens are expiring randomly on mobile devices
           - Investigate JWT refresh mechanism
           - Check for timezone-related issues
           - Implement better error handling for token expiration
           - Priority: High, blocks mobile release

        2. Payment processing fails for international credit cards
           - Debug Stripe integration for non-US cards
           - Add proper error messages for failed payments
           - Test with various international card types
           - Priority: High, affecting 25% of transactions

        3. Search functionality returns inconsistent results
           - Query performance is slow for large datasets
           - Some recent content not appearing in results
           - Special characters causing search crashes
           - Priority: Medium, user experience issue

        These issues are blocking our scheduled release next week.
      `,
				existingProject.id!,
				existingProject
			);

			validateBrainDumpResult(result);

			// Should create multiple task operations
			const taskOps = result.operations.filter(
				(op) => op.table === 'tasks' && op.operation === 'create'
			);

			expect(taskOps.length).toBeGreaterThanOrEqual(3);

			taskOps.forEach((task) => {
				validateTaskOperation(task);
				expect(task.data.project_id).toBe(existingProject.id);
				expect(['low', 'medium', 'high']).toContain(task.data.priority);
			});

			// Should have bug-related content
			const taskContent = JSON.stringify(taskOps).toLowerCase();
			expect(taskContent).toMatch(/authentication|payment|search/);
		});

		it('should create feature request tasks', async () => {
			const existingProject = mockProjects.saas;

			const result = await processExistingProject(
				`
        Based on customer feedback, we need to add these features:

        1. Advanced user permissions system
           - Role-based access control (RBAC)
           - Custom permission sets
           - Audit logging for permission changes
           - Estimated: 2 weeks

        2. Data export functionality
           - Export to CSV, Excel, PDF formats
           - Scheduled automatic exports
           - API for programmatic access
           - Estimated: 1 week

        3. Dashboard customization
           - Drag-and-drop widget arrangement
           - Custom metrics and KPIs
           - Saved dashboard templates
           - Estimated: 3 weeks

        These features have been requested by multiple enterprise customers.
      `,
				existingProject.id!,
				existingProject
			);

			const taskOps = result.operations.filter(
				(op) => op.table === 'tasks' && op.operation === 'create'
			);

			expect(taskOps.length).toBeGreaterThanOrEqual(3);

			// Verify project association
			taskOps.forEach((task) => {
				expect(task.data.project_id).toBe(existingProject.id);
			});

			// Check for feature content
			const taskContent = JSON.stringify(taskOps).toLowerCase();
			expect(taskContent).toMatch(/permission|export|dashboard/);
		});
	});

	describe('Recurring Task Creation', () => {
		it('should create recurring maintenance tasks', async () => {
			const existingProject = mockProjects.saas;

			const result = await processExistingProject(
				`
        Set up recurring maintenance tasks for the platform:
        
        - Database backup and optimization (weekly on Sundays)
        - Security vulnerability scanning (daily at midnight)
        - Performance monitoring review (monthly on the 1st)
        - Customer success check-ins (quarterly)
        - Log rotation and cleanup (daily)
        
        These tasks should be automated where possible and tracked in our system.
      `,
				existingProject.id!,
				existingProject
			);

			const recurringTasks = result.operations.filter(
				(op) => op.table === 'tasks' && op.data.task_type === 'recurring'
			);

			expect(recurringTasks.length).toBeGreaterThan(0);

			recurringTasks.forEach((task) => {
				validateRecurringTask(task);
				expect(task.data.project_id).toBe(existingProject.id);
			});

			// Check for various recurrence patterns
			const patterns = recurringTasks.map((t) => t.data.recurrence_pattern);
			const hasWeekly = patterns.some((p) => p === 'weekly');
			const hasDaily = patterns.some((p) => p === 'daily' || p === 'weekdays');
			const hasMonthly = patterns.some((p) => p === 'monthly');

			expect(hasWeekly || hasDaily || hasMonthly).toBe(true);
		});

		it('should create content creation recurring tasks', async () => {
			const existingProject = mockProjects.ecommerce;

			const result = await processExistingProject(
				`
        Need to set up regular content creation tasks:
        
        - Write weekly blog post about featured artisans (every Monday)
        - Send monthly newsletter to customers (1st of each month)
        - Update social media daily with product highlights
        - Quarterly market research report
        - Bi-weekly email campaign to inactive users
      `,
				existingProject.id!,
				existingProject
			);

			const recurringTasks = result.operations.filter(
				(op) => op.table === 'tasks' && op.data.task_type === 'recurring'
			);

			expect(recurringTasks.length).toBeGreaterThan(0);

			// Check for content-related tasks
			const taskTitles = recurringTasks.map((t) => t.data.title.toLowerCase()).join(' ');
			expect(taskTitles).toMatch(/blog|newsletter|social|email|content/);
		});
	});

	describe('Task Updates', () => {
		it('should handle brain dumps with only new tasks', async () => {
			const existingProject = mockProjects.mobile;

			const result = await processExistingProject(
				`
        Quick tasks that need to be done this week:
        
        1. Fix the broken unit tests in the authentication module
        2. Update the API documentation for the new endpoints
        3. Deploy the hotfix for the memory leak issue
        4. Review and merge the pending pull requests
      `,
				existingProject.id!,
				existingProject
			);

			// Should only create tasks, no project updates
			const projectOps = result.operations.filter((op) => op.table === 'projects');
			expect(projectOps.length).toBe(0);

			const taskOps = result.operations.filter((op) => op.table === 'tasks');
			expect(taskOps.length).toBe(4);

			taskOps.forEach((task) => {
				expect(task.operation).toBe('create');
				expect(task.data.project_id).toBe(existingProject.id);
			});
		});

		it('should handle context-only updates without tasks', async () => {
			const existingProject = mockProjects.ecommerce;

			const result = await processExistingProject(
				`
        Important strategic update: We've secured Series A funding of $5M.
        
        This changes our growth trajectory significantly and allows us to:
        - Hire 10 additional engineers
        - Expand to European markets
        - Invest heavily in AI/ML capabilities
        - Build out enterprise features
        
        Timeline has been accelerated - we now need to hit 1M ARR by end of year.
      `,
				existingProject.id!,
				existingProject
			);

			// Should primarily be a context update
			const projectOps = result.operations.filter(
				(op) => op.table === 'projects' && op.operation === 'update'
			);
			expect(projectOps.length).toBeGreaterThan(0);

			const updateOp = projectOps[0];
			if (updateOp.data.context) {
				expect(updateOp.data.context.toLowerCase()).toMatch(/funding|series a|growth/);
			}
		});
	});

	describe('Mixed Updates', () => {
		it('should handle both context updates and new tasks', async () => {
			const existingProject = mockProjects.saas;

			const result = await processExistingProject(
				`
        Platform update and new priorities:
        
        Strategic change: We're shifting to a product-led growth strategy.
        This means focusing on self-service onboarding and viral features.
        
        New tasks based on this strategy:
        - Redesign onboarding flow for self-service
        - Implement in-app referral system
        - Create interactive product tour
        - Add usage-based upgrade prompts
        - Build public template gallery
        
        This represents a fundamental shift in how we acquire customers.
      `,
				existingProject.id!,
				existingProject
			);

			// Should have both project update and new tasks
			const projectOps = result.operations.filter(
				(op) => op.table === 'projects' && op.operation === 'update'
			);
			const taskOps = result.operations.filter(
				(op) => op.table === 'tasks' && op.operation === 'create'
			);

			expect(projectOps.length).toBeGreaterThan(0);
			expect(taskOps.length).toBeGreaterThan(3);

			// Context should reflect strategic change
			if (projectOps[0]?.data.context) {
				expect(projectOps[0].data.context.toLowerCase()).toMatch(
					/product-led|growth|strategy/
				);
			}

			// Tasks should align with new strategy
			const taskContent = JSON.stringify(taskOps).toLowerCase();
			expect(taskContent).toMatch(/onboarding|referral|tour|template/);
		});
	});

	describe('Edge Cases', () => {
		it('should handle updates for projects without existing context', async () => {
			const minimalProject = {
				id: 'proj-minimal-999',
				name: 'Minimal Project',
				status: 'active'
			} as Partial<ProjectWithRelations>;

			const result = await processExistingProject(
				`
        Adding initial context to the project:
        
        This project is for building an internal tool for our sales team.
        It should help them track leads and manage customer relationships.
        
        Key requirements:
        - Simple and intuitive interface
        - Integration with our existing CRM
        - Mobile-friendly design
        - Real-time updates
      `,
				minimalProject.id!,
				minimalProject
			);

			const updateOp = result.operations.find(
				(op) => op.table === 'projects' && op.operation === 'update'
			);

			expect(updateOp).toBeDefined();
			if (updateOp?.data.context) {
				expect(updateOp.data.context.toLowerCase()).toMatch(/sales|crm|tool/);
			}
		});

		it('should properly reference existing project in all operations', async () => {
			const existingProject = mockProjects.mobile;

			const result = await processExistingProject(
				`
        Add these features to the mobile app:
        - Push notifications
        - Offline mode
        - Dark theme support
      `,
				existingProject.id!,
				existingProject
			);

			validateExistingProjectOperations(result.operations, existingProject.id!);

			// All task creates should have project_id
			const taskOps = result.operations.filter(
				(op) => op.table === 'tasks' && op.operation === 'create'
			);

			taskOps.forEach((task) => {
				expect(task.data.project_id).toBe(existingProject.id);
				expect(task.data.project_ref).toBeUndefined();
			});
		});
	});
});
