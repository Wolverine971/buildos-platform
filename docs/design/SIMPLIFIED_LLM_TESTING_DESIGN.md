# Simplified LLM Testing Strategy

## Core Philosophy: Inline, Simple, Focused

The new LLM testing approach prioritizes:

1. **SIMPLICITY**: Brain dumps directly in test files, minimal abstractions
2. **FOCUS**: Test data model structure, not exact content
3. **RELIABILITY**: Loose validation that doesn't break on minor LLM variations
4. **SPEED**: Fast execution without complex setup

## New Test Structure

```
src/lib/tests/llm-simple/
├── __tests__/
│   ├── new-project-creation.test.ts      # Small & Large projects
│   ├── single-task-creation.test.ts      # Single task scenarios
│   ├── multi-task-creation.test.ts       # 3-4 task scenarios
│   └── existing-project-updates.test.ts  # Context & task updates
├── helpers/
│   └── simple-llm-runner.ts             # Minimal test helper
└── schemas/
    └── loose-validation.ts               # Structure-focused validation
```

## Key Improvements

### 1. Inline Brain Dumps

```typescript
// OLD: External fixtures that are hard to find and maintain
const result = await llmTestRunner.processNewProject(fixtures.brainDumps.smallProject);

// NEW: Inline brain dumps that are easy to read and modify
const result = await processNewProject(`
  I want to create a personal blog using SvelteKit. The blog should have:
  - A homepage with recent posts  
  - Individual post pages
  - An about page
  - RSS feed generation

  The design should be clean and minimal, focusing on readability.
`);
```

### 2. Minimal Helper (no complex mocking)

```typescript
// simple-llm-runner.ts
export async function processNewProject(brainDump: string): Promise<BrainDumpParseResult> {
	const processor = new BrainDumpProcessor(supabase); // Use real supabase in test env

	return processor.processBrainDump({
		brainDump,
		userId: 'test-user-123',
		brainDumpId: 'test-brain-dump-123',
		options: { autoExecute: false, streamResults: false }
	});
}

export async function processExistingProject(
	brainDump: string,
	projectId: string
): Promise<BrainDumpParseResult> {
	// Simple implementation without complex mocking
}
```

### 3. Structure-Focused Validation

```typescript
// loose-validation.ts
export function validateProjectCreation(operations: ParsedOperation[]) {
	// Test structure, not exact content
	expect(operations).toHaveLength.toBeGreaterThan(1);

	const projectOp = operations[0];
	expect(projectOp.table).toBe('projects');
	expect(projectOp.operation).toBe('create');
	expect(projectOp.data.name).toBeTruthy();
	expect(projectOp.data.slug).toBeTruthy();
	expect(projectOp.ref).toBeTruthy();

	// Flexible task validation
	const taskOps = operations.slice(1).filter((op) => op.table === 'tasks');
	expect(taskOps.length).toBeGreaterThan(0);

	taskOps.forEach((task) => {
		expect(task.data.title).toBeTruthy();
		expect(task.data.project_ref).toBeTruthy();
	});
}
```

## Test Categories & Examples

### 1. New Project Creation Tests

```typescript
describe('New Project Creation', () => {
	it('creates small project (2-3 tasks)', async () => {
		const result = await processNewProject(`
      I want to create a simple todo app with React.
      Features needed:
      - Add new tasks
      - Mark tasks complete  
      - Delete tasks
    `);

		validateProjectCreation(result.operations);
		expect(result.operations).toHaveLength.toBeLessThanOrEqual(4); // 1 project + max 3 tasks
	});

	it('creates large project (8+ tasks)', async () => {
		const result = await processNewProject(`
      # E-commerce Platform Development

      I'm building a comprehensive e-commerce platform with:

      ## Core Features
      - User authentication system
      - Product catalog with search
      - Shopping cart functionality  
      - Payment processing (Stripe)
      - Order management
      - Customer dashboard
      - Admin panel
      - Inventory tracking
      - Email notifications
      - Analytics dashboard

      ## Technical Stack
      - Next.js frontend
      - PostgreSQL database
      - Redis caching
      - AWS deployment

      This is a complex project targeting small businesses.
    `);

		validateProjectCreation(result.operations);
		expect(result.operations).toHaveLength.toBeGreaterThan(8);
		expect(result.operations[0].data.context).toContain('##'); // Should have structured context
	});
});
```

