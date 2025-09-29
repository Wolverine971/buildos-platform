// scripts/validate-2way-sync.ts

// #!/usr/bin/env node

/**
 * Validation Script for Google Calendar 2-Way Sync Implementation
 *
 * This script validates that all components for 2-way sync are properly implemented
 * Run with: npx tsx scripts/validate-2way-sync.ts
 */

import { existsSync } from 'fs';
import { createCustomClient } from '@buildos/supabase-client';
import type { Database } from '@buildos/shared-types';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

interface ValidationResult {
	category: string;
	checks: {
		name: string;
		status: 'pass' | 'fail' | 'warning';
		message?: string;
	}[];
}

async function validateImplementation(): Promise<void> {
	console.log('\n🔍 Validating Google Calendar 2-Way Sync Implementation\n');
	console.log('='.repeat(60));

	const results: ValidationResult[] = [];

	// 1. Check Required Files
	results.push(validateFiles());

	// 2. Check Environment Variables
	results.push(validateEnvironment());

	// 3. Check Database Schema
	results.push(await validateDatabase());

	// 4. Check Service Implementation
	results.push(validateServices());

	// 5. Check API Endpoints
	results.push(validateEndpoints());

	// Print Results
	printResults(results);
}

function validateFiles(): ValidationResult {
	const requiredFiles = [
		{
			path: './src/lib/services/calendar-webhook-service.ts',
			description: 'Calendar Webhook Service'
		},
		{
			path: './src/lib/services/calendar-service.ts',
			description: 'Calendar Service with markAppInitiatedChange'
		},
		{
			path: './src/routes/webhooks/calendar-events/+server.ts',
			description: 'Webhook receiver endpoint'
		},
		{
			path: './src/routes/api/cron/renew-webhooks/+server.ts',
			description: 'Webhook renewal cron endpoint'
		},
		{
			path: './src/routes/auth/google/calendar-callback/+page.server.ts',
			description: 'OAuth callback with webhook registration'
		}
	];

	const checks = requiredFiles.map((file) => ({
		name: file.description,
		status: existsSync(file.path) ? ('pass' as const) : ('fail' as const),
		message: existsSync(file.path) ? undefined : `Missing: ${file.path}`
	}));

	return {
		category: '📁 Required Files',
		checks
	};
}

function validateEnvironment(): ValidationResult {
	const requiredEnvVars = [
		'PRIVATE_GOOGLE_CLIENT_ID',
		'PRIVATE_GOOGLE_CLIENT_SECRET',
		'PUBLIC_SUPABASE_URL',
		'PRIVATE_SUPABASE_SERVICE_KEY',
		'PRIVATE_CRON_SECRET'
	];

	const checks = requiredEnvVars.map((varName) => {
		const value = process.env[varName];
		const isSet = !!value && value !== 'your-' + varName.toLowerCase().replace(/_/g, '-');

		return {
			name: varName,
			status: isSet ? ('pass' as const) : ('fail' as const),
			message: isSet ? undefined : 'Not set or using placeholder value'
		};
	});

	return {
		category: '🔐 Environment Variables',
		checks
	};
}

async function validateDatabase(): Promise<ValidationResult> {
	const checks: any[] = [];

	try {
		const supabase = createCustomClient(
			process.env.PUBLIC_SUPABASE_URL!,
			process.env.PRIVATE_SUPABASE_SERVICE_KEY!
		);

		// Check calendar_webhook_channels table
		const { error: webhookTableError } = await supabase
			.from('calendar_webhook_channels')
			.select('id')
			.limit(1);

		checks.push({
			name: 'calendar_webhook_channels table',
			status: !webhookTableError ? 'pass' : 'fail',
			message: webhookTableError?.message
		});

		// Check task_calendar_events columns
		const { data: taskEventColumns, error: columnsError } = await supabase
			.from('task_calendar_events')
			.select('sync_source, sync_version')
			.limit(1);

		checks.push({
			name: 'sync_source column in task_calendar_events',
			status: !columnsError ? 'pass' : 'fail',
			message: columnsError?.message
		});

		// Check for webhook_token column
		const { error: tokenError } = await supabase
			.from('calendar_webhook_channels')
			.select('webhook_token')
			.limit(1);

		checks.push({
			name: 'webhook_token column in calendar_webhook_channels',
			status: !tokenError ? 'pass' : 'fail',
			message: tokenError?.message
		});
	} catch (error) {
		checks.push({
			name: 'Database connection',
			status: 'fail',
			message: error instanceof Error ? error.message : 'Unknown error'
		});
	}

	return {
		category: '🗄️ Database Schema',
		checks
	};
}

function validateServices(): ValidationResult {
	const checks: any[] = [];

	// Check if markAppInitiatedChange is called in CalendarService
	try {
		const calendarServicePath = './src/lib/services/calendar-service.ts';
		if (existsSync(calendarServicePath)) {
			const fs = require('fs');
			const content = fs.readFileSync(calendarServicePath, 'utf-8');

			const hasMarkMethod = content.includes('markAppInitiatedChange');
			const callsInSchedule =
				content.includes('await this.markAppInitiatedChange') ||
				content.includes('await this.markAppInitiatedChange');

			checks.push({
				name: 'markAppInitiatedChange method exists',
				status: hasMarkMethod ? 'pass' : 'fail',
				message: hasMarkMethod ? undefined : 'Method not found in CalendarService'
			});

			checks.push({
				name: 'markAppInitiatedChange called after operations',
				status: callsInSchedule ? 'pass' : 'warning',
				message: callsInSchedule
					? undefined
					: 'Ensure method is called after calendar operations'
			});
		}
	} catch (error) {
		checks.push({
			name: 'CalendarService validation',
			status: 'fail',
			message: 'Error reading CalendarService file'
		});
	}

	// Check webhook service methods
	try {
		const webhookServicePath = './src/lib/services/calendar-webhook-service.ts';
		if (existsSync(webhookServicePath)) {
			const fs = require('fs');
			const content = fs.readFileSync(webhookServicePath, 'utf-8');

			const requiredMethods = [
				'registerWebhook',
				'handleWebhookNotification',
				'syncCalendarChanges',
				'unregisterWebhook',
				'renewExpiringWebhooks'
			];

			requiredMethods.forEach((method) => {
				const hasMethod = content.includes(`${method}(`);
				checks.push({
					name: `CalendarWebhookService.${method}`,
					status: hasMethod ? 'pass' : 'fail',
					message: hasMethod ? undefined : `Missing ${method} method`
				});
			});
		}
	} catch (error) {
		checks.push({
			name: 'CalendarWebhookService validation',
			status: 'fail',
			message: 'Error reading CalendarWebhookService file'
		});
	}

	return {
		category: '⚙️ Service Implementation',
		checks
	};
}

