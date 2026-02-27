// apps/web/src/lib/services/agentic-chat/tools/core/definitions/calendar.ts
/**
 * Calendar Tool Definitions
 *
 * Tools for listing, creating, updating, and deleting calendar events.
 */

import type { ChatToolDefinition } from '@buildos/shared-types';

export const CALENDAR_TOOL_DEFINITIONS: ChatToolDefinition[] = [
	{
		type: 'function',
		function: {
			name: 'list_calendar_events',
			description: `List calendar events for a time range. Merges Google Calendar events with ontology events and dedupes when possible.`,
			parameters: {
				type: 'object',
				properties: {
					timeMin: {
						type: 'string',
						description: 'Start time (ISO 8601)'
					},
					timeMax: {
						type: 'string',
						description: 'End time (ISO 8601)'
					},
					limit: {
						type: 'number',
						description: 'Maximum number of events to return'
					},
					calendar_scope: {
						type: 'string',
						enum: ['user', 'project', 'calendar_id'],
						description:
							'Which calendar to query: user primary, project calendar, or a specific calendar id'
					},
					project_id: {
						type: 'string',
						description: 'Required when calendar_scope=project'
					},
					calendar_id: {
						type: 'string',
						description:
							'Google calendar id to query (used when calendar_scope=user or calendar_id)'
					}
				}
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'get_calendar_event_details',
			description:
				'Fetch detailed information for a calendar event. Use onto_event_id for ontology events or event_id for Google events.',
			parameters: {
				type: 'object',
				properties: {
					onto_event_id: {
						type: 'string',
						description: 'Ontology event id (preferred if available)'
					},
					event_id: {
						type: 'string',
						description: 'Google event id (external)'
					},
					calendar_id: {
						type: 'string',
						description: 'Google calendar id (defaults to primary)'
					},
					calendar_scope: {
						type: 'string',
						enum: ['user', 'project', 'calendar_id'],
						description: 'Resolve event id against a specific calendar scope'
					},
					project_id: {
						type: 'string',
						description: 'Project id for project calendar lookup'
					}
				}
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'create_calendar_event',
			description:
				'Create a calendar event in the ontology and optionally sync to Google Calendar.',
			parameters: {
				type: 'object',
				properties: {
					title: {
						type: 'string',
						description: 'Event title'
					},
					start_at: {
						type: 'string',
						description:
							'Start time (ISO 8601). Include timezone offset or Z unless timezone is provided.'
					},
					end_at: {
						type: 'string',
						description:
							'End time (ISO 8601). Include timezone offset or Z unless timezone is provided.'
					},
					timezone: {
						type: 'string',
						description:
							'Optional IANA timezone (e.g., America/New_York). Used when start_at/end_at omit timezone.'
					},
					description: {
						type: 'string',
						description: 'Event description'
					},
					location: {
						type: 'string',
						description: 'Event location'
					},
					project_id: {
						type: 'string',
						description: 'Project id (required for project calendar events)'
					},
					task_id: {
						type: 'string',
						description: 'Optional task id to link the event'
					},
					calendar_scope: {
						type: 'string',
						enum: ['user', 'project', 'calendar_id'],
						description: 'Where to create the event'
					},
					calendar_id: {
						type: 'string',
						description:
							'Specific Google calendar id (used when scope=user or calendar_id)'
					},
					sync_to_calendar: {
						type: 'boolean',
						description: 'Whether to sync to Google Calendar'
					}
				},
				required: ['title', 'start_at']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'update_calendar_event',
			description: 'Update an existing calendar event (ontology event or Google event).',
			parameters: {
				type: 'object',
				properties: {
					onto_event_id: {
						type: 'string',
						description: 'Ontology event id (preferred)'
					},
					event_id: {
						type: 'string',
						description: 'Google event id'
					},
					calendar_id: {
						type: 'string',
						description: 'Google calendar id (defaults to primary)'
					},
					title: {
						type: 'string',
						description: 'New title'
					},
					start_at: {
						type: 'string',
						description:
							'New start time (ISO 8601). Include timezone offset or Z unless timezone is provided.'
					},
					end_at: {
						type: 'string',
						description:
							'New end time (ISO 8601). Include timezone offset or Z unless timezone is provided.'
					},
					timezone: {
						type: 'string',
						description:
							'Optional IANA timezone (e.g., America/New_York). Used when start_at/end_at omit timezone.'
					},
					description: {
						type: 'string',
						description: 'New description'
					},
					location: {
						type: 'string',
						description: 'New location'
					},
					sync_to_calendar: {
						type: 'boolean',
						description: 'Whether to sync ontology updates to Google Calendar'
					}
				}
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'delete_calendar_event',
			description: 'Delete a calendar event (ontology event or Google event).',
			parameters: {
				type: 'object',
				properties: {
					onto_event_id: {
						type: 'string',
						description: 'Ontology event id (preferred)'
					},
					event_id: {
						type: 'string',
						description: 'Google event id'
					},
					calendar_id: {
						type: 'string',
						description: 'Google calendar id (defaults to primary)'
					},
					sync_to_calendar: {
						type: 'boolean',
						description: 'Whether to sync deletion to Google Calendar'
					}
				}
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'get_project_calendar',
			description: 'Get the project calendar mapping for a project.',
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Project id'
					}
				},
				required: ['project_id']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'set_project_calendar',
			description: 'Create or update a project calendar configuration.',
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Project id'
					},
					action: {
						type: 'string',
						enum: ['create', 'update'],
						description: 'Force create or update (optional)'
					},
					name: {
						type: 'string',
						description: 'Calendar name'
					},
					description: {
						type: 'string',
						description: 'Calendar description'
					},
					color_id: {
						type: 'string',
						description: 'Google color id for the calendar'
					},
					sync_enabled: {
						type: 'boolean',
						description: 'Whether sync is enabled'
					}
				},
				required: ['project_id']
			}
		}
	}
];
