// scripts/archive/test-security.js
// Test script for rate limiting and CSRF protection
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5173';

// ANSI color codes for output
const colors = {
	green: '\x1b[32m',
	red: '\x1b[31m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	reset: '\x1b[0m'
};

function log(message, color = 'reset') {
	console.log(`${colors[color]}${message}${colors.reset}`);
}

// Test rate limiting
async function testRateLimiting() {
	log('\n=== Testing Rate Limiting ===', 'blue');

	// Test AI endpoint rate limiting (5 requests per minute)
	log('\nTesting AI endpoint rate limit (5 req/min)...', 'yellow');
	const aiEndpoint = `${BASE_URL}/api/braindump`;

	for (let i = 0; i < 7; i++) {
		try {
			const response = await fetch(aiEndpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content: 'test' })
			});

			if (response.status === 429) {
				log(`Request ${i + 1}: Rate limited (429) ✓`, 'green');
			} else {
				log(`Request ${i + 1}: Status ${response.status}`, i < 5 ? 'green' : 'red');
			}
		} catch (error) {
			log(`Request ${i + 1}: Error - ${error.message}`, 'red');
		}
	}

	// Test general API rate limiting (60 requests per minute)
	log('\nTesting general API rate limit (60 req/min)...', 'yellow');
	log('Making 65 rapid requests...', 'yellow');

	const apiEndpoint = `${BASE_URL}/api/projects`;
	let successCount = 0;
	let rateLimitedCount = 0;

	const promises = [];
	for (let i = 0; i < 65; i++) {
		promises.push(
			fetch(apiEndpoint, {
				method: 'GET',
				headers: { 'Content-Type': 'application/json' }
			})
				.then((response) => {
					if (response.status === 429) {
						rateLimitedCount++;
					} else if (response.ok || response.status === 401) {
						successCount++;
					}
				})
				.catch(() => {
					// Ignore errors for this bulk test
				})
		);
	}

	await Promise.all(promises);
	log(`Successful requests: ${successCount}`, successCount <= 60 ? 'green' : 'yellow');
	log(`Rate limited requests: ${rateLimitedCount}`, rateLimitedCount > 0 ? 'green' : 'yellow');
}

// Test CSRF protection
async function testCSRFProtection() {
	log('\n=== Testing CSRF Protection ===', 'blue');

	// First, get a page to obtain CSRF token
	log('\nFetching homepage to get CSRF token...', 'yellow');
	const pageResponse = await fetch(BASE_URL);
	const html = await pageResponse.text();

	// Extract CSRF token from meta tag
	const tokenMatch = html.match(/<meta name="csrf-token" content="([^"]+)"/);
	const csrfToken = tokenMatch ? tokenMatch[1] : null;

	if (csrfToken) {
		log(`CSRF token obtained: ${csrfToken.substring(0, 10)}...`, 'green');
	} else {
		log('Failed to obtain CSRF token', 'red');
		return;
	}

	// Test POST request without CSRF token
	log('\nTesting POST request WITHOUT CSRF token...', 'yellow');
	try {
		const response = await fetch(`${BASE_URL}/api/projects`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'Test Project' })
		});

		if (response.status === 403) {
			const data = await response.json();
			log(`Request blocked: ${data.error} ✓`, 'green');
		} else {
			log(`Request not blocked: Status ${response.status} ✗`, 'red');
		}
	} catch (error) {
		log(`Error: ${error.message}`, 'red');
	}

	// Test POST request with CSRF token
	log('\nTesting POST request WITH CSRF token...', 'yellow');
	try {
		const response = await fetch(`${BASE_URL}/api/projects`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-csrf-token': csrfToken
			},
			body: JSON.stringify({ name: 'Test Project' })
		});

		if (response.status === 403) {
			log(`Request still blocked (likely auth required)`, 'yellow');
		} else if (response.status === 401) {
			log(`Request passed CSRF check, failed auth ✓`, 'green');
		} else {
			log(`Request status: ${response.status}`, 'green');
		}
	} catch (error) {
		log(`Error: ${error.message}`, 'red');
	}

	// Test that GET requests don't need CSRF token
	log('\nTesting GET request (should not need CSRF token)...', 'yellow');
	try {
		const response = await fetch(`${BASE_URL}/api/projects`);
		if (response.status !== 403) {
			log(`GET request not blocked by CSRF ✓`, 'green');
		} else {
			log(`GET request blocked by CSRF ✗`, 'red');
		}
	} catch (error) {
		log(`Error: ${error.message}`, 'red');
	}
}

// Main test runner
async function runTests() {
	log('Starting Security Tests...', 'blue');
	log('Make sure the dev server is running on http://localhost:5173', 'yellow');

	try {
		// Check if server is running
		await fetch(BASE_URL);
	} catch (error) {
		log(
			"\nError: Cannot connect to dev server. Make sure it's running with: pnpm run dev",
			'red'
		);
		process.exit(1);
	}

	await testRateLimiting();
	await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait between test suites
	await testCSRFProtection();

	log('\n=== Security Tests Complete ===', 'blue');
}

// Run tests
runTests().catch((error) => {
	log(`\nTest runner error: ${error.message}`, 'red');
	process.exit(1);
});
