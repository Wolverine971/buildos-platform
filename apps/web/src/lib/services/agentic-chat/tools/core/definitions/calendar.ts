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
			description:
				'List merged, deduplicated Google and ontology events. Pass explicit time_min/time_max for an exact window.',
			parameters: {
				type: 'object',
				properties: {
					time_min: {
						type: 'string',
						description: 'Window start (ISO 8601 datetime or date).'
					},
					time_max: {
						type: 'string',
						description: 'Window end (ISO 8601 datetime or date).'
					},
					timezone: {
						type: 'string',
						description:
							'Optional IANA timezone for date-only/naive datetime values (example: America/New_York).'
					},
					query: {
						type: 'string',
						description:
							'Matches Google event text and ontology title, description, or location.'
					},
					limit: {
						type: 'integer',
						default: 100,
						minimum: 1,
						maximum: 200,
						description: 'Page size.'
					},
					offset: {
						type: 'integer',
						default: 0,
						minimum: 0,
						maximum: 5000,
						description: 'Zero-based pagination offset for merged results.'
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
				'Get one event. Pass onto_event_id for an ontology event or event_id with the external_event_id value for a Google event.',
			parameters: {
				type: 'object',
				properties: {
					onto_event_id: {
						type: 'string',
						description:
							'Ontology event UUID (onto_event_id from list results; not the Google id)'
					},
					event_id: {
						type: 'string',
						description: 'Google event id (external_event_id from list results)'
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
				'Create an ontology calendar event and optionally sync it to Google Calendar.',
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
						type: ['string', 'null'],
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
					calendar_source_id: {
						type: 'string',
						description:
							'Opaque Google calendar source UUID. Prefer this over calendar_id when targeting a connected account.'
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
			description:
				'Update an ontology or Google event. Pass onto_event_id or event_id plus at least one field to change.',
			parameters: {
				type: 'object',
				properties: {
					onto_event_id: {
						type: 'string',
						description:
							'Ontology event UUID (onto_event_id from list results; not the Google id)'
					},
					event_id: {
						type: 'string',
						description: 'Google event id (external_event_id from list results).'
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
						type: ['string', 'null'],
						description:
							'New end time (ISO 8601). Include timezone offset or Z unless timezone is provided.'
					},
					timezone: {
						type: 'string',
						description:
							'Optional IANA timezone (e.g., America/New_York). Used when start_at/end_at omit timezone.'
					},
					description: {
						type: ['string', 'null'],
						description: 'New description, or null to clear.'
					},
					location: {
						type: ['string', 'null'],
						description: 'New location, or null to clear.'
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
			description: 'Delete an ontology or Google event by onto_event_id or event_id.',
			parameters: {
				type: 'object',
				properties: {
					onto_event_id: {
						type: 'string',
						description:
							'Ontology event UUID (onto_event_id from list results; not the Google id)'
					},
					event_id: {
						type: 'string',
						description: 'Google event id (external_event_id from list results).'
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
					calendar_id: {
						type: 'string',
						description:
							'Existing Google calendar id to link instead of creating a new calendar'
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
