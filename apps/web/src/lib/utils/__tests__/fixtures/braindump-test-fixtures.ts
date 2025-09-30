// apps/web/src/lib/utils/__tests__/fixtures/braindump-test-fixtures.ts

export const braindumpFixtures = {
	// Short braindumps (< 500 chars)
	short: {
		simpleTasks: 'Fix login bug. Update database schema. Deploy to production.',
		withContext: 'Project pivoting to B2B. Add enterprise SSO feature.',
		questionResponse: 'Timeline is Q2 2025. Budget is $50k.',
		empty: '',
		whitespace: '   \n\n   ',
		boundary499: 'x'.repeat(499),
		boundary500: 'x'.repeat(500),
		boundary501: 'x'.repeat(501)
	},

	// Long braindumps (>= 500 chars)
	long: {
		comprehensive: `## Project Update

We need to completely revamp our authentication system to support enterprise SSO. 
This includes:
- SAML 2.0 integration
- OIDC support
- Multi-factor authentication
- Session management improvements

The timeline for this is Q2 2025, with a budget of $50k allocated.
Key stakeholders are the security team and enterprise customers.

Technical challenges include maintaining backward compatibility while 
implementing the new auth flow. We'll need to set up a proper testing 
environment with various IdP providers.`.repeat(2),

		taskFocused: Array(20)
			.fill('Task')
			.map(
				(t, i) =>
					`${i + 1}. ${t}: Implement feature ${i + 1} with proper error handling and tests`
			)
			.join('\n'),

		strategic: `Our platform needs to pivot from B2C to B2B market. This strategic shift 
requires fundamental changes to our product architecture, pricing model, and 
go-to-market strategy. We need to focus on enterprise features like SSO, 
audit logs, and admin dashboards. The existing consumer features will be 
maintained but not actively developed.`.repeat(3)
	},

	// Dual processing triggers (>= 5000 chars)
	dual: {
		large: 'x'.repeat(5500),
		complex: `${Array(50).fill('Complex task with detailed requirements').join('. ')}`.repeat(
			10
		),
		withExistingContext: {
			braindump: 'x'.repeat(4500),
			existingContext: 'y'.repeat(4000) // Combined > 8000
		}
	},

	// Question-specific braindumps
	questions: {
		answersAll: `
Regarding the timeline: We're targeting Q2 2025 for the initial release.
The key stakeholders are the product team, engineering, and our enterprise customers.
Main technical challenges include scaling the infrastructure and maintaining uptime.
		`,
		answersPartial: `
The timeline is Q2 2025. We haven't finalized the stakeholder list yet.
		`,
		noAnswers: `
Let's focus on implementing the core features first. We can discuss details later.
		`
	},

	// Edge cases
	edgeCases: {
		sqlInjection: "'; DROP TABLE users; --",
		specialChars: '🚀 Unicode test 你好 мир ♠♣♥♦',
		markdown: `
# Header 1
## Header 2
### Header 3
\`\`\`code
function test() {}
\`\`\`
| Table | Column |
|-------|--------|
| test  | value  |
		`,
		nestedStructure: {
			level1: {
				level2: {
					level3: 'Deeply nested content'
				}
			}
		},
		circularReference: '[task-1] depends on [task-2]. [task-2] depends on [task-1].',
		selfReference: '[task-1] is blocked by [task-1]',
		invalidReferences: 'Update [task-invalid-uuid] and [project-nonexistent]'
	}
};

export const mockProjects = {
	existing: {
		simple: {
			id: 'proj-123',
			user_id: 'user-123',
			name: 'Simple Project',
			slug: 'simple-project',
			description: 'A simple test project',
			context: '## Overview\nSimple project for testing',
			executive_summary: 'Test project',
			status: 'active' as const,
			tags: ['test'],
			created_at: '2024-01-01T00:00:00Z',
			updated_at: '2024-01-01T00:00:00Z'
		},
		withTasks: {
			id: 'proj-with-tasks',
			user_id: 'user-123',
			name: 'Project with Tasks',
			slug: 'project-with-tasks',
			context: '## Current State\nProject with existing tasks',
			status: 'active' as const,
			tasks: [
				{
					id: 'task-1',
					title: 'Existing Task 1',
					description: 'First task',
					status: 'backlog' as const,
					priority: 'medium' as const,
					project_id: 'proj-with-tasks',
					user_id: 'user-123'
				},
				{
					id: 'task-2',
					title: 'Existing Task 2',
					description: 'Second task',
					status: 'in_progress' as const,
					priority: 'high' as const,
					project_id: 'proj-with-tasks',
					user_id: 'user-123'
				}
			],
			notes: []
		},
		largeContext: {
			id: 'proj-large',
			user_id: 'user-123',
			name: 'Large Context Project',
			context: 'x'.repeat(4000), // Large existing context
			status: 'active' as const
		}
	}
};

