// apps/web/scripts/archive/test-error-logger.ts
// #!/usr/bin/env node
/**
 * Test script for error logging functionality
 * Run with: npx tsx scripts/test-error-logger.ts
 */

import { createCustomClient } from '@buildos/supabase-client';
import { ErrorLoggerService } from '../src/lib/services/errorLogger.service';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
	console.error('Missing Supabase environment variables');
	process.exit(1);
}

// Create Supabase client with service role for testing
const supabase = createCustomClient(supabaseUrl, supabaseServiceKey);

// Get error logger instance
const errorLogger = ErrorLoggerService.getInstance(supabase);

// Test data
const testUserId = 'test-user-123';
const testProjectId = 'test-project-456';
const testBrainDumpId = 'test-braindump-789';

async function runTests() {
	console.log('🧪 Testing Error Logger Service\n');

	// Test 1: Log a brain dump processing error
	console.log('Test 1: Logging brain dump processing error...');
	const brainDumpError = new Error('Failed to parse brain dump: Invalid JSON structure');
	const errorId1 = await errorLogger.logBrainDumpError(
		brainDumpError,
		testBrainDumpId,
		{
			provider: 'openai',
			model: 'gpt-4',
			promptTokens: 1500,
			completionTokens: 800,
			totalTokens: 2300,
			responseTimeMs: 3500,
			temperature: 0.7,
			maxTokens: 2000
		},
		{
			userId: testUserId,
			projectId: testProjectId,
			metadata: {
				textLength: 5000,
				retryCount: 2
			}
		}
	);
	console.log(`✅ Brain dump error logged with ID: ${errorId1}\n`);

	// Test 2: Log a database error
	console.log('Test 2: Logging database error...');
	const dbError = {
		code: '22P02',
		message: 'invalid input syntax for type uuid',
		detail: null,
		hint: null
	};
	const errorId2 = await errorLogger.logDatabaseError(
		dbError,
		'update',
		'tasks',
		'invalid-uuid',
		{ name: 'Test Task', status: 'pending' }
	);
	console.log(`✅ Database error logged with ID: ${errorId2}\n`);

	// Test 3: Log an API error
	console.log('Test 3: Logging API error...');
	const apiError = new Error('Network timeout: Unable to reach OpenAI API');
	const errorId3 = await errorLogger.logAPIError(
		apiError,
		'/api/braindumps/generate',
		'POST',
		testUserId,
		{ action: 'parse', text: 'Sample brain dump text' }
	);
	console.log(`✅ API error logged with ID: ${errorId3}\n`);

	// Test 4: Log a generic error with context
	console.log('Test 4: Logging generic error with context...');
	const genericError = new Error('Update operation requires conditions');
	const errorId4 = await errorLogger.logError(
		genericError,
		{
			userId: testUserId,
			projectId: testProjectId,
			operationType: 'update',
			tableName: 'tasks',
			metadata: {
				source: 'operations-executor',
				attemptNumber: 1
			}
		},
		'error'
	);
	console.log(`✅ Generic error logged with ID: ${errorId4}\n`);

	// Test 5: Fetch recent errors
	console.log('Test 5: Fetching recent errors...');
	const recentErrors = await errorLogger.getRecentErrors(10);
	console.log(`✅ Found ${recentErrors.length} recent errors\n`);

	// Test 6: Get error summary
	console.log('Test 6: Getting error summary...');
	const summary = await errorLogger.getErrorSummary();
	if (summary?.length) {
		console.log('✅ Error Summary:');
		summary.forEach((s: any) => {
			console.log(
				`  - ${s.error_type}: ${s.error_count} errors (${s.resolved_count} resolved)`
			);
		});
	} else {
		console.log('✅ No error summary available yet');
	}

	// Test 7: Simulate the actual error from your logs
	console.log('\nTest 7: Simulating actual brain dump error...');
	const actualError = {
		code: '22P02',
		details: null,
		hint: null,
		message:
			'invalid input syntax for type uuid: "{"type":"brain_dump_executed","description":"Executed brain dump operations","metadata":{"brain_dump_id":"unknown","successful":0,"failed":1,"results":0}}"'
	};

	const errorId5 = await errorLogger.logError(
		actualError,
		{
			userId: testUserId,
			brainDumpId: 'bc9a9b4d-2e7d-45a3-88a1-385a9dde8398',
			projectId: '7d2c7e6a-9353-488f-a0a5-01561549ce45',
			operationType: 'save',
			tableName: 'brain_dumps',
			metadata: {
				errorSource: 'activity_logger',
				projectName: 'The Cadre',
				projectSlug: 'thecadretraining.com',
				operationDetails: {
					table: 'tasks',
					operation: 'update',
					error: 'Update operation requires conditions'
				}
			}
		},
		'critical'
	);
	console.log(`✅ Actual error simulation logged with ID: ${errorId5}\n`);

	console.log('🎉 All tests completed successfully!');
}

// Run tests
runTests().catch((error) => {
	console.error('❌ Test failed:', error);
	process.exit(1);
});
