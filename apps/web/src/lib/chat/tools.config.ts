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
			name: 'update_project_context',
			description: 'Update or append to project context',
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Project ID to update'
					},
					context_update: {
						type: 'string',
						description: 'New context or addition'
					},
					merge_strategy: {
						type: 'string',
						enum: ['replace', 'append', 'prepend'],
						default: 'append',
						description: 'How to merge with existing context'
					}
				},
				required: ['project_id', 'context_update']
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
	}
];

/**
 * Tool categories for analytics and cost tracking
 */
export const TOOL_CATEGORIES = {
	list: {
		tools: ['list_tasks', 'search_projects', 'search_notes', 'search_brain_dumps'],
		averageTokens: 200,
		costTier: 'low'
	},
	detail: {
		tools: [
			'get_task_details',
			'get_project_details',
			'get_note_details',
			'get_brain_dump_details'
		],
		averageTokens: 800,
		costTier: 'medium'
	},
	action: {
		tools: [
			'create_task',
			'update_task',
			'update_project_context',
			'create_note',
			'create_brain_dump'
		],
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
