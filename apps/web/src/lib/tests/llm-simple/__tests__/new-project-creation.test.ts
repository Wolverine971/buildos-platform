// apps/web/src/lib/tests/llm-simple/__tests__/new-project-creation.test.ts

import { describe, it, expect, beforeAll } from 'vitest';
import { processNewProject } from '../helpers/simple-llm-runner';
import {
	validateBrainDumpResult,
	validateProjectCreation,
	validateSmallProject,
	validateLargeProject,
	validateSingleTaskCreation,
	validateMultiTaskCreation
} from '../schemas/loose-validation';
// No need to import supabase - handled in helper

/**
 * Simplified New Project Creation Tests
 *
 * Brain dumps are inline for easy reading and maintenance.
 * Validation focuses on structure, not exact content.
 * Tests are self-contained and fast.
 */
describe('New Project Creation - Simplified', () => {
	describe('Small Projects (2-4 tasks)', () => {
		it('creates blog project with basic tasks', async () => {
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

			// Flexible content checks
			const projectOp = result.operations[0];
			expect(projectOp.data.name.toLowerCase()).toMatch(/blog|personal/);

			const taskTitles = result.operations
				.slice(1)
				.map((op) => op.data.title.toLowerCase())
				.join(' ');
			expect(taskTitles).toMatch(/homepage|about|rss|page/);
		});

		it('creates todo app with standard features', async () => {
			const result = await processNewProject(`
        Build a simple todo application with these features:
        - Add new tasks
        - Mark tasks as complete
        - Delete tasks  
        - Filter by status (all, active, completed)

        Technology stack: React with local storage for persistence.
        Keep the UI minimal and responsive.
      `);

			validateSmallProject(result);

			const projectOp = result.operations[0];
			expect(projectOp.data.name.toLowerCase()).toContain('todo');

			const taskOps = result.operations.slice(1);
			const allContent = taskOps
				.map(
					(op) => `${op.data.title} ${op.data.description || ''} ${op.data.details || ''}`
				)
				.join(' ')
				.toLowerCase();

			expect(allContent).toMatch(/add|create|complete|delete|filter/);
		});

		it('creates weather app with API integration', async () => {
			const result = await processNewProject(`
        Create a weather app that shows current conditions for user's location.

        Core features needed:
        - Get user's location automatically
        - Display current temperature and conditions
        - Show 3-day forecast
        - Clean, mobile-friendly design

        Use OpenWeatherMap API and build with vanilla JavaScript.
      `);

			validateSmallProject(result);

			const projectOp = result.operations[0];
			expect(projectOp.data.name.toLowerCase()).toContain('weather');

			// Should mention API or location somewhere
			const allContent = [
				projectOp.data.context || '',
				...result.operations
					.slice(1)
					.map((op) => `${op.data.title} ${op.data.details || op.data.description || ''}`)
			]
				.join(' ')
				.toLowerCase();

			expect(allContent).toMatch(/api|location|forecast|temperature/);
		});
	});

	describe('Large Projects (8+ tasks)', () => {
		it('creates comprehensive e-commerce platform', async () => {
			const result = await processNewProject(`
        # E-commerce Platform Development

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
			expect(projectOp.data.context).toContain('##'); // Should preserve structure
			expect(projectOp.data.context.length).toBeGreaterThan(500);

			// Should have diverse task types for e-commerce
			const taskOps = result.operations.slice(1);
			const taskTitles = taskOps.map((task) => task.data.title.toLowerCase());

			// Check for different e-commerce aspects (flexible)
			const hasAuth = taskTitles.some((title) => title.includes('auth'));
			const hasProduct = taskTitles.some(
				(title) => title.includes('product') || title.includes('catalog')
			);
			const hasPayment = taskTitles.some(
				(title) => title.includes('payment') || title.includes('checkout')
			);

			expect(hasAuth || hasProduct || hasPayment).toBe(true);
		});

		it('creates complex SaaS project management platform', async () => {
			const result = await processNewProject(`
        # SaaS Project Management Platform Development

        Building a comprehensive project management platform that competes with 
        Asana, Monday.com, and Notion.

        ## Vision Statement
        Create the most intuitive and powerful project management platform that 
        adapts to any team's workflow, from small startups to enterprise organizations.

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
        - Video call integration (Zoom, Meet, Teams)
        - Activity feeds and notifications

        ### Task Management
        - Advanced task creation with rich text, attachments, checklists
        - Custom fields and task types
        - Automated task assignments based on rules
        - Recurring task templates
        - Task dependencies and blocking

        ## Technical Architecture
        ### Frontend
        - React with TypeScript for web application
        - React Native for mobile applications
        - Redux Toolkit for state management
        - Material-UI component library

        ### Backend
        - Node.js with Express framework
        - GraphQL API with REST fallbacks
        - PostgreSQL primary database
        - Redis for caching and sessions
        - Message queuing with Bull/Redis

        ## Business Model
        ### Pricing Tiers
        - **Free**: Up to 5 users, basic features
        - **Starter** ($10/user/month): Up to 25 users, advanced features
        - **Professional** ($20/user/month): Unlimited users, all features
        - **Enterprise** (Custom): SSO, compliance, dedicated support

        This represents a significant opportunity to build a next-generation platform.
      `);

			validateLargeProject(result);

			const projectOp = result.operations[0];
			expect(projectOp.data.name.toLowerCase()).toMatch(/saas|platform|management|project/);

			// Should have business context in project context
			expect(projectOp.data.context).toContain('##'); // Multiple sections
			expect(projectOp.data.context.toLowerCase()).toMatch(/business|pricing|revenue|market/);

			// Should have technical and business tasks
			const taskOps = result.operations.slice(1);
			const allTaskContent = taskOps
				.map(
					(task) =>
						`${task.data.title} ${task.data.description || ''} ${task.data.details || ''}`
				)
				.join(' ')
				.toLowerCase();

			expect(allTaskContent).toMatch(/api|database|frontend|backend|auth|user/);
		});
	});

	describe('Single Task Projects', () => {
		it('creates focused API integration task', async () => {
			const result = await processNewProject(`
        I need to integrate the Stripe payment API into our checkout flow. 

        The current checkout form collects user payment information but doesn't 
        actually process payments. I need to:
        - Set up Stripe webhook endpoints for payment confirmations
        - Handle payment failures and retry logic
        - Update the database with payment status
        - Send confirmation emails to customers

        This needs to be completed by Friday for the product launch. 
        Implementation should follow our existing error handling patterns 
        and include proper logging for debugging payment issues.
      `);

			validateSingleTaskCreation(result);

			const taskOp = result.operations.find((op) => op.table === 'tasks');
			expect(taskOp.data.title.toLowerCase()).toMatch(/stripe|api|payment|integration/);
			expect(taskOp.data.details || taskOp.data.description).toBeTruthy();

			const details = (taskOp.data.details || taskOp.data.description).toLowerCase();
			expect(details).toMatch(/webhook|payment|stripe|checkout/);
		});

		it('creates database migration task', async () => {
			const result = await processNewProject(`
        Need to create a database migration to add the new user preferences table.

        The table should include:
        - user_id (foreign key to users table)
        - email_notifications (boolean, default true)
        - theme_preference (string: 'light', 'dark', 'auto')
        - language (string, default 'en')
        - timezone (string)
        - created_at and updated_at timestamps

        This migration is blocking the user settings feature planned for next sprint. 
        Make sure to include proper indexes on user_id for performance.
      `);

			validateSingleTaskCreation(result);

			const taskOp = result.operations.find((op) => op.table === 'tasks');
			expect(taskOp.data.title.toLowerCase()).toMatch(/database|migration|table|user/);

			const details = (taskOp.data.details || taskOp.data.description).toLowerCase();
			expect(details).toMatch(/user_id|preferences|migration|table/);
		});
	});

	describe('Multi-Task Projects (3-4 tasks)', () => {
		it('creates landing page with related components', async () => {
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

        The page should be fast-loading, SEO-optimized, and include analytics 
        tracking for conversion measurement.
      `);

			validateMultiTaskCreation(result);

			const taskOps = result.operations.filter((op) => op.table === 'tasks');
			const taskTitles = taskOps.map((task) => task.data.title.toLowerCase());

			// Should have tasks for different sections (flexible check)
			const hasHero = taskTitles.some((title) => title.includes('hero'));
			const hasFeature = taskTitles.some((title) => title.includes('feature'));
			const hasPricing = taskTitles.some((title) => title.includes('pricing'));
			const hasFooter = taskTitles.some((title) => title.includes('footer'));

			// At least 2 of these should be present
			const sectionCount = [hasHero, hasFeature, hasPricing, hasFooter].filter(
				Boolean
			).length;
			expect(sectionCount).toBeGreaterThanOrEqual(2);
		});

		it('creates mobile app development phases', async () => {
			const result = await processNewProject(`
        Planning the next phase of our mobile app development with these priorities:

        First, implement push notifications system:
        - Set up Firebase Cloud Messaging
        - Create notification categories for different message types
        - Add user preferences for notification settings
        - Handle deep linking from notifications

        Second, add offline data synchronization:
        - Implement local SQLite database
        - Create sync mechanism for when connection restored
        - Handle conflict resolution for concurrent edits
        - Add offline indicators in the UI

        Third, improve the user onboarding flow:
        - Create welcome screen sequence
        - Add interactive tutorials for key features
        - Implement progress tracking for setup completion
        - A/B test different onboarding approaches

        Finally, optimize performance and add analytics:
        - Implement performance monitoring
        - Add crash reporting
        - Track user engagement metrics
        - Optimize bundle size and loading times

        These improvements should significantly boost user retention and app store ratings.
      `);

			validateMultiTaskCreation(result);

			const taskOps = result.operations.filter((op) => op.table === 'tasks');
			const allContent = taskOps
				.map(
					(task) =>
						`${task.data.title} ${task.data.description || ''} ${task.data.details || ''}`
				)
				.join(' ')
				.toLowerCase();

			// Should cover different mobile app concerns (flexible)
			const hasNotifications =
				allContent.includes('notification') || allContent.includes('push');
			const hasOffline = allContent.includes('offline') || allContent.includes('sync');
			const hasOnboarding =
				allContent.includes('onboarding') || allContent.includes('tutorial');
			const hasPerformance =
				allContent.includes('performance') || allContent.includes('analytics');

			// Should have at least 2 of these mobile app aspects
			const aspectCount = [
				hasNotifications,
				hasOffline,
				hasOnboarding,
				hasPerformance
			].filter(Boolean).length;
			expect(aspectCount).toBeGreaterThanOrEqual(2);
		});
	});

	describe('Edge Cases and Quality Checks', () => {
		it('handles mixed strategic and tactical content', async () => {
			const result = await processNewProject(`
        Building a project management tool for remote teams.
        
        Strategic context: The remote work market has grown 300% and teams 
        need better coordination tools.
        
        Immediate tasks:
        - Set up user authentication system
        - Create task dashboard interface
        - Implement real-time collaboration features
        - Add video call integration
        
        Technical requirements: React frontend, Node.js backend, PostgreSQL database.
      `);

			validateBrainDumpResult(result);
			validateProjectCreation(result.operations);

			// Should capture both strategic context and tactical tasks
			const projectOp = result.operations[0];
			expect(projectOp.data.context).toMatch(/strategic|market|remote|context/i);

			const taskOps = result.operations.slice(1);
			expect(taskOps.length).toBeGreaterThanOrEqual(3);

			const taskTitles = taskOps.map((task) => task.data.title.toLowerCase());
			const hasAuth = taskTitles.some((title) => title.includes('auth'));
			const hasDashboard = taskTitles.some((title) => title.includes('dashboard'));

			expect(hasAuth || hasDashboard).toBe(true);
		});

		it('generates valid operation structure', async () => {
			const result = await processNewProject(`
        Create a simple calculator app with basic arithmetic operations.
        Should support addition, subtraction, multiplication, and division.
        Include a clear button and history feature.
      `);

			validateBrainDumpResult(result);

			// Check operation structure is valid
			result.operations.forEach((op) => {
				expect(op.table).toBeOneOf(['projects', 'tasks', 'notes']);
				expect(op.operation).toBeOneOf(['create', 'update', 'delete']);
				expect(op.data).toBeTruthy();
				expect(typeof op.data).toBe('object');
			});

			// Project operation should have required fields
			const projectOp = result.operations.find((op) => op.table === 'projects');
			expect(projectOp).toBeTruthy();
			expect(projectOp.data.name).toBeTruthy();
			expect(projectOp.data.slug).toBeTruthy();

			// Task operations should reference the project
			const taskOps = result.operations.filter((op) => op.table === 'tasks');
			taskOps.forEach((task) => {
				expect(task.data.project_ref || task.data.project_id).toBeTruthy();
			});
		});
	});
});
