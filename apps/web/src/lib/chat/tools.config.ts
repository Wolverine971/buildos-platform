// apps/web/src/lib/chat/tools.config.ts
/**
 * Chat Tool Definitions - Progressive Disclosure Pattern
 *
 * This module defines the tools available to the chat system, organized in two tiers:
 * 1. LIST/SEARCH tools - Return abbreviated data (reduce tokens by ~70%)
 * 2. DETAIL tools - Return complete data (only when explicitly needed)
 */

import type { ChatToolDefinition } from '@buildos/shared-types';

/**
 * Curated field information for entities
 * This provides the LLM with authoritative information about field types,
 * valid values, and descriptions for commonly-queried fields.
 */
export interface FieldInfo {
	type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'enum';
	description: string;
	required?: boolean;
	enum_values?: string[];
	example?: string;
}

export const ENTITY_FIELD_INFO: Record<string, Record<string, FieldInfo>> = {
	project: {
		status: {
			type: 'enum',
			enum_values: ['active', 'paused', 'completed', 'archived'],
			description:
				'Project lifecycle status. Use "active" for ongoing work, "paused" for temporarily stopped projects, "completed" for finished projects, "archived" to hide from active view.',
			required: true,
			example: 'active'
		},
		name: {
			type: 'string',
			description: 'Project name or title',
			required: true,
			example: 'Website Redesign'
		},
		description: {
			type: 'string',
			description: 'Brief description of the project',
			required: false,
			example: 'Redesign company website with modern UI'
		},
		start_date: {
			type: 'date',
			description: 'Project start date (ISO 8601 format: YYYY-MM-DD)',
			required: false,
			example: '2025-11-01'
		},
		end_date: {
			type: 'date',
			description: 'Target completion date (ISO 8601 format: YYYY-MM-DD)',
			required: false,
			example: '2025-12-31'
		},
		tags: {
			type: 'array',
			description: 'Tags for categorizing and filtering projects',
			required: false,
			example: '["design", "web", "high-priority"]'
		},
		context: {
			type: 'string',
			description:
				"Living project narrative in markdown. Strategic overview that captures WHY the project matters, WHAT we're doing, HOW we're approaching it, and the evolution of thinking. Not a task list.",
			required: false,
			example:
				'## Project Origin\n\nStarted in Q4 2025 to modernize our web presence...\n\n**[2025-10-15]** Pivot: Focus on mobile-first after user research...'
		},
		core_integrity_ideals: {
			type: 'string',
			description:
				'Ideal end-state, quality standards, and non-negotiables. Defines what "done right" looks like (markdown format).',
			required: false,
			example:
				'## Quality Standards\n- 95+ Lighthouse score\n- WCAG 2.1 AA compliance\n- Sub-2s load time'
		},
		core_people_bonds: {
			type: 'string',
			description:
				"Team members, stakeholders, roles, and relationship dynamics. Who's involved and how they work together (markdown format).",
			required: false,
			example:
				'**Team:**\n- Sarah (Design Lead) - final UI approval\n- Dev team (3 engineers)\n\n**Stakeholders:** Marketing VP needs weekly updates'
		},
		core_goals_momentum: {
			type: 'string',
			description:
				'Milestones, deliverables, metrics, and timeline. How progress is measured and maintained (markdown format).',
			required: false,
			example:
				'**Phase 1:** Designs by Nov 15\n**Phase 2:** Dev complete Dec 1\n**Launch:** Dec 15\n\n*KPI:* 50% increase in mobile conversions'
		},
		core_meaning_identity: {
			type: 'string',
			description:
				"Why this project matters, its unique value, and strategic positioning. The project's purpose and differentiation (markdown format).",
			required: false,
			example:
				'This positions us as a modern, user-first brand. Differentiator: Accessibility-first design that competitors lack.'
		},
		core_reality_understanding: {
			type: 'string',
			description:
				'Current state, constraints, and environmental factors. Ground truth that informs planning (markdown format).',
			required: false,
			example:
				'**Current site:** Built in 2018, no mobile optimization, 60% bounce rate on mobile.\n\n**Constraints:** Limited budget, must use existing CMS'
		},
		core_trust_safeguards: {
			type: 'string',
			description:
				'Risks, mitigations, contingencies, and reliability measures. What could go wrong and how to prevent it (markdown format).',
			required: false,
			example:
				'**Risk:** Timeline tight for holidays\n**Mitigation:** Soft launch Dec 10 with rollback plan\n\n**Backup:** Staged rollout to 10% traffic first'
		},
		core_opportunity_freedom: {
			type: 'string',
			description:
				'Alternative approaches, experiments, and pivot options. Maintaining adaptability and exploring possibilities (markdown format).',
			required: false,
			example:
				'**Exploring:**\n- A/B test hero layouts\n- Consider headless CMS migration (phase 2?)\n- Potential partnership with accessibility consultants'
		},
		core_power_resources: {
			type: 'string',
			description:
				'Budget, tools, infrastructure, and permissions. Available resources and their constraints (markdown format).',
			required: false,
			example:
				'**Budget:** $50k total\n**Tools:** Figma (licensed), Vercel hosting\n**Team capacity:** 3 devs @ 50% allocation\n\n*No budget for additional licenses*'
		},
		core_harmony_integration: {
			type: 'string',
			description:
				'Feedback loops, integration points, and learning mechanisms. How the project evolves and connects with other systems (markdown format).',
			required: false,
			example:
				'**Weekly design reviews** with stakeholders\n\n**Integrations:** Marketing automation (HubSpot), Analytics (GA4)\n\n*Learning:* User testing every 2 weeks'
		}
	},
	task: {
		status: {
			type: 'enum',
			enum_values: ['backlog', 'in_progress', 'done', 'blocked'],
			description:
				'Task completion status. Tasks typically move: backlog → in_progress → done. Use "blocked" for tasks waiting on dependencies or external factors.',
			required: true,
			example: 'in_progress'
		},
		priority: {
			type: 'enum',
			enum_values: ['low', 'medium', 'high'],
			description: 'Task priority level for scheduling and focus',
			required: true,
			example: 'high'
		},
		title: {
			type: 'string',
			description: 'Task title or name',
			required: true,
			example: 'Create homepage mockup'
		},
		description: {
			type: 'string',
			description: 'Brief description of what needs to be done',
			required: false,
			example: 'Design the landing page layout with hero section and features'
		},
		start_date: {
			type: 'date',
			description: 'Scheduled start date (ISO 8601 format: YYYY-MM-DD)',
			required: false,
			example: '2025-11-05'
		},
		duration_minutes: {
			type: 'number',
			description: 'Estimated time to complete in minutes',
			required: false,
			example: '60'
		},
		task_type: {
			type: 'enum',
			enum_values: ['one_off', 'recurring'],
			description: 'Whether this is a one-time task or recurring task',
			required: false,
			example: 'one_off'
		},
		recurrence_pattern: {
			type: 'enum',
			enum_values: ['daily', 'weekdays', 'weekly', 'biweekly', 'monthly'],
			description: 'For recurring tasks, the repetition pattern',
			required: false,
			example: 'weekly'
		}
	},
	note: {
		title: {
			type: 'string',
			description: 'Note title',
			required: false,
			example: 'Meeting notes - Design review'
		},
		content: {
			type: 'string',
			description: 'Note content (markdown supported)',
			required: true,
			example: '# Key decisions\n- Use blue color scheme\n- Launch in Q4'
		},
		category: {
			type: 'string',
			description: 'Note category for organization',
			required: false,
			example: 'meeting-notes'
		},
		tags: {
			type: 'array',
			description: 'Tags for categorizing notes',
			required: false,
			example: '["design", "decisions"]'
		}
	},
	brain_dump: {
		content: {
			type: 'string',
			description: 'Stream-of-consciousness content that will be processed by AI',
			required: true,
			example:
				'Need to redesign the homepage, add user testimonials, and improve mobile experience...'
		},
		status: {
			type: 'enum',
			enum_values: ['pending', 'processing', 'completed', 'failed'],
			description: 'Processing status of the brain dump',
			required: false,
			example: 'completed'
		}
	}
};

