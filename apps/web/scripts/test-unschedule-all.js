// apps/web/scripts/test-unschedule-all.js

/**
 * Test script for the unschedule-all endpoint
 *
 * Usage: node scripts/test-unschedule-all.js
 */

const TEST_CONFIG = {
	// Replace with actual test values
	projectId: 'YOUR_PROJECT_ID',
	apiUrl: 'http://localhost:5173/api',
	authToken: 'YOUR_AUTH_TOKEN' // Get from browser dev tools when logged in
};

async function testUnscheduleAll() {
	console.log('Testing Unschedule-All Endpoint...\n');

	// Test 1: Clear dates from ALL tasks
	console.log('1. Testing Clear All Dates...');
	try {
		const response = await fetch(
			`${TEST_CONFIG.apiUrl}/projects/${TEST_CONFIG.projectId}/tasks/unschedule-all`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${TEST_CONFIG.authToken}`
				},
				body: JSON.stringify({
					clearDates: true,
					removeCalendarEvents: true,
					moveToBacklog: false
				})
			}
		);

		const data = await response.json();

		if (!response.ok) {
			console.error('❌ Clear dates failed:', data);
			return;
		}

		console.log('✅ Clear dates successful!');
		console.log(`   - Tasks processed: ${data.totalUnscheduled || 0}`);
		console.log(`   - Calendar events removed: ${data.calendarEventsRemoved || 0}`);

		// Verify that dates are cleared
		if (data.unscheduledTasks && data.unscheduledTasks.length > 0) {
			const hasAnyDates = data.unscheduledTasks.some(
				(task) => task.start_date || task.completed_at
			);
			console.log(`   - All dates cleared: ${hasAnyDates ? '❌' : '✅'}`);

			const hasAnyRecurrence = data.unscheduledTasks.some(
				(task) => task.recurrence_pattern || task.recurrence_ends
			);
			console.log(`   - All recurrence cleared: ${hasAnyRecurrence ? '❌' : '✅'}`);
		}
	} catch (error) {
		console.error('❌ Test failed:', error.message);
	}

	// Test 2: Move to backlog (removes dates and phase associations)
	console.log('\n2. Testing Move to Backlog...');
	console.log('   ⚠️  Skipping to avoid modifying phase associations');
	console.log('   Uncomment the code below to test');

	/*
	try {
		const response = await fetch(
			`${TEST_CONFIG.apiUrl}/projects/${TEST_CONFIG.projectId}/tasks/unschedule-all`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${TEST_CONFIG.authToken}`
				},
				body: JSON.stringify({
					clearDates: false,
					removeCalendarEvents: true,
					moveToBacklog: true
				})
			}
		);

		const data = await response.json();
		
		if (!response.ok) {
			console.error('❌ Move to backlog failed:', data);
			return;
		}

		console.log('✅ Move to backlog successful!');
		console.log(`   - Tasks moved: ${data.totalUnscheduled || 0}`);
		console.log(`   - Calendar events removed: ${data.calendarEventsRemoved || 0}`);
		
	} catch (error) {
		console.error('❌ Test failed:', error.message);
	}
	*/

	// Test 3: Just remove calendar events (keep dates)
	console.log('\n3. Testing Remove Calendar Events Only...');
	console.log('   ⚠️  Skipping to preserve calendar sync');
	console.log('   Uncomment the code below to test');

	/*
	try {
		const response = await fetch(
			`${TEST_CONFIG.apiUrl}/projects/${TEST_CONFIG.projectId}/tasks/unschedule-all`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${TEST_CONFIG.authToken}`
				},
				body: JSON.stringify({
					clearDates: false,
					removeCalendarEvents: true,
					moveToBacklog: false
				})
			}
		);

		const data = await response.json();
		
		if (!response.ok) {
			console.error('❌ Remove calendar events failed:', data);
			return;
		}

		console.log('✅ Remove calendar events successful!');
		console.log(`   - Tasks processed: ${data.totalUnscheduled || 0}`);
		console.log(`   - Calendar events removed: ${data.calendarEventsRemoved || 0}`);
		
	} catch (error) {
		console.error('❌ Test failed:', error.message);
	}
	*/
}

// Verify specific scenarios
async function verifyScenarios() {
	console.log('\n4. Verification Tests:');

	// Get project tasks to verify
	try {
		const response = await fetch(
			`${TEST_CONFIG.apiUrl}/projects/${TEST_CONFIG.projectId}/tasks`,
			{
				headers: {
					Authorization: `Bearer ${TEST_CONFIG.authToken}`
				}
			}
		);

		if (response.ok) {
			const tasks = await response.json();

			console.log(`   - Total tasks in project: ${tasks.length || 0}`);

			const scheduledTasks = tasks.filter((t) => t.start_date);
			console.log(`   - Scheduled tasks: ${scheduledTasks.length}`);

			const recurringTasks = tasks.filter((t) => t.recurrence_pattern);
			console.log(`   - Recurring tasks: ${recurringTasks.length}`);

			const completedTasks = tasks.filter((t) => t.completed_at);
			console.log(`   - Completed tasks: ${completedTasks.length}`);

			if (scheduledTasks.length === 0) {
				console.log('\n   ✅ All dates successfully cleared!');
			} else {
				console.log('\n   ⚠️  Some tasks still have dates');
			}
		}
	} catch (error) {
		console.error('   ❌ Could not fetch tasks for verification');
	}
}

// Instructions for manual testing
console.log('='.repeat(60));
console.log('UNSCHEDULE-ALL ENDPOINT TEST');
console.log('='.repeat(60));
console.log('\n📝 Instructions:');
console.log('1. Update TEST_CONFIG with your project ID');
console.log('2. Get auth token from browser DevTools (Network tab)');
console.log('3. Run: node scripts/test-unschedule-all.js');
console.log('4. Check console output for results');
console.log('\n⚠️  Note: This test will modify your project data!');
console.log('    Consider using a test project');
console.log('='.repeat(60));
console.log('\n');

// Only run if config is set
if (TEST_CONFIG.projectId === 'YOUR_PROJECT_ID') {
	console.log('❌ Please update TEST_CONFIG with actual values first!');
	console.log('   You need:');
	console.log('   - A project ID with tasks');
	console.log('   - Your auth token from the browser');
	process.exit(1);
}

// Run the tests
testUnscheduleAll()
	.then(() => verifyScenarios())
	.catch(console.error);