export const mockQuestions = {
	displayed: [
		{
			id: 'q1',
			project_id: 'proj-123',
			question: 'What is the timeline for this project?',
			category: 'planning',
			priority: 'high',
			status: 'pending',
			created_at: '2024-01-01T00:00:00Z'
		},
		{
			id: 'q2',
			project_id: 'proj-123',
			question: 'Who are the key stakeholders?',
			category: 'clarification',
			priority: 'medium',
			status: 'pending',
			created_at: '2024-01-01T00:00:00Z'
		},
		{
			id: 'q3',
			project_id: 'proj-123',
			question: 'What are the main technical challenges?',
			category: 'risk',
			priority: 'high',
			status: 'pending',
			created_at: '2024-01-01T00:00:00Z'
		}
	],
	generated: [
		{
			question: 'What are the success metrics?',
			category: 'planning',
			priority: 'high',
			context: 'Need clear KPIs',
			expectedOutcome: 'Measurable success criteria'
		},
		{
			question: 'What is the budget allocation?',
			category: 'resource',
			priority: 'medium',
			context: 'Resource planning',
			expectedOutcome: 'Budget breakdown'
		},
		{
			question: 'What are the deployment requirements?',
			category: 'planning',
			priority: 'low',
			context: 'Infrastructure needs',
			expectedOutcome: 'Deployment checklist'
		}
	]
};

export const mockLLMResponses = {
	newProject: {
		withContext: {
			title: 'New Project Creation',
			summary: 'Creating comprehensive new project',
			insights: 'Well-structured project plan',
			operations: [
				{
					table: 'projects',
					operation: 'create',
					ref: 'new-project-1',
					data: {
						name: 'Test Project',
						slug: 'test-project',
						description: 'A comprehensive test project',
						context: '## Project Overview\nDetailed project context...',
						executive_summary: 'Test project for validation',
						tags: ['test', 'validation'],
						status: 'active',
						start_date: '2024-01-01',
						end_date: '2024-12-31'
					}
				}
			],
			projectQuestions: mockQuestions.generated
		},
		taskOnly: {
			title: 'Task Collection',
			summary: 'Collection of tasks without strategic context',
			insights: 'Task-focused execution',
			operations: [
				{
					table: 'projects',
					operation: 'create',
					ref: 'new-project-1',
					data: {
						name: 'Task Project',
						slug: 'task-project',
						description: 'Task collection',
						context: null,
						executive_summary: null,
						tags: ['tasks'],
						status: 'active'
					}
				},
				{
					table: 'tasks',
					operation: 'create',
					data: {
						title: 'Task 1',
						description: 'First task',
						project_ref: 'new-project-1',
						priority: 'medium',
						status: 'backlog'
					}
				}
			]
		}
	},

	existingProject: {
		contextUpdate: {
			title: 'Project Update',
			summary: 'Updating existing project',
			insights: 'Strategic changes',
			operations: [
				{
					table: 'projects',
					operation: 'update',
					data: {
						id: 'proj-123',
						context: '## Updated Context\nNew strategic direction...'
					}
				}
			],
			questionAnalysis: {
				q1: { wasAnswered: true, answerContent: 'Q2 2025' }
			},
			projectQuestions: mockQuestions.generated
		},
		taskUpdate: {
			title: 'Task Updates',
			summary: 'Updating task statuses',
			insights: 'Progress on execution',
			operations: [
				{
					table: 'tasks',
					operation: 'update',
					data: {
						id: 'task-1',
						status: 'in_progress',
						details: 'Added implementation notes'
					}
				},
				{
					table: 'tasks',
					operation: 'create',
					data: {
						title: 'New follow-up task',
						project_id: 'proj-123'
					}
				}
			]
		}
	},

	shortBraindump: {
		noContextUpdate: {
			tasks: [
				{
					title: 'Quick fix',
					description: 'Fix the bug',
					priority: 'high',
					status: 'backlog'
				}
			],
			requiresContextUpdate: false,
			contextUpdateReason: null,
			questionAnalysis: {}
		},
		withContextUpdate: {
			tasks: [
				{
					title: 'Strategic task',
					description: 'Implement pivot',
					priority: 'high',
					status: 'backlog'
				}
			],
			requiresContextUpdate: true,
			contextUpdateReason: 'Strategic pivot affects project scope',
			questionAnalysis: {
				q1: { wasAnswered: true, answerContent: 'Q2 2025' }
			}
		}
	},

	dualProcessing: {
		contextStream: {
			title: 'Context Processing',
			summary: 'Processing project context',
			insights: 'Strategic overview',
			projectCreate: {
				name: 'Dual Project',
				slug: 'dual-project',
				context: '## Comprehensive Context',
				executive_summary: 'Dual processing test'
			},
			projectQuestions: mockQuestions.generated
		},
		taskStream: {
			tasks: [
				{ title: 'Task 1', operation: 'create', project_ref: 'new-project-1' },
				{ title: 'Task 2', operation: 'create', project_ref: 'new-project-1' }
			],
			notes: [{ title: 'Note 1', content: 'Important note', project_ref: 'new-project-1' }],
			questionAnalysis: {
				q1: { wasAnswered: false, answerContent: null }
			}
		}
	},

	errors: {
		invalidJSON: 'This is not valid JSON',
		missingOperations: {
			title: 'Missing Ops',
			summary: 'No operations array'
			// Missing operations field
		},
		malformedOperation: {
			title: 'Bad Op',
			operations: [
				{
					// Missing required fields
					data: { title: 'Test' }
				}
			]
		}
	}
};

