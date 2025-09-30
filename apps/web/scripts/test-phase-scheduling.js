// apps/web/scripts/test-phase-scheduling.js

/**
 * Test script for the phase intelligent scheduling endpoint
 *
 * Usage: node scripts/test-phase-scheduling.js
 */

const TEST_CONFIG = {
	// Replace with actual test values
	projectId: 'YOUR_PROJECT_ID',
	phaseId: 'YOUR_PHASE_ID',
	apiUrl: 'http://localhost:5173/api',
	authToken: 'YOUR_AUTH_TOKEN' // Get from browser dev tools when logged in
};

async function testPhaseScheduling() {
	console.log('Testing Phase Intelligent Scheduling Endpoint...\n');

	// Test Preview Mode
	console.log('1. Testing Preview Mode (GET schedule proposal)...');
	try {
		const previewResponse = await fetch(
			`${TEST_CONFIG.apiUrl}/projects/${TEST_CONFIG.projectId}/phases/${TEST_CONFIG.phaseId}/schedule`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${TEST_CONFIG.authToken}`
				},
				body: JSON.stringify({
					preview: true,
					timeZone: 'America/New_York',
					currentDateTime: new Date().toISOString()
				})
			}
		);

		const previewData = await previewResponse.json();

		if (!previewResponse.ok) {
			console.error('❌ Preview failed:', previewData);
			return;
		}

		console.log('✅ Preview successful!');
		console.log(`   - Tasks scheduled: ${previewData.schedule?.length || 0}`);
		console.log(`   - Warnings: ${previewData.warnings?.join(', ') || 'None'}`);

		if (previewData.schedule && previewData.schedule.length > 0) {
			console.log('\n   Sample task schedule:');
			const sampleTask = previewData.schedule[0];
			console.log(`   - Task ID: ${sampleTask.taskId}`);
			console.log(`   - Start: ${new Date(sampleTask.proposedStart).toLocaleString()}`);
			console.log(`   - End: ${new Date(sampleTask.proposedEnd).toLocaleString()}`);
			if (sampleTask.reasoning) {
				console.log(`   - Reasoning: ${sampleTask.reasoning}`);
			}
			console.log(`   - Has Conflict: ${sampleTask.hasConflict ? 'Yes' : 'No'}`);
		}
	} catch (error) {
		console.error('❌ Preview test failed:', error.message);
	}

	console.log('\n2. Testing actual scheduling (POST to save)...');
	console.log('   ⚠️  Skipping actual save to avoid modifying data');
	console.log('   To test actual scheduling, manually uncomment the code below');

	/*
	// Uncomment to test actual scheduling
	try {
		const schedule = previewData.schedule.map(item => ({
			taskId: item.taskId,
			start_date: item.proposedStart,
			duration_minutes: 60 // or calculate from proposedEnd - proposedStart
		}));

		const saveResponse = await fetch(
			`${TEST_CONFIG.apiUrl}/projects/${TEST_CONFIG.projectId}/phases/${TEST_CONFIG.phaseId}/schedule`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${TEST_CONFIG.authToken}`
				},
				body: JSON.stringify({
					preview: false,
					schedule: schedule,
					timeZone: 'America/New_York'
				})
			}
		);

		const saveData = await saveResponse.json();
		
		if (!saveResponse.ok) {
			console.error('❌ Save failed:', saveData);
			return;
		}

		console.log('✅ Tasks scheduled successfully!');
		console.log(`   - Message: ${saveData.message}`);
		console.log(`   - Successful: ${saveData.task_updates?.successful?.length || 0}`);
		console.log(`   - Failed: ${saveData.task_updates?.failed?.length || 0}`);
		
	} catch (error) {
		console.error('❌ Save test failed:', error.message);
	}
	*/
}

// Validation checks
function validateTestData(data) {
	console.log('\n3. Validation Checks:');

	// Check for intelligent scheduling indicators
	const hasReasoning = data.schedule?.some((task) => task.reasoning);
	console.log(`   - LLM reasoning present: ${hasReasoning ? '✅' : '❌'}`);

	// Check for strategy in warnings
	const hasStrategy = data.warnings?.some((w) => w.startsWith('Strategy:'));
	console.log(`   - Scheduling strategy present: ${hasStrategy ? '✅' : '❌'}`);

	// Check time distribution
	if (data.schedule && data.schedule.length > 1) {
		const times = data.schedule.map((s) => new Date(s.proposedStart).getTime());
		const sorted = [...times].sort((a, b) => a - b);
		const wellDistributed = JSON.stringify(times) === JSON.stringify(sorted);
		console.log(`   - Tasks chronologically ordered: ${wellDistributed ? '✅' : '❌'}`);

		// Check if tasks are scheduled during working hours
		const duringWorkHours = data.schedule.every((task) => {
			const hour = new Date(task.proposedStart).getHours();
			return hour >= 9 && hour < 17;
		});
		console.log(`   - Scheduled during work hours: ${duringWorkHours ? '✅' : '❌'}`);
	}
}

// Instructions for manual testing
console.log('='.repeat(60));
console.log('PHASE INTELLIGENT SCHEDULING TEST');
console.log('='.repeat(60));
console.log('\n📝 Instructions:');
console.log('1. Update TEST_CONFIG with your project/phase IDs');
console.log('2. Get auth token from browser DevTools (Network tab)');
console.log('3. Run: node scripts/test-phase-scheduling.js');
console.log('4. Check console output for results');
console.log('\n⚠️  Note: This test runs in preview mode only by default');
console.log('    Uncomment the save section to test actual scheduling');
console.log('='.repeat(60));
console.log('\n');

// Only run if config is set
if (TEST_CONFIG.projectId === 'YOUR_PROJECT_ID') {
	console.log('❌ Please update TEST_CONFIG with actual values first!');
	console.log('   You need:');
	console.log('   - A project ID with phases');
	console.log('   - A phase ID with unscheduled tasks');
	console.log('   - Your auth token from the browser');
	process.exit(1);
}

// Run the test
testPhaseScheduling().catch(console.error);
