// worker-queue/tests/test-url-transform.ts
import { DailyBriefEmailSender } from '../src/lib/services/email-sender';
import { createClient } from '@supabase/supabase-js';

// Create a mock supabase client for testing
const mockSupabase = createClient('https://example.supabase.co', 'mock-key');

// Create instance of email sender to test the URL transformation
const emailSender = new DailyBriefEmailSender(mockSupabase);

// Access the private method for testing (using any to bypass TypeScript)
const transformUrls = (emailSender as any).transformMarkdownUrls.bind(emailSender);

// Test cases
const testCases = [
	{
		name: 'Markdown links',
		input: 'Check out [this project](/projects/123e4567-e89b-12d3-a456-426614174000) for details.',
		expected: 'Check out [this project](https://build-os.com/projects/123e4567-e89b-12d3-a456-426614174000) for details.'
	},
	{
		name: 'Multiple markdown links',
		input: 'See [Project A](/projects/a1b2c3d4-e5f6-7890-abcd-ef1234567890) and [Task B](/tasks/task-123)',
		expected: 'See [Project A](https://build-os.com/projects/a1b2c3d4-e5f6-7890-abcd-ef1234567890) and [Task B](https://build-os.com/tasks/task-123)'
	},
	{
		name: 'Image links',
		input: '![Screenshot](/assets/screenshot.png)',
		expected: '![Screenshot](https://build-os.com/assets/screenshot.png)'
	},
	{
		name: 'Reference-style links',
		input: '[project]: /projects/98765432-10ab-cdef-0123-456789abcdef\nCheck the [project] for more.',
		expected: '[project]: https://build-os.com/projects/98765432-10ab-cdef-0123-456789abcdef\nCheck the [project] for more.'
	},
	{
		name: 'HTML links in markdown',
		input: 'Click <a href="/projects/f47ac10b-58cc-4372-a567-0e02b2c3d479">here</a> to view',
		expected: 'Click <a href="https://build-os.com/projects/f47ac10b-58cc-4372-a567-0e02b2c3d479">here</a> to view'
	},
	{
		name: 'Plain text URLs',
		input: 'View your project at: /projects/550e8400-e29b-41d4-a716-446655440000',
		expected: 'View your project at: https://build-os.com/projects/550e8400-e29b-41d4-a716-446655440000'
	},
	{
		name: 'URLs in lists',
		input: '- Task 1: /tasks/task-1\n- Note: /notes/note-456',
		expected: '- Task 1: https://build-os.com/tasks/task-1\n- Note: https://build-os.com/notes/note-456'
	},
	{
		name: 'Mixed content',
		input: `# Daily Brief

Check [Project Alpha](/projects/6ba7b810-9dad-11d1-80b4-00c04fd430c8) for updates.

## Tasks
- Review: /tasks/review-123
- Complete [this task](/tasks/complete-456)

View phase: /phases/phase-789`,
		expected: `# Daily Brief

Check [Project Alpha](https://build-os.com/projects/6ba7b810-9dad-11d1-80b4-00c04fd430c8) for updates.

## Tasks
- Review: https://build-os.com/tasks/review-123
- Complete [this task](https://build-os.com/tasks/complete-456)

View phase: https://build-os.com/phases/phase-789`
	},
	{
		name: 'Should not transform external URLs',
		input: 'External link: [Google](https://google.com) and internal [project](/projects/6ba7b811-9dad-11d1-80b4-00c04fd430c8)',
		expected: 'External link: [Google](https://google.com) and internal [project](https://build-os.com/projects/6ba7b811-9dad-11d1-80b4-00c04fd430c8)'
	},
	{
		name: 'Should not transform already absolute URLs',
		input: 'Already absolute: https://build-os.com/projects/6ba7b812-9dad-11d1-80b4-00c04fd430c8',
		expected: 'Already absolute: https://build-os.com/projects/6ba7b812-9dad-11d1-80b4-00c04fd430c8'
	}
];

console.log('🧪 Testing URL Transformation in Email Content\n');
console.log('=' .repeat(60));

let passed = 0;
let failed = 0;

testCases.forEach((testCase, index) => {
	const result = transformUrls(testCase.input);
	const success = result === testCase.expected;
	
	if (success) {
		console.log(`✅ Test ${index + 1}: ${testCase.name}`);
		passed++;
	} else {
		console.log(`❌ Test ${index + 1}: ${testCase.name}`);
		console.log(`   Input:    "${testCase.input}"`);
		console.log(`   Expected: "${testCase.expected}"`);
		console.log(`   Got:      "${result}"`);
		failed++;
	}
});

console.log('\n' + '=' .repeat(60));
console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
	process.exit(1);
}

console.log('✅ All URL transformation tests passed!');
console.log('\n📝 URL Transformation Summary:');
console.log('  - Transforms relative markdown links to absolute');
console.log('  - Handles image links, reference links, and HTML');
console.log('  - Transforms plain text URLs for common paths');
console.log('  - Preserves external and already absolute URLs');
console.log('  - All internal links now point to https://build-os.com');