export const testUsers = {
	regular: {
		id: 'user-123',
		email: 'test@example.com',
		role: 'user'
	},
	admin: {
		id: 'admin-123',
		email: 'admin@example.com',
		role: 'admin'
	}
};

export class BraindumpTestHelpers {
	static generateBraindump(
		length: number,
		type: 'tasks' | 'context' | 'mixed' = 'mixed'
	): string {
		const templates = {
			tasks: [
				'Implement user authentication',
				'Fix database connection issues',
				'Update API documentation',
				'Add unit tests for services',
				'Optimize query performance'
			],
			context: [
				'We need to pivot our strategy',
				'The market is shifting towards enterprise',
				'Our architecture needs to be more scalable',
				'Customer feedback indicates new priorities',
				'Technical debt is becoming a blocker'
			],
			mixed: [
				'Update the login feature to support SSO',
				'Strategic shift: Focus on enterprise market',
				'Task: Implement audit logging',
				'Context: Security is now top priority',
				'Deploy new monitoring solution'
			]
		};

		const items = templates[type];
		let result = '';

		while (result.length < length) {
			const item = items[Math.floor(Math.random() * items.length)];
			result += item + '. ';
		}

		return result.substring(0, length);
	}

	static createMockLLMResponse(type: 'success' | 'error' | 'partial', options: any = {}) {
		if (type === 'error') {
			throw new Error(options.message || 'LLM request failed');
		}

		if (type === 'partial') {
			return {
				result: {
					title: options.title || 'Partial Response',
					operations: options.operations || []
					// Intentionally incomplete
				}
			};
		}

		return {
			result: {
				title: options.title || 'Success Response',
				summary: options.summary || 'Successful processing',
				insights: options.insights || 'Insights from processing',
				operations: options.operations || [],
				questionAnalysis: options.questionAnalysis,
				projectQuestions: options.projectQuestions
			}
		};
	}

	static assertValidOperation(operation: any) {
		expect(operation).toHaveProperty('id');
		expect(operation).toHaveProperty('table');
		expect(operation).toHaveProperty('operation');
		expect(operation).toHaveProperty('data');
		expect(operation).toHaveProperty('enabled');

		// Table should be valid
		expect(['projects', 'tasks', 'notes', 'phases']).toContain(operation.table);

		// Operation should be valid
		expect(['create', 'update', 'delete']).toContain(operation.operation);

		// Data should have user_id
		if (operation.operation === 'create') {
			expect(operation.data).toHaveProperty('user_id');
		}
	}

	static assertValidQuestions(questions: any[]) {
		expect(Array.isArray(questions)).toBe(true);

		questions.forEach((q) => {
			expect(q).toHaveProperty('question');
			expect(q).toHaveProperty('category');
			expect(q).toHaveProperty('priority');
			expect(['clarification', 'decision', 'planning', 'risk', 'resource']).toContain(
				q.category
			);
			expect(['high', 'medium', 'low']).toContain(q.priority);
		});
	}

	static assertProjectReferences(operations: any[]) {
		const projectCreate = operations.find(
			(op) => op.table === 'projects' && op.operation === 'create'
		);

		if (projectCreate && projectCreate.ref) {
			const ref = projectCreate.ref;

			// All tasks/notes should reference this project
			operations
				.filter((op) => ['tasks', 'notes'].includes(op.table))
				.forEach((op) => {
					if (op.operation === 'create') {
						expect(op.data.project_id || op.data.project_ref).toBeDefined();

						if (op.data.project_ref) {
							expect(op.data.project_ref).toBe(ref);
						}
					}
				});
		}
	}
}