function validateEndpoints(): ValidationResult {
	const checks: any[] = [];

	// Check webhook endpoint
	try {
		const webhookPath = './src/routes/webhooks/calendar-events/+server.ts';
		if (existsSync(webhookPath)) {
			const fs = require('fs');
			const content = fs.readFileSync(webhookPath, 'utf-8');

			checks.push({
				name: 'POST handler for webhooks',
				status: content.includes('export const POST') ? 'pass' : 'fail'
			});

			checks.push({
				name: 'GET handler for verification',
				status: content.includes('export const GET') ? 'pass' : 'fail'
			});

			checks.push({
				name: 'Token verification',
				status: content.includes('x-goog-channel-token') ? 'pass' : 'warning',
				message: content.includes('x-goog-channel-token')
					? undefined
					: 'Ensure token verification is implemented'
			});
		}
	} catch (error) {
		checks.push({
			name: 'Webhook endpoint validation',
			status: 'fail',
			message: 'Error reading webhook endpoint'
		});
	}

	// Check OAuth callback
	try {
		const callbackPath = './src/routes/auth/google/calendar-callback/+page.server.ts';
		if (existsSync(callbackPath)) {
			const fs = require('fs');
			const content = fs.readFileSync(callbackPath, 'utf-8');

			checks.push({
				name: 'Webhook registration on connect',
				status: content.includes('webhookService.registerWebhook') ? 'pass' : 'fail',
				message: content.includes('webhookService.registerWebhook')
					? undefined
					: 'Webhook registration not found in OAuth callback'
			});
		}
	} catch (error) {
		checks.push({
			name: 'OAuth callback validation',
			status: 'fail',
			message: 'Error reading OAuth callback'
		});
	}

	// Check disconnect action
	try {
		const profilePath = './src/routes/profile/+page.server.ts';
		if (existsSync(profilePath)) {
			const fs = require('fs');
			const content = fs.readFileSync(profilePath, 'utf-8');

			checks.push({
				name: 'Webhook unregistration on disconnect',
				status: content.includes('webhookService.unregisterWebhook') ? 'pass' : 'fail',
				message: content.includes('webhookService.unregisterWebhook')
					? undefined
					: 'Webhook unregistration not found in disconnect action'
			});
		}
	} catch (error) {
		checks.push({
			name: 'Disconnect action validation',
			status: 'fail',
			message: 'Error reading profile actions'
		});
	}

	return {
		category: '🌐 API Endpoints',
		checks
	};
}

function printResults(results: ValidationResult[]): void {
	console.log('\n📊 VALIDATION RESULTS\n');

	let totalPassed = 0;
	let totalFailed = 0;
	let totalWarnings = 0;

	results.forEach((category) => {
		console.log(`\n${category.category}`);
		console.log('-'.repeat(40));

		category.checks.forEach((check) => {
			const icon = check.status === 'pass' ? '✅' : check.status === 'warning' ? '⚠️' : '❌';
			console.log(`  ${icon} ${check.name}`);
			if (check.message) {
				console.log(`     └─ ${check.message}`);
			}

			if (check.status === 'pass') totalPassed++;
			else if (check.status === 'warning') totalWarnings++;
			else totalFailed++;
		});
	});

	console.log('\n' + '='.repeat(60));
	console.log('\n📈 SUMMARY\n');
	console.log(`  ✅ Passed: ${totalPassed}`);
	console.log(`  ⚠️ Warnings: ${totalWarnings}`);
	console.log(`  ❌ Failed: ${totalFailed}`);

	const totalChecks = totalPassed + totalWarnings + totalFailed;
	const successRate = Math.round((totalPassed / totalChecks) * 100);

	console.log(`\n  Success Rate: ${successRate}%`);

	if (totalFailed === 0 && totalWarnings === 0) {
		console.log('\n🎉 All checks passed! Your 2-way sync implementation is ready.');
	} else if (totalFailed === 0) {
		console.log('\n⚠️ Implementation is functional but has some warnings to address.');
	} else {
		console.log('\n❌ Critical issues found. Please fix the failed checks before deployment.');
	}

	// Production readiness checklist
	console.log('\n📋 PRODUCTION DEPLOYMENT CHECKLIST\n');
	console.log('  [ ] Domain verified in Google Search Console');
	console.log('  [ ] HTTPS enabled on production domain');
	console.log('  [ ] Production domain added to Google OAuth authorized URLs');
	console.log('  [ ] Daily cron job configured for webhook renewal');
	console.log('  [ ] All environment variables set in production');
	console.log('  [ ] Database migrations applied to production');
	console.log('  [ ] Monitoring configured for webhook failures');

	console.log('\n' + '='.repeat(60) + '\n');
}

// Run validation
validateImplementation().catch(console.error);