### 2. Single Task Creation Tests

```typescript
describe('Single Task Creation', () => {
	it('creates focused task with comprehensive details', async () => {
		const result = await processNewProject(`
      I need to integrate Stripe payment API into our checkout flow.
      
      Requirements:
      - Set up webhook endpoints
      - Handle payment failures
      - Update database with payment status  
      - Send confirmation emails
      
      This needs to be done by Friday for product launch.
    `);

		validateProjectCreation(result.operations);

		const taskOp = result.operations.find((op) => op.table === 'tasks');
		expect(taskOp.data.title.toLowerCase()).toMatch(/stripe|payment|api/);
		expect(taskOp.data.details || taskOp.data.description).toContain('webhook');
	});
});
```

### 3. Multi-Task Creation Tests

```typescript
describe('Multi-Task Creation', () => {
	it('creates 3-4 related tasks for landing page', async () => {
		const result = await processNewProject(`
      Create a landing page for our product launch:

      1. Hero section with signup form
      2. Feature showcase with icons 
      3. Pricing table with comparison
      4. Footer with contact info

      Should be mobile-responsive and SEO optimized.
    `);

		validateProjectCreation(result.operations);

		const taskOps = result.operations.filter((op) => op.table === 'tasks');
		expect(taskOps).toHaveLength.toBeGreaterThanOrEqual(3);
		expect(taskOps).toHaveLength.toBeLessThanOrEqual(4);

		const titles = taskOps.map((t) => t.data.title.toLowerCase()).join(' ');
		expect(titles).toMatch(/hero|feature|pricing/);
	});
});
```

### 4. Existing Project Updates

```typescript
describe('Existing Project Updates', () => {
	it('updates project context with new information', async () => {
		const result = await processExistingProject(
			`
      Project update: We've decided to add AI-powered recommendations 
      to the e-commerce platform based on user feedback.
      
      This will require:
      - Machine learning model integration
      - User behavior tracking  
      - Recommendation API endpoints
    `,
			'existing-project-123'
		);

		const projectUpdate = result.operations.find(
			(op) => op.table === 'projects' && op.operation === 'update'
		);
		expect(projectUpdate).toBeTruthy();
		expect(projectUpdate.data.context).toContain('AI-powered');
	});

	it('creates recurring tasks', async () => {
		const result = await processExistingProject(
			`
      Set up weekly team standup meetings every Monday at 10am.
      Also need daily automated backups at midnight.
    `,
			'existing-project-123'
		);

		const recurringTasks = result.operations.filter(
			(op) => op.table === 'tasks' && op.data.task_type === 'recurring'
		);
		expect(recurringTasks.length).toBeGreaterThan(0);

		expect(
			recurringTasks.some((t) => ['weekly', 'daily'].includes(t.data.recurrence_pattern))
		).toBe(true);
	});
});
```

## Package.json Commands

Keep existing commands but add simplified version:

```json
{
	"scripts": {
		"test:llm": "vitest run src/lib/tests/llm-simple --testTimeout=20000",
		"test:llm:watch": "vitest src/lib/tests/llm-simple --testTimeout=20000",
		"test:llm:fast": "vitest run src/lib/tests/llm-simple --testTimeout=15000 --reporter=dot"
	}
}
```

## Benefits of This Approach

### 1. **Maintainability**

- Brain dumps visible in test files
- No external fixtures to manage
- Fewer abstractions to understand

### 2. **Reliability**

- Tests focus on structure, not exact content
- Flexible validation that doesn't break on minor LLM changes
- Less complex mocking that can fail

### 3. **Speed**

- Minimal setup overhead
- No complex mock initialization
- Direct testing of what matters

### 4. **Understanding**

- Tests are self-contained and readable
- Easy to add new test cases
- Clear what each test is validating

## Migration Strategy

1. **Create new simplified tests** in `src/lib/tests/llm-simple/`
2. **Keep old tests** for reference during transition
3. **Update package.json** to point to new location
4. **Remove old tests** once new ones are proven stable

This approach prioritizes practical testing over perfect coverage, focusing on what actually matters for the brain-dump-processor functionality.