/**
 * Complete set of tools available to the chat system
 * Tools are organized by category for the progressive disclosure pattern
 */
export const CHAT_TOOLS: ChatToolDefinition[] = [
	// ============================================
	// LIST/SEARCH TOOLS (Abbreviated Results)
	// ============================================

	{
		type: 'function',
		function: {
			name: 'list_tasks',
			description: `Get abbreviated list of tasks. Returns task summaries with first 100 chars of descriptions.
Use get_task_details for complete information about specific tasks.`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Filter by specific project'
					},
					status: {
						type: 'array',
						items: {
							type: 'string',
							enum: ['backlog', 'in_progress', 'done', 'blocked']
						},
						description: 'Filter by status (multiple allowed)'
					},
					priority: {
						type: 'array',
						items: {
							type: 'string',
							enum: ['low', 'medium', 'high']
						},
						description: 'Filter by priority (multiple allowed)'
					},
					has_date: {
						type: 'boolean',
						description: 'Only tasks with start_date'
					},
					limit: {
						type: 'number',
						default: 20,
						maximum: 50,
						description: 'Maximum tasks to return'
					},
					sort_by: {
						type: 'string',
						enum: ['priority', 'start_date', 'created_at'],
						default: 'priority'
					}
				}
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'search_projects',
			description: `Search projects returning abbreviated info with 500 char context preview.
Use get_project_details for full context and detailed information.`,
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description: 'Search in name, description, tags'
					},
					status: {
						type: 'string',
						enum: ['active', 'paused', 'completed', 'archived']
					},
					has_active_tasks: {
						type: 'boolean',
						description: 'Only projects with active tasks'
					},
					limit: {
						type: 'number',
						default: 10,
						maximum: 20
					}
				}
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'search_notes',
			description: `Search notes returning abbreviated content (200 char preview).
Use get_note_details for full content.`,
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description: 'Search in title and content'
					},
					project_id: {
						type: 'string',
						description: 'Filter by project'
					},
					category: {
						type: 'string',
						description: 'Filter by category'
					},
					limit: {
						type: 'number',
						default: 10
					}
				}
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'search_brain_dumps',
			description: `Search brain dumps with AI summaries. Returns abbreviated information.`,
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description: 'Search in content and summaries'
					},
					project_id: {
						type: 'string',
						description: 'Filter by project'
					},
					status: {
						type: 'string',
						enum: ['pending', 'processing', 'completed', 'failed']
					},
					limit: {
						type: 'number',
						default: 10
					}
				}
			}
		}
	},

	// ============================================
	// DETAIL TOOLS (Complete Information)
	// ============================================

	{
		type: 'function',
		function: {
			name: 'get_task_details',
			description: `Get COMPLETE details for a specific task including full descriptions,
all subtasks, dependencies, and parent project context.`,
			parameters: {
				type: 'object',
				properties: {
					task_id: {
						type: 'string',
						description: 'Task ID from list_tasks'
					},
					include_subtasks: {
						type: 'boolean',
						default: true,
						description: 'Include full subtask details'
					},
					include_project_context: {
						type: 'boolean',
						default: false,
						description: 'Include parent project context'
					}
				},
				required: ['task_id']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'get_project_details',
			description: `Get COMPLETE project details including full context, core dimensions,
all phases, and optionally tasks and notes.`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Project ID from search_projects'
					},
					include_tasks: {
						type: 'boolean',
						default: false,
						description: 'Include abbreviated task list'
					},
					include_phases: {
						type: 'boolean',
						default: true,
						description: 'Include project phases'
					},
					include_notes: {
						type: 'boolean',
						default: false,
						description: 'Include recent notes (abbreviated)'
					},
					include_brain_dumps: {
						type: 'boolean',
						default: false,
						description: 'Include recent brain dumps'
					}
				},
				required: ['project_id']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'get_note_details',
			description: 'Get complete note content',
			parameters: {
				type: 'object',
				properties: {
					note_id: {
						type: 'string',
						description: 'Note ID from search_notes'
					}
				},
				required: ['note_id']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'get_brain_dump_details',
			description: 'Get complete brain dump content with all extracted operations',
			parameters: {
				type: 'object',
				properties: {
					brain_dump_id: {
						type: 'string',
						description: 'Brain dump ID from search_brain_dumps'
					}
				},
				required: ['brain_dump_id']
			}
		}
	},

	// ============================================
	// ACTION TOOLS (Mutations)
	// ============================================

	{
		type: 'function',
		function: {
			name: 'create_task',
			description: 'Create a new task',
			parameters: {
				type: 'object',
				properties: {
					title: {
						type: 'string',
						description: 'Task title'
					},
					description: {
						type: 'string',
						description: 'Task description'
					},
					project_id: {
						type: 'string',
						description: 'Project to assign task to'
					},
					priority: {
						type: 'string',
						enum: ['low', 'medium', 'high'],
						default: 'medium',
						description: 'Task priority'
					},
					task_type: {
						type: 'string',
						enum: ['one_off', 'recurring'],
						default: 'one_off',
						description: 'One-time or recurring task'
					},
					duration_minutes: {
						type: 'number',
						default: 60,
						description: 'Estimated duration in minutes'
					},
					start_date: {
						type: 'string',
						format: 'date',
						description: 'Start date (YYYY-MM-DD format)'
					},
					parent_task_id: {
						type: 'string',
						description: 'Create as subtask of another task'
					}
				},
				required: ['title']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'update_task',
			description: 'Update an existing task',
			parameters: {
				type: 'object',
				properties: {
					task_id: {
						type: 'string',
						description: 'Task ID to update'
					},
					updates: {
						type: 'object',
						properties: {
							title: {
								type: 'string',
								description: 'New title'
							},
							description: {
								type: 'string',
								description: 'New description'
							},
							details: {
								type: 'string',
								description: 'New details'
							},
							status: {
								type: 'string',
								enum: ['backlog', 'in_progress', 'done', 'blocked'],
								description: 'New status'
							},
							priority: {
								type: 'string',
								enum: ['low', 'medium', 'high'],
								description: 'New priority'
							},
							start_date: {
								type: 'string',
								format: 'date',
								description: 'New start date'
							},
							duration_minutes: {
								type: 'number',
								description: 'New duration estimate'
							}
						},
						description: 'Fields to update'
					}
				},
				required: ['task_id', 'updates']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'update_project',
			description: `Update any field(s) on a project including name, description, context, status, dates, tags, and core dimensions.
This is a flexible tool that can update multiple fields at once.`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Project ID to update'
					},
					updates: {
						type: 'object',
						description: 'Fields to update',
						properties: {
							name: {
								type: 'string',
								description: 'Project name'
							},
							description: {
								type: 'string',
								description: 'Project description'
							},
							executive_summary: {
								type: 'string',
								description: 'Executive summary of the project'
							},
							context: {
								type: 'string',
								description: 'Project context and background information'
							},
							status: {
								type: 'string',
								enum: ['active', 'paused', 'completed', 'archived'],
								description: 'Project status'
							},
							start_date: {
								type: 'string',
								format: 'date',
								description: 'Project start date (YYYY-MM-DD)'
							},
							end_date: {
								type: 'string',
								format: 'date',
								description: 'Project end date (YYYY-MM-DD)'
							},
							tags: {
								type: 'array',
								items: { type: 'string' },
								description: 'Project tags'
							},
							calendar_color_id: {
								type: 'string',
								description: 'Google Calendar color ID'
							},
							calendar_sync_enabled: {
								type: 'boolean',
								description: 'Enable/disable calendar sync'
							},
							core_goals_momentum: {
								type: 'string',
								description: 'Goals & Momentum dimension'
							},
							core_harmony_integration: {
								type: 'string',
								description: 'Harmony & Integration dimension'
							},
							core_integrity_ideals: {
								type: 'string',
								description: 'Integrity & Ideals dimension'
							},
							core_meaning_identity: {
								type: 'string',
								description: 'Meaning & Identity dimension'
							},
							core_opportunity_freedom: {
								type: 'string',
								description: 'Opportunity & Freedom dimension'
							},
							core_people_bonds: {
								type: 'string',
								description: 'People & Bonds dimension'
							},
							core_power_resources: {
								type: 'string',
								description: 'Power & Resources dimension'
							},
							core_reality_understanding: {
								type: 'string',
								description: 'Reality & Understanding dimension'
							},
							core_trust_safeguards: {
								type: 'string',
								description: 'Trust & Safeguards dimension'
							}
						}
					}
				},
				required: ['project_id', 'updates']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'create_note',
			description: 'Create a new note',
			parameters: {
				type: 'object',
				properties: {
					title: {
						type: 'string',
						description: 'Note title'
					},
					content: {
						type: 'string',
						description: 'Note content'
					},
					project_id: {
						type: 'string',
						description: 'Associated project'
					},
					category: {
						type: 'string',
						description: 'Note category'
					},
					tags: {
						type: 'array',
						items: { type: 'string' },
						description: 'Tags for the note'
					}
				},
				required: ['content']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'create_brain_dump',
			description: 'Create a new brain dump for processing',
			parameters: {
				type: 'object',
				properties: {
					content: {
						type: 'string',
						description: 'Brain dump content'
					},
					project_id: {
						type: 'string',
						description: 'Associated project (optional)'
					}
				},
				required: ['content']
			}
		}
	},

	// ============================================
	// CALENDAR TOOLS (CalendarService Integration)
	// ============================================

	{
		type: 'function',
		function: {
			name: 'get_calendar_events',
			description: 'Get calendar events (abbreviated) using CalendarService',
			parameters: {
				type: 'object',
				properties: {
					timeMin: {
						type: 'string',
						format: 'date-time',
						description: 'Start time (defaults to now)'
					},
					timeMax: {
						type: 'string',
						format: 'date-time',
						description: 'End time (defaults to 7 days)'
					},
					limit: {
						type: 'number',
						default: 20,
						description: 'Max events to return'
					}
				}
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'find_available_slots',
			description: 'Find available time slots using CalendarService.findAvailableSlots',
			parameters: {
				type: 'object',
				properties: {
					timeMin: {
						type: 'string',
						format: 'date-time',
						description: 'Start of search range'
					},
					timeMax: {
						type: 'string',
						format: 'date-time',
						description: 'End of search range'
					},
					duration_minutes: {
						type: 'number',
						default: 60,
						description: 'Required slot duration'
					},
					preferred_hours: {
						type: 'array',
						items: { type: 'number' },
						description: 'Preferred hours (0-23), e.g. [9,10,11,14,15,16]'
					}
				},
				required: ['timeMin', 'timeMax']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'schedule_task',
			description: 'Schedule task to calendar using CalendarService.scheduleTask',
			parameters: {
				type: 'object',
				properties: {
					task_id: {
						type: 'string',
						description: 'Task ID to schedule'
					},
					start_time: {
						type: 'string',
						format: 'date-time',
						description: 'When to schedule the task'
					},
					duration_minutes: {
						type: 'number',
						description: 'Duration override (uses task duration if not provided)'
					},
					recurrence_pattern: {
						type: 'string',
						enum: ['daily', 'weekdays', 'weekly', 'biweekly', 'monthly'],
						description: 'Make this a recurring event'
					}
				},
				required: ['task_id', 'start_time']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'update_calendar_event',
			description: 'Update an existing calendar event',
			parameters: {
				type: 'object',
				properties: {
					event_id: {
						type: 'string',
						description: 'Calendar event ID'
					},
					updates: {
						type: 'object',
						properties: {
							summary: {
								type: 'string',
								description: 'New event title'
							},
							start_time: {
								type: 'string',
								format: 'date-time',
								description: 'New start time'
							},
							end_time: {
								type: 'string',
								format: 'date-time',
								description: 'New end time'
							},
							description: {
								type: 'string',
								description: 'New description'
							}
						}
					}
				},
				required: ['event_id', 'updates']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'delete_calendar_event',
			description: 'Delete a calendar event',
			parameters: {
				type: 'object',
				properties: {
					event_id: {
						type: 'string',
						description: 'Calendar event ID to delete'
					},
					calendar_id: {
						type: 'string',
						description: 'Calendar ID (defaults to primary)'
					}
				},
				required: ['event_id']
			}
		}
	},

	// ============================================
	// TASK-CALENDAR MANAGEMENT TOOLS
	// ============================================

	{
		type: 'function',
		function: {
			name: 'get_task_calendar_events',
			description: `Get all calendar events linked to a specific task.
Returns task_calendar_events relationship data including sync status.
Use this before scheduling to check for existing events.`,
			parameters: {
				type: 'object',
				properties: {
					task_id: {
						type: 'string',
						description: 'Task ID to check for calendar events'
					},
					include_deleted: {
						type: 'boolean',
						default: false,
						description: 'Include deleted/failed events in results'
					}
				},
				required: ['task_id']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'check_task_has_calendar_event',
			description: `Quick check if a task already has a calendar event.
Returns boolean and event details if exists.
Use for simple existence checks.`,
			parameters: {
				type: 'object',
				properties: {
					task_id: {
						type: 'string',
						description: 'Task ID to check'
					}
				},
				required: ['task_id']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'update_or_schedule_task',
			description: `Smart task scheduling that handles both updates and creates.
IMPORTANT: Always use this instead of schedule_task for existing tasks.
Automatically checks for existing calendar events and updates or creates as needed.
Handles task_calendar_events relationships properly.`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Project ID the task belongs to'
					},
					task_id: {
						type: 'string',
						description: 'Task ID to schedule or update'
					},
					start_time: {
						type: 'string',
						format: 'date-time',
						description: 'Start time for the task (ISO 8601 format)'
					},
					duration_minutes: {
						type: 'number',
						description:
							'Task duration in minutes (optional, uses task default if not provided)'
					},
					force_recreate: {
						type: 'boolean',
						default: false,
						description:
							'Delete existing events and create new ones (use when user wants to start fresh)'
					},
					recurrence_pattern: {
						type: 'string',
						enum: ['daily', 'weekdays', 'weekly', 'biweekly', 'monthly'],
						description: 'Recurrence pattern for recurring tasks'
					},
					recurrence_ends: {
						type: 'string',
						format: 'date',
						description: 'End date for recurring tasks (YYYY-MM-DD)'
					},
					timeZone: {
						type: 'string',
						description: 'Timezone for the event (e.g., America/New_York)'
					}
				},
				required: ['project_id', 'task_id', 'start_time']
			}
		}
	},

	// ============================================
	// ONTOLOGY TOOLS (onto_* tables)
	// ============================================

	{
		type: 'function',
		function: {
			name: 'list_onto_tasks',
			description: `List tasks from the ontology system (onto_tasks table). Returns abbreviated task information including id, title, state, and type.
Use this for queries about ontology tasks, plans with tasks, or project task lists.`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Filter tasks by project ID'
					},
					state_key: {
						type: 'string',
						description: 'Filter by state (e.g., "pending", "in_progress", "completed")'
					},
					limit: {
						type: 'number',
						default: 20,
						maximum: 50,
						description: 'Maximum tasks to return'
					}
				}
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'list_onto_goals',
			description: `List goals from the ontology system (onto_goals table). Returns abbreviated goal information.
Use for queries about project goals or strategic objectives.`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Filter goals by project ID'
					},
					limit: {
						type: 'number',
						default: 10,
						maximum: 30
					}
				}
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'list_onto_plans',
			description: `List plans from the ontology system (onto_plans table). Returns plan summaries.
Use for queries about execution plans or workflows.`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Filter plans by project ID'
					},
					limit: {
						type: 'number',
						default: 10,
						maximum: 20
					}
				}
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'list_onto_projects',
			description: `List projects from the ontology system (onto_projects table). Returns abbreviated project information.
Use for discovering available projects or getting project overviews.`,
			parameters: {
				type: 'object',
				properties: {
					state_key: {
						type: 'string',
						description: 'Filter by project state'
					},
					type_key: {
						type: 'string',
						description: 'Filter by project type'
					},
					limit: {
						type: 'number',
						default: 10,
						maximum: 30
					}
				}
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'get_onto_project_details',
			description: `Get complete details for a specific ontology project including properties and metadata.
Use when you need full project information after identifying it with list_onto_projects.`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Project ID to retrieve'
					}
				},
				required: ['project_id']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'get_onto_task_details',
			description: `Get complete details for a specific ontology task including all properties and relationships.
Use after identifying a task with list_onto_tasks.`,
			parameters: {
				type: 'object',
				properties: {
					task_id: {
						type: 'string',
						description: 'Task ID to retrieve'
					}
				},
				required: ['task_id']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'get_entity_relationships',
			description: `Get the relationship graph for an ontology entity using onto_edges table.
Shows what entities are connected to this entity and how.`,
			parameters: {
				type: 'object',
				properties: {
					entity_id: {
						type: 'string',
						description: 'Entity ID to get relationships for'
					},
					direction: {
						type: 'string',
						enum: ['outgoing', 'incoming', 'both'],
						default: 'both',
						description: 'Direction of relationships to retrieve'
					}
				},
				required: ['entity_id']
			}
		}
	},

	// ============================================
	// ONTOLOGY ACTION TOOLS (Create/Update/Delete)
	// ============================================

	// CREATE TOOLS
	{
		type: 'function',
		function: {
			name: 'create_onto_task',
			description: `Create a new task in the ontology system.
Creates a task within a project and optionally assigns it to a plan.
Automatically creates the onto_edges relationship linking task to project.`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Project UUID (required) - the project this task belongs to'
					},
					title: {
						type: 'string',
						description: 'Task title (required)'
					},
					description: {
						type: 'string',
						description: 'Task description (optional)'
					},
					type_key: {
						type: 'string',
						default: 'task.basic',
						description: 'Template type key (default: task.basic)'
					},
					state_key: {
						type: 'string',
						default: 'todo',
						description:
							'Initial state (default: todo). Common: todo, in_progress, done'
					},
					priority: {
						type: 'number',
						description: 'Priority level (1-5, default: 3). Higher = more important'
					},
					plan_id: {
						type: 'string',
						description: 'Optional plan UUID to associate this task with'
					},
					due_at: {
						type: 'string',
						description: 'Optional due date in ISO format (YYYY-MM-DDTHH:mm:ssZ)'
					},
					props: {
						type: 'object',
						description: 'Additional properties as JSON object'
					}
				},
				required: ['project_id', 'title']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'create_onto_goal',
			description: `Create a new goal in the ontology system.
Goals define project objectives and success criteria.`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Project UUID (required)'
					},
					name: {
						type: 'string',
						description: 'Goal name (required)'
					},
					description: {
						type: 'string',
						description: 'Goal description'
					},
					type_key: {
						type: 'string',
						default: 'goal.basic',
						description: 'Template type key'
					},
					props: {
						type: 'object',
						description: 'Additional properties'
					}
				},
				required: ['project_id', 'name']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'create_onto_plan',
			description: `Create a new plan in the ontology system.
Plans are logical groupings of tasks within a project.`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Project UUID (required)'
					},
					name: {
						type: 'string',
						description: 'Plan name (required)'
					},
					description: {
						type: 'string',
						description: 'Plan description'
					},
					type_key: {
						type: 'string',
						default: 'plan.basic',
						description: 'Template type key'
					},
					state_key: {
						type: 'string',
						default: 'draft',
						description: 'Initial state (draft, active, complete)'
					},
					props: {
						type: 'object',
						description: 'Additional properties'
					}
				},
				required: ['project_id', 'name']
			}
		}
	},

	// UPDATE TOOLS
	{
		type: 'function',
		function: {
			name: 'update_onto_task',
			description: `Update an existing task in the ontology system.
Can modify title, description, state, priority, plan assignment, and custom properties.
Only updates fields that are provided - omitted fields remain unchanged.`,
			parameters: {
				type: 'object',
				properties: {
					task_id: {
						type: 'string',
						description: 'Task UUID (required)'
					},
					title: {
						type: 'string',
						description: 'New task title'
					},
					description: {
						type: 'string',
						description: 'New description'
					},
					state_key: {
						type: 'string',
						description: 'New state (todo, in_progress, done, blocked, etc.)'
					},
					priority: {
						type: 'number',
						description: 'New priority (1-5)'
					},
					plan_id: {
						type: 'string',
						description: 'Assign to different plan (or null to unassign)'
					},
					due_at: {
						type: 'string',
						description: 'New due date (ISO format) or null to clear'
					},
					props: {
						type: 'object',
						description: 'Properties to merge with existing props'
					}
				},
				required: ['task_id']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'update_onto_project',
			description: `Update an existing project in the ontology system.
Can modify name, description, state, and custom properties.
Only updates fields that are provided.`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Project UUID (required)'
					},
					name: {
						type: 'string',
						description: 'New project name'
					},
					description: {
						type: 'string',
						description: 'New description'
					},
					state_key: {
						type: 'string',
						description: 'New state (draft, active, complete, archived)'
					},
					props: {
						type: 'object',
						description: 'Properties to merge with existing props'
					}
				},
				required: ['project_id']
			}
		}
	},

	// DELETE TOOLS
	{
		type: 'function',
		function: {
			name: 'delete_onto_task',
			description: `Delete a task from the ontology system.
Removes the task and all associated onto_edges relationships.
This action is permanent and cannot be undone.
Verifies ownership before deletion.`,
			parameters: {
				type: 'object',
				properties: {
					task_id: {
						type: 'string',
						description: 'Task UUID (required)'
					}
				},
				required: ['task_id']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'delete_onto_goal',
			description: `Delete a goal from the ontology system.
This action is permanent and cannot be undone.`,
			parameters: {
				type: 'object',
				properties: {
					goal_id: {
						type: 'string',
						description: 'Goal UUID (required)'
					}
				},
				required: ['goal_id']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'delete_onto_plan',
			description: `Delete a plan from the ontology system.
Note: Tasks in this plan will NOT be deleted, only the plan container.
This action is permanent and cannot be undone.`,
			parameters: {
				type: 'object',
				properties: {
					plan_id: {
						type: 'string',
						description: 'Plan UUID (required)'
					}
				},
				required: ['plan_id']
			}
		}
	},

	// ============================================
	// TEMPLATE & PROJECT CREATION TOOLS
	// ============================================

	{
		type: 'function',
		function: {
			name: 'list_onto_templates',
			description: `Search and list available ontology templates to find the right template for creating projects, tasks, plans, etc.

Use this tool when the user wants to create a new project/entity and you need to find the appropriate template.
Templates are organized by scope (project, task, plan, output) and realm (writer, developer, coach, etc.).

Examples:
- User: "Create a book writing project" → list_onto_templates(scope="project", realm="writer", search="book")
- User: "Start a new software project" → list_onto_templates(scope="project", realm="developer")
- User: "Create a coaching plan" → list_onto_templates(scope="plan", realm="coach")`,
			parameters: {
				type: 'object',
				properties: {
					scope: {
						type: 'string',
						enum: [
							'project',
							'plan',
							'task',
							'output',
							'document',
							'goal',
							'requirement'
						],
						description: 'Entity type to find templates for (required for best results)'
					},
					realm: {
						type: 'string',
						description:
							'Domain/realm filter (e.g., "writer", "developer", "coach", "designer")'
					},
					search: {
						type: 'string',
						description:
							'Text search across template names, type_keys, and descriptions'
					},
					context: {
						type: 'string',
						enum: [
							'personal',
							'client',
							'commercial',
							'internal',
							'open_source',
							'community',
							'academic',
							'nonprofit',
							'startup'
						],
						description: 'Filter by context facet'
					},
					scale: {
						type: 'string',
						enum: ['micro', 'small', 'medium', 'large', 'epic'],
						description: 'Filter by scale facet'
					},
					stage: {
						type: 'string',
						enum: [
							'discovery',
							'planning',
							'execution',
							'launch',
							'maintenance',
							'complete'
						],
						description: 'Filter by stage facet'
					}
				}
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'create_onto_project',
			description: `Create a new project in the ontology system with full structure.

This is the PRIMARY tool for creating projects. It supports creating a complete project with:
- Goals, requirements, plans, tasks
- Outputs, documents, sources
- Metrics, milestones, risks, decisions
- Custom entity relationships

**IMPORTANT**: You should INFER as much as possible from the user's message:
- Project name from context
- Appropriate template type_key (use list_onto_templates first)
- Start date (default to today if not specified)
- Facets (context, scale, stage) from user intent
- Basic goals and tasks from user description

**When to use clarifications array**:
Only add clarification questions if CRITICAL information is missing that you cannot reasonably infer.
For example:
- If user says "create a book project", DON'T ask for project name - infer it's about a book
- If user says "start a project", DO ask what kind of project

**Workflow**:
1. Search templates with list_onto_templates to find appropriate type_key
2. Fill in ProjectSpec with inferred data
3. Add clarifications[] only if essential info is missing
4. Call this tool with the spec

**ProjectSpec Structure**:
{
  project: {
    name: string (REQUIRED - infer from user message),
    type_key: string (REQUIRED - from template search),
    description?: string (infer from user message),
    state_key?: string (default: "draft"),
    props?: { facets?: { context?, scale?, stage? } },
    start_at?: ISO datetime (default to now),
    end_at?: ISO datetime
  },
  goals?: [{ name, description?, type_key?, props? }],
  requirements?: [{ text, type_key?, props? }],
  plans?: [{ name, type_key, state_key?, props? }],
  tasks?: [{ title, plan_name?, state_key?, priority?, due_at?, props? }],
  outputs?: [{ name, type_key, state_key?, props? }],
  documents?: [{ title, type_key, state_key?, props? }],
  clarifications?: [{ key, question, required, choices?, help_text? }],
  meta?: { model, confidence, suggested_facets } (NOT sent to API)
}`,
			parameters: {
				type: 'object',
				properties: {
					project: {
						type: 'object',
						description: 'Project definition (REQUIRED)',
						properties: {
							name: {
								type: 'string',
								description: 'Project name (REQUIRED - infer from user message)'
							},
							type_key: {
								type: 'string',
								description:
									'Template type key like "project.writer.book" (REQUIRED - get from list_onto_templates)'
							},
							description: {
								type: 'string',
								description:
									'Project description (optional - infer from user message)'
							},
							also_types: {
								type: 'array',
								items: { type: 'string' },
								description: 'Additional type classifications (optional)'
							},
							state_key: {
								type: 'string',
								description: 'Initial state (optional, defaults to "draft")'
							},
							props: {
								type: 'object',
								description: 'Project properties including facets',
								properties: {
									facets: {
										type: 'object',
										properties: {
											context: {
												type: 'string',
												enum: [
													'personal',
													'client',
													'commercial',
													'internal',
													'open_source',
													'community',
													'academic',
													'nonprofit',
													'startup'
												]
											},
											scale: {
												type: 'string',
												enum: ['micro', 'small', 'medium', 'large', 'epic']
											},
											stage: {
												type: 'string',
												enum: [
													'discovery',
													'planning',
													'execution',
													'launch',
													'maintenance',
													'complete'
												]
											}
										}
									}
								}
							},
							start_at: {
								type: 'string',
								description: 'Start date in ISO format (optional, default to now)'
							},
							end_at: {
								type: 'string',
								description: 'End date in ISO format (optional)'
							}
						},
						required: ['name', 'type_key']
					},
					goals: {
						type: 'array',
						description: 'Project goals (optional - infer from user message)',
						items: {
							type: 'object',
							properties: {
								name: { type: 'string' },
								description: { type: 'string' },
								type_key: { type: 'string' },
								props: { type: 'object' }
							},
							required: ['name']
						}
					},
					requirements: {
						type: 'array',
						description: 'Project requirements (optional)',
						items: {
							type: 'object',
							properties: {
								text: { type: 'string', description: 'Requirement description' },
								type_key: { type: 'string' },
								props: { type: 'object' }
							},
							required: ['text']
						}
					},
					plans: {
						type: 'array',
						description: 'Execution plans (optional)',
						items: {
							type: 'object',
							properties: {
								name: { type: 'string' },
								type_key: { type: 'string' },
								state_key: { type: 'string' },
								props: { type: 'object' }
							},
							required: ['name', 'type_key']
						}
					},
					tasks: {
						type: 'array',
						description: 'Initial tasks (optional - infer from user message)',
						items: {
							type: 'object',
							properties: {
								title: { type: 'string' },
								plan_name: { type: 'string' },
								state_key: { type: 'string' },
								priority: { type: 'number', minimum: 1, maximum: 5 },
								due_at: { type: 'string' },
								props: { type: 'object' }
							},
							required: ['title']
						}
					},
					outputs: {
						type: 'array',
						description: 'Expected outputs/deliverables (optional)',
						items: {
							type: 'object',
							properties: {
								name: { type: 'string' },
								type_key: { type: 'string' },
								state_key: { type: 'string' },
								props: { type: 'object' }
							},
							required: ['name', 'type_key']
						}
					},
					documents: {
						type: 'array',
						description: 'Project documents (optional)',
						items: {
							type: 'object',
							properties: {
								title: { type: 'string' },
								type_key: { type: 'string' },
								state_key: { type: 'string' },
								props: { type: 'object' }
							},
							required: ['title', 'type_key']
						}
					},
					clarifications: {
						type: 'array',
						description:
							'Questions for user if critical info is missing (use sparingly)',
						items: {
							type: 'object',
							properties: {
								key: {
									type: 'string',
									description: 'Unique key for this question'
								},
								question: { type: 'string', description: 'The question to ask' },
								required: {
									type: 'boolean',
									description: 'Whether answer is required'
								},
								choices: {
									type: 'array',
									items: { type: 'string' },
									description: 'Optional predefined choices'
								},
								help_text: { type: 'string' }
							},
							required: ['key', 'question', 'required']
						}
					},
					meta: {
						type: 'object',
						description: 'Metadata about the generation (optional)',
						properties: {
							model: { type: 'string' },
							confidence: { type: 'number', minimum: 0, maximum: 1 },
							suggested_facets: {
								type: 'object',
								properties: {
									context: { type: 'string' },
									scale: { type: 'string' },
									stage: { type: 'string' }
								}
							}
						}
					}
				},
				required: ['project']
			}
		}
	},

	// ============================================
	// UTILITY TOOLS (Schema & Reference)
	// ============================================

	{
		type: 'function',
		function: {
			name: 'get_field_info',
			description: `Get authoritative information about entity fields including data types, valid values, and descriptions.
Use this when users ask questions like:
- "What are the valid project statuses?"
- "What priority levels can tasks have?"
- "What fields can I set on a project?"
- Any question about valid values, field types, or entity schemas.`,
			parameters: {
				type: 'object',
				properties: {
					entity_type: {
						type: 'string',
						enum: ['project', 'task', 'note', 'brain_dump'],
						description: 'The entity type to get field information for'
					},
					field_name: {
						type: 'string',
						description:
							'Specific field name (optional). If provided, returns info for that field only. If omitted, returns commonly-used fields summary.'
					}
				},
				required: ['entity_type']
			}
		}
	}
];

/**
 * Tool categories for analytics and cost tracking
 */
export const TOOL_CATEGORIES = {
	list: {
		tools: [
			'list_tasks',
			'search_projects',
			'search_notes',
			'search_brain_dumps',
			'list_onto_tasks',
			'list_onto_goals',
			'list_onto_plans',
			'list_onto_projects',
			'list_onto_templates'
		],
		averageTokens: 200,
		costTier: 'low'
	},
	detail: {
		tools: [
			'get_task_details',
			'get_project_details',
			'get_note_details',
			'get_brain_dump_details',
			'get_onto_project_details',
			'get_onto_task_details'
		],
		averageTokens: 800,
		costTier: 'medium'
	},
	action: {
		tools: ['create_task', 'update_task', 'update_project', 'create_note', 'create_brain_dump'],
		averageTokens: 150,
		costTier: 'low'
	},
	calendar: {
		tools: [
			'get_calendar_events',
			'find_available_slots',
			'schedule_task',
			'update_calendar_event',
			'delete_calendar_event',
			'get_task_calendar_events',
			'check_task_has_calendar_event',
			'update_or_schedule_task'
		],
		averageTokens: 300,
		costTier: 'medium'
	},
	ontology: {
		tools: ['get_entity_relationships'],
		averageTokens: 250,
		costTier: 'medium'
	},
	ontology_action: {
		tools: [
			'create_onto_project', // Full project instantiation
			'create_onto_task',
			'create_onto_goal',
			'create_onto_plan',
			'update_onto_task',
			'update_onto_project',
			'delete_onto_task',
			'delete_onto_goal',
			'delete_onto_plan'
		],
		averageTokens: 250, // Increased due to project creation complexity
		costTier: 'low'
	},
	utility: {
		tools: ['get_field_info'],
		averageTokens: 100,
		costTier: 'low'
	}
};

/**
 * Get tool category for a given tool name
 */
export function getToolCategory(toolName: string): keyof typeof TOOL_CATEGORIES | null {
	for (const [category, config] of Object.entries(TOOL_CATEGORIES)) {
		if (config.tools.includes(toolName)) {
			return category as keyof typeof TOOL_CATEGORIES;
		}
	}
	return null;
}

/**
 * Estimate token usage for a tool call
 */
export function estimateToolTokens(toolName: string): number {
	const category = getToolCategory(toolName);
	if (!category) return 200; // Default estimate
	return TOOL_CATEGORIES[category].averageTokens;
}

// ============================================
// ONTOLOGY-FOCUSED TOOL ARCHITECTURE
// ============================================

/**
 * Extract tools by name from CHAT_TOOLS
 */
export function extractTools(names: string[]): ChatToolDefinition[] {
	return CHAT_TOOLS.filter((tool) => names.includes(tool.function.name));
}

/**
 * ONTOLOGY TOOLS - Primary tool set oriented around onto_* entities
 * Based on ontology data models: projects, tasks, plans, goals, outputs, documents
 */
export const ONTOLOGY_TOOLS = extractTools([
	// TEMPLATES: Search and discovery
	'list_onto_templates',

	// READ: Projects (root entities)
	'list_onto_projects',
	'get_onto_project_details',

	// READ: Tasks (actionable items)
	'list_onto_tasks',
	'get_onto_task_details',

	// READ: Plans (task groupings)
	'list_onto_plans',

	// READ: Goals (objectives)
	'list_onto_goals',

	// READ: Relationships (onto_edges)
	'get_entity_relationships',

	// CREATE: New entities
	'create_onto_project', // Full project creation with all entities
	'create_onto_task',
	'create_onto_goal',
	'create_onto_plan',

	// UPDATE: Existing entities
	'update_onto_task',
	'update_onto_project',

	// DELETE: Remove entities
	'delete_onto_task',
	'delete_onto_goal',
	'delete_onto_plan'
]);

/**
 * LEGACY TOOLS - Backward compatibility for old tasks/projects/notes system
 * These are being phased out in favor of ontology-based entities
 */
export const LEGACY_TOOLS = extractTools([
	// Legacy list/search
	'list_tasks',
	'search_projects',
	'search_notes',
	'search_brain_dumps',

	// Legacy detail
	'get_task_details',
	'get_project_details',
	'get_note_details',
	'get_brain_dump_details',

	// Legacy actions
	'create_task',
	'update_task',
	'update_project',
	'create_note',
	'create_brain_dump'
]);

/**
 * CALENDAR TOOLS - Shared across both ontology and legacy systems
 */
export const CALENDAR_TOOLS = extractTools([
	'get_calendar_events',
	'find_available_slots',
	'schedule_task',
	'update_calendar_event',
	'delete_calendar_event',
	'get_task_calendar_events',
	'check_task_has_calendar_event',
	'update_or_schedule_task'
]);

/**
 * UTILITY TOOLS - Shared utilities for schema information
 */
export const UTILITY_TOOLS = extractTools(['get_field_info']);

/**
 * Context-aware tool selector
 * Returns the appropriate tool set based on whether ontology context is available
 */
export interface GetToolsOptions {
	/**
	 * Use ontology-based tools (onto_projects, onto_tasks, etc.)
	 * Default: true
	 */
	useOntology?: boolean;

	/**
	 * Include legacy tools for backward compatibility
	 * Default: false (ontology-only when useOntology=true)
	 */
	includeLegacy?: boolean;

	/**
	 * Include calendar integration tools
	 * Default: true
	 */
	includeCalendar?: boolean;

	/**
	 * Include utility tools (get_field_info, etc.)
	 * Default: true
	 */
	includeUtility?: boolean;
}

/**
 * Get tools appropriate for the current context
 *
 * @example
 * // Ontology-only (recommended)
 * const tools = getToolsForContext({ useOntology: true });
 *
 * @example
 * // Legacy-only (backward compatibility)
 * const tools = getToolsForContext({ useOntology: false, includeLegacy: true });
 *
 * @example
 * // Both ontology and legacy (transition period)
 * const tools = getToolsForContext({ useOntology: true, includeLegacy: true });
 */
export function getToolsForContext(options: GetToolsOptions = {}): ChatToolDefinition[] {
	const {
		useOntology = true,
		includeLegacy = false,
		includeCalendar = true,
		includeUtility = true
	} = options;

	const tools: ChatToolDefinition[] = [];

	// Add ontology tools (primary)
	if (useOntology) {
		tools.push(...ONTOLOGY_TOOLS);
	}

	// Add legacy tools (backward compatibility or when ontology not available)
	if (includeLegacy) {
		tools.push(...LEGACY_TOOLS);
	}

	// Add calendar tools (shared)
	if (includeCalendar) {
		tools.push(...CALENDAR_TOOLS);
	}

	// Add utility tools (shared)
	if (includeUtility) {
		tools.push(...UTILITY_TOOLS);
	}

	return tools;
}

/**
 * Default tool set - Ontology-first with calendar
 * This is what most contexts should use
 */
export const DEFAULT_TOOLS = getToolsForContext({
	useOntology: true,
	includeLegacy: false,
	includeCalendar: true
});

/**
 * Comprehensive tool set - Everything (for transition period)
 */
export const ALL_TOOLS = getToolsForContext({
	useOntology: true,
	includeLegacy: true,
	includeCalendar: true
});
