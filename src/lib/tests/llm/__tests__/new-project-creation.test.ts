// src/lib/tests/llm/__tests__/new-project-creation.test.ts
import { describe, it, expect } from 'vitest';
import { processNewProject } from '../helpers/simple-runner';
import {
	validateSmallProject,
	validateLargeProject,
	validateSingleTaskCreation,
	validateMultiTaskCreation,
	validateProjectOperation,
	validateTaskOperation
} from '../schemas/validators';

describe('New Project Creation LLM Tests', () => {
	describe('Small Projects (2-4 tasks)', () => {
		it('should create blog project with basic tasks', async () => {
			const result = await processNewProject(`
        I want to create a personal blog using SvelteKit. The blog should have:
        - A homepage with recent posts
        - Individual post pages  
        - An about page
        - RSS feed generation

        The design should be clean and minimal, focusing on readability.
        I'll use markdown files for content and deploy on Vercel.
      `);

			validateSmallProject(result);

			const projectOp = result.operations[0];
			expect(projectOp.data.name.toLowerCase()).toContain('blog');

			const taskOps = result.operations.slice(1);
			expect(taskOps.length).toBeGreaterThanOrEqual(2);
			expect(taskOps.length).toBeLessThanOrEqual(4);
		});

		it('should create todo app project', async () => {
			const result = await processNewProject(`
        Build a simple todo application with the following features:
        - Add new tasks
        - Mark tasks as complete
        - Delete tasks
        - Filter by status (all, active, completed)

        Technology stack: React with local storage for persistence.
        Keep the UI minimal and responsive.
      `);

			validateSmallProject(result);

			const projectOp = result.operations[0];
			expect(projectOp.data.name.toLowerCase()).toMatch(/todo|task/);

			// Verify task creation
			const taskOps = result.operations.filter((op) => op.table === 'tasks');
			expect(taskOps.length).toBeGreaterThan(0);
		});

		it('should create weather app project', async () => {
			const result = await processNewProject(`
        Create a weather app that shows current conditions for a user's location.

        Core features needed:
        - Get user's location automatically
        - Display current temperature and conditions
        - Show 3-day forecast
        - Clean, mobile-friendly design

        Use a weather API like OpenWeatherMap and build with vanilla JavaScript.
      `);

			validateSmallProject(result);

			const projectOp = result.operations[0];
			expect(projectOp.data.name.toLowerCase()).toContain('weather');

			// Check for relevant content in tasks or context
			const allContent = JSON.stringify(result.operations).toLowerCase();
			expect(allContent).toMatch(/api|location|forecast|weather/);
		});
	});

	describe('Large Projects (8+ tasks)', () => {
		it('should create comprehensive e-commerce platform', async () => {
			const result = await processNewProject(`
        I'm planning to build a comprehensive e-commerce platform for small businesses.

        ## Core Features
        - User authentication and authorization
        - Product catalog with categories and search
        - Shopping cart and checkout process
        - Payment integration (Stripe, PayPal)
        - Order management system
        - Inventory tracking
        - Customer dashboard
        - Admin dashboard

        ## Technical Requirements
        - Built with React/Next.js
        - PostgreSQL database
        - Redis for caching
        - AWS deployment
        - CI/CD pipeline
        - Monitoring and analytics

        ## Business Context
        The target market is small to medium businesses who need an affordable, 
        feature-rich online store. Key differentiators:
        - Easy setup and customization
        - Built-in marketing tools
        - Mobile-first design
        - Excellent customer support

        ## Timeline
        - MVP in 3 months
        - Beta testing for 1 month
        - Production launch in 6 months

        ## Success Metrics
        - 100 businesses onboarded in first 6 months
        - 95% uptime
        - Sub-2 second page load times
        - Customer satisfaction score > 4.5/5
      `);

			validateLargeProject(result);

			const projectOp = result.operations[0];
			expect(projectOp.data.name.toLowerCase()).toMatch(/ecommerce|e-commerce|platform/);

			// Should have tasks covering different features
			const taskOps = result.operations.filter((op) => op.table === 'tasks');
			const taskTitles = taskOps.map((t) => t.data.title.toLowerCase()).join(' ');

			// Check for key feature coverage
			expect(taskTitles).toMatch(/auth|user|account/);
			expect(taskTitles).toMatch(/product|catalog|inventory/);
			expect(taskTitles).toMatch(/payment|checkout|cart/);
		});

		it('should create SaaS platform project', async () => {
			const result = await processNewProject(`
        # SaaS Project Management Platform Development

        I want to build a comprehensive SaaS project management platform.

        ## Vision Statement
        Create an intuitive project management platform that adapts to any team's workflow.

        ## Core Platform Features
        ### Project Organization
        - Hierarchical project structure (Portfolios > Projects > Tasks > Subtasks)
        - Multiple project views (Kanban, Gantt, Calendar, Table, Timeline)
        - Custom project templates and workflows
        - Project dependencies and critical path analysis

        ### Team Collaboration
        - Real-time collaborative editing
        - Comment threads and mentions
        - File sharing and version control
        - Video call integration
        - Activity feeds and notifications

        ### Task Management
        - Advanced task creation with rich text
        - Custom fields and task types
        - Automated task assignments
        - Recurring task templates
        - Task dependencies

        ## Technical Architecture
        ### Frontend
        - React with TypeScript
        - Redux Toolkit for state management
        - Material-UI component library

        ### Backend
        - Node.js with Express
        - GraphQL API
        - PostgreSQL database
        - Redis for caching

        ## Business Model
        - Free tier: Up to 5 users
        - Starter: $10/user/month
        - Professional: $20/user/month
        - Enterprise: Custom pricing
      `);

			validateLargeProject(result);

			const projectOp = result.operations[0];
			expect(projectOp.data.name.toLowerCase()).toMatch(/saas|platform|project/);
			expect(projectOp.data.context).toContain('##');
			expect(projectOp.data.executive_summary).toBeDefined();

			// Should have diverse task types
			const taskOps = result.operations.filter((op) => op.table === 'tasks');
			expect(taskOps.length).toBeGreaterThan(5);
		});
	});

	describe('Single Task Projects', () => {
		it('should create API integration task', async () => {
			const result = await processNewProject(`
        I need to integrate the Stripe payment API into our checkout flow.
        
        Requirements:
        - Set up webhook endpoints for payment confirmations
        - Handle payment failures and retry logic
        - Update database with payment status
        - Send confirmation emails to customers
        
        This needs to be completed by Friday for the product launch.
        The implementation should follow our existing error handling patterns.
      `);

			validateSingleTaskCreation(result);

			const taskOp = result.operations[1];
			expect(taskOp.data.title.toLowerCase()).toMatch(/stripe|payment|api|integration/);
			expect(taskOp.data.details || taskOp.data.description).toBeDefined();
		});

		it('should create database migration task', async () => {
			const result = await processNewProject(`
        Need to create a database migration to add the new user preferences table.

        The table should include:
        - user_id (foreign key to users table)
        - email_notifications (boolean, default true)
        - theme_preference (string: 'light', 'dark', 'auto')
        - language (string, default 'en')
        - timezone (string)
        - created_at and updated_at timestamps

        This migration is blocking the user settings feature.
        Make sure to include proper indexes on user_id for performance.
      `);

			validateSingleTaskCreation(result);

			const taskOp = result.operations[1];
			expect(taskOp.data.title.toLowerCase()).toMatch(/database|migration|table|preferences/);

			// Should capture technical details
			const details = (taskOp.data.details || '').toLowerCase();
			expect(details).toMatch(/user_id|foreign|index/);
		});
	});

	describe('Multi-Task Projects (3-4 tasks)', () => {
		it('should create landing page with multiple sections', async () => {
			const result = await processNewProject(`
        I need to create a new landing page for our product launch next month.

        The landing page needs several key components:

        1. Hero section with compelling headline and call-to-action button
           - Should clearly communicate our value proposition
           - Include signup form for beta access
           - Add testimonial quotes from early users

        2. Feature showcase section
           - Highlight the top 3 product features with icons and descriptions
           - Use engaging visuals and animations
           - Make sure it's mobile responsive

        3. Pricing table component
           - Show our three pricing tiers
           - Include feature comparison
           - Add "Most Popular" badge on middle tier

        4. Footer with contact information and social links
           - Include privacy policy and terms links
           - Add newsletter signup
           - Ensure GDPR compliance

        The page should be fast-loading, SEO-optimized, and include analytics tracking.
      `);

			validateMultiTaskCreation(result);

			const taskOps = result.operations.filter((op) => op.table === 'tasks');
			const taskTitles = taskOps.map((t) => t.data.title.toLowerCase()).join(' ');

			// Should have tasks for different sections
			expect(taskTitles).toMatch(/hero|header/);
			expect(taskTitles).toMatch(/feature|pricing|footer/);
		});

		it('should create mobile app feature tasks', async () => {
			const result = await processNewProject(`
        Planning the next phase of our mobile app development:

        First, implement push notifications system:
        - Set up Firebase Cloud Messaging
        - Create notification categories
        - Add user preferences for notifications
        - Handle deep linking from notifications

        Second, add offline data synchronization:
        - Implement local SQLite database
        - Create sync mechanism for when connection restored
        - Handle conflict resolution
        - Add offline indicators in UI

        Third, improve the user onboarding flow:
        - Create welcome screen sequence
        - Add interactive tutorials
        - Implement progress tracking
        - A/B test different approaches

        These improvements should boost user retention significantly.
      `);

			validateMultiTaskCreation(result);

			const taskOps = result.operations.filter((op) => op.table === 'tasks');
			expect(taskOps.length).toBeGreaterThanOrEqual(3);

			// Check for feature coverage
			const allContent = JSON.stringify(taskOps).toLowerCase();
			expect(allContent).toMatch(/notification|push/);
			expect(allContent).toMatch(/offline|sync/);
			expect(allContent).toMatch(/onboarding/);
		});
	});

	describe('Edge Cases and Validation', () => {
		it('should handle mixed strategic and tactical content', async () => {
			const result = await processNewProject(`
        Building a project management tool for remote teams.
        
        Strategic context: The remote work market has grown 300% and teams need better coordination tools.
        
        Immediate tasks:
        - Set up user authentication system
        - Create task dashboard interface
        - Implement real-time collaboration features
        - Add video call integration
        
        Technical stack: React frontend, Node.js backend, PostgreSQL database.
      `);

			expect(result.operations.length).toBeGreaterThan(2);

			const projectOp = result.operations[0];
			validateProjectOperation(projectOp);

			// Should capture strategic context
			if (projectOp.data.context) {
				expect(projectOp.data.context.toLowerCase()).toMatch(/strategic|market|remote/);
			}

			// Should have tactical tasks
			const taskOps = result.operations.filter((op) => op.table === 'tasks');
			expect(taskOps.length).toBeGreaterThanOrEqual(3);
		});

		it('should generate valid slugs for projects', async () => {
			const result = await processNewProject(`
        Create a "My Awesome Project!!!" with special characters.
        
        Tasks:
        - Setup development environment
        - Create initial documentation
      `);

			const projectOp = result.operations[0];
			expect(projectOp.data.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
			expect(projectOp.data.slug).not.toContain(' ');
			expect(projectOp.data.slug).not.toContain('_');
			expect(projectOp.data.slug).not.toContain('!');
		});

		it('should handle project references correctly', async () => {
			const result = await processNewProject(`
        Create a website redesign project.
        
        Tasks:
        - Design new homepage
        - Update navigation menu
        - Migrate existing content
      `);

			const projectOp = result.operations.find(
				(op) => op.table === 'projects' && op.operation === 'create'
			);
			expect(projectOp?.ref).toBeDefined();

			// All tasks should reference the project
			const taskOps = result.operations.filter((op) => op.table === 'tasks');
			taskOps.forEach((task) => {
				expect(task.data.project_ref).toBe(projectOp?.ref);
			});
		});
	});
});
