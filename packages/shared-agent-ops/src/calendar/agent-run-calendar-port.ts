// packages/shared-agent-ops/src/calendar/agent-run-calendar-port.ts
//
// Worker-safe CalendarPort implementation for Agent Runs. This deliberately
// avoids SvelteKit imports and reads credentials from explicit constructor
// params first, then process.env, so it can run in Railway workers.
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { google } from 'googleapis';
import type { calendar_v3 } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import type { Database, Json } from '@buildos/shared-types';
import { isValidUUID } from '@buildos/shared-types';
import type { CalendarPort } from '../gateway/op-execution-gateway';
import { ensureActorId } from '../ontology/ontology-projects.service';

type SupabaseAdmin = any;
type CalendarScope = 'user' | 'project' | 'calendar_id';
type ProjectCalendarRow = Database['public']['Tables']['project_calendars']['Row'];
type OntoEventRow = Database['public']['Tables']['onto_events']['Row'];
type OntoEventSyncRow = Database['public']['Tables']['onto_event_sync']['Row'];

export interface AgentRunGoogleOAuthCredentials {
	clientId?: string | null;
	clientSecret?: string | null;
}

export interface CreateAgentRunCalendarPortParams {
	admin: SupabaseAdmin;
	userId: string;
	credentials?: AgentRunGoogleOAuthCredentials;
	defaultTimezone?: string;
}

type StoredCalendarTokenFields = {
	access_token: string | null;
	refresh_token: string | null;
	expiry_date?: number | null;
	scope?: string | null;
	token_type?: string | null;
	updated_at?: string | null;
};

type StoredCalendarTokenPatch = {
	access_token?: string | null;
	refresh_token?: string | null;
};

const ENCRYPTED_PREFIX = 'enc:v1.';
const ENCRYPTION_CONTEXT = 'buildos:calendar-tokens:v1';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ALGORITHM = 'aes-256-gcm';
const DEFAULT_TIMEZONE = 'America/New_York';
const DEFAULT_EVENT_DURATION_MS = 60 * 60 * 1000;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LIST_LOOKBACK_DAYS = 7;
const DEFAULT_LIST_LOOKAHEAD_DAYS = 90;
const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 200;
const MAX_LIST_FETCH = 300;
const MAX_LIST_OFFSET = 5000;

const GOOGLE_CALENDAR_HEX_COLORS: Record<string, string> = {
	'1': '#a4bdfc',
	'2': '#7ae7bf',
	'3': '#dbadff',
	'4': '#ff887c',
	'5': '#fbd75b',
	'6': '#ffb878',
	'7': '#46d6db',
	'8': '#e1e1e1',
	'9': '#5484ed',
	'10': '#51b749',
	'11': '#dc2127'
};

function normalizeCredential(value: string | null | undefined): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function getPrivateEnv(name: string): string | undefined {
	return normalizeCredential(process.env[name]);
}

function resolveGoogleOAuthCredentials(
	credentials?: AgentRunGoogleOAuthCredentials
): Required<AgentRunGoogleOAuthCredentials> {
	return {
		clientId:
			normalizeCredential(credentials?.clientId) ??
			getPrivateEnv('PRIVATE_GOOGLE_CLIENT_ID') ??
			getPrivateEnv('GOOGLE_CLIENT_ID') ??
			'',
		clientSecret:
			normalizeCredential(credentials?.clientSecret) ??
			getPrivateEnv('PRIVATE_GOOGLE_CLIENT_SECRET') ??
			getPrivateEnv('GOOGLE_CLIENT_SECRET') ??
			''
	};
}

function deriveKey(secret: string): Buffer {
	return createHash('sha256').update(`${ENCRYPTION_CONTEXT}:${secret}`, 'utf8').digest();
}

function buildFallbackSecret(): string | null {
	const serviceKey = getPrivateEnv('PRIVATE_SUPABASE_SERVICE_KEY')?.trim();
	const googleSecret = getPrivateEnv('PRIVATE_GOOGLE_CLIENT_SECRET')?.trim();

	if (!serviceKey || !googleSecret) {
		return null;
	}

	return `${serviceKey}:${googleSecret}`;
}

function getKeyCandidates(): Buffer[] {
	const configuredSecret = getPrivateEnv('PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY')?.trim() || null;
	const fallbackSecret = buildFallbackSecret();
	const candidates = [configuredSecret, fallbackSecret].filter(
		(value): value is string => typeof value === 'string' && value.length > 0
	);
	const seen = new Set<string>();

	return candidates
		.map((candidate) => deriveKey(candidate))
		.filter((candidate) => {
			const fingerprint = candidate.toString('hex');
			if (seen.has(fingerprint)) {
				return false;
			}
			seen.add(fingerprint);
			return true;
		});
}

function getActiveKey(): Buffer {
	const [activeKey] = getKeyCandidates();
	if (!activeKey) {
		throw new Error(
			'Calendar token encryption key is not available. Configure PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY or ensure server secrets are present.'
		);
	}
	return activeKey;
}

function isEncryptedCalendarToken(value: string | null | undefined): boolean {
	return typeof value === 'string' && value.startsWith(ENCRYPTED_PREFIX);
}

function encryptCalendarToken(value: string | null | undefined): string | null {
	if (!value) {
		return value ?? null;
	}

	if (isEncryptedCalendarToken(value)) {
		return value;
	}

	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(ALGORITHM, getActiveKey(), iv);
	const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
	const authTag = cipher.getAuthTag();

	return `${ENCRYPTED_PREFIX}${Buffer.concat([iv, authTag, ciphertext]).toString('base64url')}`;
}

function decryptCalendarToken(value: string | null | undefined): {
	value: string | null;
	wasEncrypted: boolean;
} {
	if (!value) {
		return { value: value ?? null, wasEncrypted: false };
	}

	if (!isEncryptedCalendarToken(value)) {
		return { value, wasEncrypted: false };
	}

	const payload = value.slice(ENCRYPTED_PREFIX.length);
	const decoded = Buffer.from(payload, 'base64url');

	if (decoded.length <= IV_LENGTH + AUTH_TAG_LENGTH) {
		throw new Error('Encrypted calendar token payload is malformed');
	}

	const iv = decoded.subarray(0, IV_LENGTH);
	const authTag = decoded.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
	const ciphertext = decoded.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

	for (const key of getKeyCandidates()) {
		try {
			const decipher = createDecipheriv(ALGORITHM, key, iv);
			decipher.setAuthTag(authTag);
			const plaintext = Buffer.concat([
				decipher.update(ciphertext),
				decipher.final()
			]).toString('utf8');

			return { value: plaintext, wasEncrypted: true };
		} catch {
			continue;
		}
	}

	throw new Error('Unable to decrypt calendar token with available keys');
}

function decodeStoredCalendarTokens<T extends StoredCalendarTokenFields>(
	record: T
): T & { requiresEncryptionUpgrade: boolean } {
	const accessToken = decryptCalendarToken(record.access_token);
	const refreshToken = decryptCalendarToken(record.refresh_token);

	return {
		...record,
		access_token: accessToken.value,
		refresh_token: refreshToken.value,
		requiresEncryptionUpgrade:
			(Boolean(record.access_token) && !accessToken.wasEncrypted) ||
			(Boolean(record.refresh_token) && !refreshToken.wasEncrypted)
	};
}

function buildEncryptedCalendarTokenPatch(
	tokens: StoredCalendarTokenPatch
): StoredCalendarTokenPatch {
	const patch: StoredCalendarTokenPatch = {};

	if ('access_token' in tokens && typeof tokens.access_token === 'string') {
		const encryptedAccessToken = encryptCalendarToken(tokens.access_token);
		if (encryptedAccessToken) {
			patch.access_token = encryptedAccessToken;
		}
	}

	if ('refresh_token' in tokens) {
		patch.refresh_token = encryptCalendarToken(tokens.refresh_token);
	}

	return patch;
}

function getStringArg(...values: unknown[]): string | undefined {
	for (const value of values) {
		if (typeof value !== 'string') continue;
		const trimmed = value.trim();
		if (trimmed.length > 0) {
			return trimmed;
		}
	}
	return undefined;
}

function getNumericArg(...values: unknown[]): number | undefined {
	for (const value of values) {
		if (typeof value === 'number' && Number.isFinite(value)) {
			return value;
		}
		if (typeof value === 'string') {
			const parsed = Number(value.trim());
			if (Number.isFinite(parsed)) {
				return parsed;
			}
		}
	}
	return undefined;
}

function getUuidArg(fieldName: string, ...values: unknown[]): string | undefined {
	const value = getStringArg(...values);
	if (!value) {
		return undefined;
	}
	if (!isValidUUID(value)) {
		throw new Error(`Invalid ${fieldName}: expected UUID`);
	}
	return value;
}

function normalizeCalendarId(value?: string | null): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!trimmed || trimmed.length > 200 || /\s/.test(trimmed)) return null;
	if (trimmed === 'primary' || trimmed.includes('@')) return trimmed;
	return null;
}

function normalizeCalendarScope(rawScope: unknown, fallback: CalendarScope): CalendarScope {
	if (typeof rawScope !== 'string') return fallback;
	const normalized = rawScope.trim();
	if (!normalized) return fallback;
	if (normalized === 'user' || normalized === 'project' || normalized === 'calendar_id') {
		return normalized;
	}
	throw new Error('calendar_scope must be one of: user, project, calendar_id');
}

function normalizeLimit(rawLimit: number | undefined): number {
	if (rawLimit === undefined) return DEFAULT_LIST_LIMIT;
	return Math.min(Math.max(Math.floor(rawLimit), 1), MAX_LIST_LIMIT);
}

function normalizeOffset(rawOffset: number | undefined): number {
	if (rawOffset === undefined) return 0;
	return Math.min(Math.max(Math.floor(rawOffset), 0), MAX_LIST_OFFSET);
}

function assertValidTimezone(value: string): string {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
		return value;
	} catch {
		throw new Error(
			`Invalid timezone "${value}". Use an IANA timezone like "America/New_York".`
		);
	}
}

function parseDateTimeInput(value: string, fieldName: string): string {
	const trimmed = value.trim();
	if (!trimmed) {
		throw new Error(`${fieldName} is required`);
	}
	const parsed = new Date(trimmed);
	if (Number.isNaN(parsed.getTime())) {
		throw new Error(`${fieldName} must be a valid date/time`);
	}
	return parsed.toISOString();
}

function eventTimeFromIso(iso: string, timezone?: string | null): calendar_v3.Schema$EventDateTime {
	return {
		dateTime: iso,
		...(timezone ? { timeZone: timezone } : {})
	};
}

function googleEventStart(event: calendar_v3.Schema$Event): string | null {
	return event.start?.dateTime ?? event.start?.date ?? null;
}

function googleEventEnd(event: calendar_v3.Schema$Event): string | null {
	return event.end?.dateTime ?? event.end?.date ?? null;
}

function safeErrorMessage(error: unknown, fallback: string): string {
	return error instanceof Error ? error.message : fallback;
}

class AgentRunCalendarPort implements CalendarPort {
	private readonly admin: SupabaseAdmin;
	private readonly userId: string;
	private readonly clientId: string;
	private readonly clientSecret: string;
	private readonly defaultTimezone: string;
	private readonly clientCache = new Map<string, { client: OAuth2Client; expires: number }>();
	private actorId: string | null = null;

	constructor(params: CreateAgentRunCalendarPortParams) {
		this.admin = params.admin;
		this.userId = params.userId;
		const credentials = resolveGoogleOAuthCredentials(params.credentials);
		this.clientId = credentials.clientId ?? '';
		this.clientSecret = credentials.clientSecret ?? '';
		this.defaultTimezone = params.defaultTimezone ?? DEFAULT_TIMEZONE;
	}

	async listCalendarEvents(args: any): Promise<unknown> {
		const projectId = getUuidArg('project_id', args?.project_id, args?.projectId);
		const textQuery = getStringArg(args?.query, args?.q);
		const requestedScope = getStringArg(args?.calendar_scope, args?.calendarScope);
		const scope = normalizeCalendarScope(requestedScope, projectId ? 'project' : 'user');
		const { timeMin, timeMax, timezone, defaultsApplied } = await this.resolveListRange(args);
		const limit = normalizeLimit(getNumericArg(args?.limit, args?.max_results));
		const offset = normalizeOffset(getNumericArg(args?.offset));
		const fetchLimit = Math.min(limit + offset, MAX_LIST_FETCH);

		const requestedCalendarId = normalizeCalendarId(
			getStringArg(args?.calendar_id, args?.calendarId)
		);
		let googleCalendarId: string | null = null;
		let googleEvents: calendar_v3.Schema$Event[] = [];
		let googleError: string | null = null;

		if (scope === 'project') {
			if (!projectId) {
				throw new Error('project_id is required when calendar_scope is project');
			}
			const projectCalendar = await this.getProjectCalendarRow(projectId);
			if (projectCalendar?.calendar_id && projectCalendar.sync_enabled !== false) {
				googleCalendarId = projectCalendar.calendar_id;
			}
		} else if (scope === 'calendar_id') {
			if (!requestedCalendarId) {
				throw new Error('calendar_id must be a valid Google Calendar ID');
			}
			googleCalendarId = requestedCalendarId;
		} else {
			googleCalendarId = requestedCalendarId ?? 'primary';
		}

		if (googleCalendarId) {
			try {
				googleEvents = await this.listGoogleEvents({
					calendarId: googleCalendarId,
					timeMin,
					timeMax,
					maxResults: fetchLimit,
					q: textQuery
				});
			} catch (error) {
				googleError = safeErrorMessage(error, 'Failed to load Google events');
			}
		}

		let ontoEvents = await this.listOntologyEvents({
			projectId: scope === 'project' ? projectId : undefined,
			timeMin,
			timeMax,
			limit: fetchLimit
		});

		if (textQuery) {
			const normalizedQuery = textQuery.toLowerCase();
			ontoEvents = ontoEvents.filter((event) => {
				const props = ((event.props ?? {}) as Record<string, unknown>) ?? {};
				const taskTitle =
					typeof props.task_title === 'string' ? props.task_title : undefined;
				const candidates = [event.title, event.description, event.location, taskTitle];
				return candidates.some((candidate) =>
					typeof candidate === 'string'
						? candidate.toLowerCase().includes(normalizedQuery)
						: false
				);
			});
		}

		const merged = this.mergeEvents({ googleEvents, ontoEvents });
		const totalAvailable = merged.length;
		const pagedEvents = merged.slice(offset, offset + limit);
		const warnings: string[] = [];

		if (googleError) warnings.push(googleError);
		if (defaultsApplied.timeMin || defaultsApplied.timeMax) {
			warnings.push(
				`Applied default event window (${DEFAULT_LIST_LOOKBACK_DAYS}d past, ${DEFAULT_LIST_LOOKAHEAD_DAYS}d future). Pass timeMin/timeMax or time_min/time_max for exact range control.`
			);
		}

		return {
			events: pagedEvents,
			google_event_count: googleEvents.length,
			ontology_event_count: ontoEvents.length,
			merged_event_count: totalAvailable,
			pagination: {
				offset,
				limit,
				returned: pagedEvents.length,
				total_available: totalAvailable,
				has_more: offset + limit < totalAvailable,
				next_offset: offset + limit < totalAvailable ? offset + limit : null
			},
			queried_range: {
				time_min: timeMin,
				time_max: timeMax,
				timezone,
				query: textQuery ?? null,
				default_time_min_applied: defaultsApplied.timeMin,
				default_time_max_applied: defaultsApplied.timeMax
			},
			warnings
		};
	}

	async getCalendarEventDetails(args: any): Promise<unknown> {
		const ontoEventId = getUuidArg('onto_event_id', args?.onto_event_id);
		if (ontoEventId) {
			const event = await this.getOntologyEvent(ontoEventId);
			if (!event) {
				throw new Error('Event not found');
			}
			return { source: 'ontology', event };
		}

		const eventId = getStringArg(args?.event_id, args?.external_event_id);
		if (!eventId) {
			throw new Error('event_id is required for Google event lookup');
		}

		const calendarId = await this.resolveCalendarIdForScope({
			calendarScope: getStringArg(args?.calendar_scope, args?.calendarScope) as
				| CalendarScope
				| undefined,
			calendarId: getStringArg(args?.calendar_id, args?.calendarId),
			projectId: getStringArg(args?.project_id, args?.projectId)
		});
		const calendar = await this.googleCalendar();
		const response = await calendar.events.get({ calendarId, eventId });
		return { source: 'google', event: response.data };
	}

	async createCalendarEvent(args: any): Promise<unknown> {
		const title = getStringArg(args?.title);
		if (!title) {
			throw new Error('title is required');
		}
		const rawStartAt = getStringArg(args?.start_at);
		if (!rawStartAt) {
			throw new Error('start_at is required');
		}

		const timezone = await this.resolveInputTimezone(args?.timezone);
		const startAt = parseDateTimeInput(rawStartAt, 'start_at');
		const rawEndAt = getStringArg(args?.end_at);
		const endAt = rawEndAt ? parseDateTimeInput(rawEndAt, 'end_at') : null;
		const googleEndAt =
			endAt ?? new Date(Date.parse(startAt) + DEFAULT_EVENT_DURATION_MS).toISOString();
		if (Date.parse(googleEndAt) <= Date.parse(startAt)) {
			throw new Error('end_at must be after start_at');
		}

		const actorId = await this.getActorId();
		let projectId = getUuidArg('project_id', args?.project_id, args?.projectId) ?? null;
		let ownerType: 'task' | 'project' | 'actor' = 'actor';
		let ownerId: string | null = actorId;
		let taskProps: Record<string, unknown> | undefined;
		const taskId = getUuidArg('task_id', args?.task_id, args?.taskId);

		if (taskId) {
			const task = await this.resolveTaskMetadata(taskId, projectId ?? undefined);
			projectId = task.projectId;
			ownerType = 'task';
			ownerId = task.taskId;
			taskProps = {
				task_id: task.taskId,
				task_title: task.taskTitle,
				task_link: task.taskLink,
				project_id: task.projectId,
				task_event_kind: endAt ? 'range' : 'start'
			};
		} else if (projectId) {
			ownerType = 'project';
			ownerId = projectId;
		}

		const syncTarget =
			args?.sync_to_calendar === false
				? null
				: await this.resolveCalendarSyncTarget({
						calendarScope:
							(getStringArg(args?.calendar_scope, args?.calendarScope) as
								| CalendarScope
								| undefined) ?? (projectId ? 'project' : 'user'),
						calendarId: getStringArg(args?.calendar_id, args?.calendarId),
						projectId: projectId ?? undefined
					});

		const eventInsert = {
			id: randomUUID(),
			org_id: null,
			project_id: projectId,
			owner_entity_type: ownerType,
			owner_entity_id: ownerId,
			type_key: ownerType === 'task' ? 'event.task_work' : 'event.general',
			state_key: 'scheduled',
			title,
			description:
				typeof args?.description === 'string' && args.description.trim().length > 0
					? args.description
					: null,
			location:
				typeof args?.location === 'string' && args.location.trim().length > 0
					? args.location
					: null,
			start_at: startAt,
			end_at: endAt,
			timezone,
			created_by: actorId,
			props: (taskProps ?? {}) as Json,
			recurrence: {} as Json,
			all_day: false,
			facet_context: null,
			facet_scale: null,
			facet_stage: null,
			sync_status: args?.sync_to_calendar === false ? 'disabled' : 'pending',
			sync_error: null,
			external_link: null,
			last_synced_at: null
		};

		const { data: createdEvent, error: insertError } = await this.admin
			.from('onto_events')
			.insert(eventInsert)
			.select('*')
			.single();

		if (insertError || !createdEvent) {
			throw new Error(insertError?.message || 'Failed to create event');
		}

		let finalEvent = createdEvent as OntoEventRow;
		let externalEvent: calendar_v3.Schema$Event | null = null;
		let syncRow: OntoEventSyncRow | null = null;

		if (syncTarget) {
			try {
				externalEvent = await this.insertGoogleEvent(syncTarget.googleCalendarId, {
					title,
					description: eventInsert.description,
					location: eventInsert.location,
					startAt,
					endAt: googleEndAt,
					timezone
				});
				const externalEventId = externalEvent.id;
				if (!externalEventId) {
					throw new Error('Google Calendar did not return an event ID');
				}

				if (syncTarget.projectCalendarId) {
					syncRow = await this.upsertEventSync({
						eventId: finalEvent.id,
						projectCalendarId: syncTarget.projectCalendarId,
						externalEventId,
						status: 'synced',
						error: null
					});
				}
				finalEvent = await this.patchEvent(finalEvent.id, {
					props: {
						...((finalEvent.props as Record<string, unknown> | null) ?? {}),
						external_event_id: externalEventId,
						external_calendar_id: syncTarget.googleCalendarId,
						provider: 'google'
					},
					sync_status: 'synced',
					sync_error: null,
					external_link: externalEvent.htmlLink ?? null,
					last_synced_at: new Date().toISOString()
				});
			} catch (error) {
				finalEvent = await this.patchEvent(finalEvent.id, {
					sync_status: 'error',
					sync_error: safeErrorMessage(error, 'Failed to sync event to Google Calendar')
				});
				return {
					source: 'ontology',
					event: finalEvent,
					sync: {
						success: false,
						error: safeErrorMessage(error, 'Failed to sync event to Google Calendar')
					}
				};
			}
		}

		if (taskId && projectId) {
			await this.ensureTaskEventEdge({
				projectId,
				taskId,
				eventId: finalEvent.id
			});
		}

		return {
			source: 'ontology',
			event: {
				...finalEvent,
				onto_event_sync: syncRow ? [syncRow] : []
			},
			...(externalEvent ? { google_event: externalEvent } : {})
		};
	}

	async updateCalendarEvent(args: any): Promise<unknown> {
		const ontoEventId = getUuidArg('onto_event_id', args?.onto_event_id);
		if (ontoEventId) {
			const existing = await this.getOntologyEvent(ontoEventId);
			if (!existing) {
				throw new Error('Event not found');
			}
			const timezone = await this.resolveInputTimezone(args?.timezone ?? existing.timezone);
			const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
			const title = getStringArg(args?.title);
			if (title) patch.title = title;
			if (Object.prototype.hasOwnProperty.call(args ?? {}, 'description')) {
				patch.description = getStringArg(args?.description) ?? null;
			}
			if (Object.prototype.hasOwnProperty.call(args ?? {}, 'location')) {
				patch.location = getStringArg(args?.location) ?? null;
			}
			if (typeof args?.start_at === 'string') {
				patch.start_at = parseDateTimeInput(args.start_at, 'start_at');
			}
			if (Object.prototype.hasOwnProperty.call(args ?? {}, 'end_at')) {
				patch.end_at =
					typeof args.end_at === 'string' && args.end_at.trim()
						? parseDateTimeInput(args.end_at, 'end_at')
						: null;
			}
			if (args?.timezone !== undefined) {
				patch.timezone = timezone;
			}

			const nextStart = String(patch.start_at ?? existing.start_at);
			const nextEnd =
				patch.end_at === null
					? null
					: typeof patch.end_at === 'string'
						? patch.end_at
						: existing.end_at;
			const googleEnd =
				nextEnd ??
				new Date(Date.parse(nextStart) + DEFAULT_EVENT_DURATION_MS).toISOString();
			if (Date.parse(googleEnd) <= Date.parse(nextStart)) {
				throw new Error('end_at must be after start_at');
			}

			let updated = await this.patchEvent(ontoEventId, patch);
			if (args?.sync_to_calendar !== false) {
				const syncRows = this.eventSyncRows(existing);
				for (const sync of syncRows) {
					if (sync.user_id !== this.userId || !sync.external_event_id) continue;
					const googleCalendarId = await this.resolveGoogleCalendarIdForSyncRow(sync);
					if (!googleCalendarId) {
						updated = await this.patchEvent(updated.id, {
							sync_status: 'error',
							sync_error: 'Project calendar mapping not found'
						});
						continue;
					}
					try {
						await this.patchGoogleEvent(googleCalendarId, sync.external_event_id, {
							title: typeof patch.title === 'string' ? patch.title : undefined,
							description:
								Object.prototype.hasOwnProperty.call(patch, 'description') &&
								(typeof patch.description === 'string' ||
									patch.description === null)
									? patch.description
									: undefined,
							location:
								Object.prototype.hasOwnProperty.call(patch, 'location') &&
								(typeof patch.location === 'string' || patch.location === null)
									? patch.location
									: undefined,
							startAt:
								typeof patch.start_at === 'string' ? patch.start_at : undefined,
							endAt:
								typeof patch.start_at === 'string' ||
								Object.prototype.hasOwnProperty.call(patch, 'end_at')
									? googleEnd
									: undefined,
							timezone
						});
						await this.upsertEventSync({
							eventId: updated.id,
							projectCalendarId: sync.calendar_id,
							externalEventId: sync.external_event_id,
							status: 'synced',
							error: null
						});
						updated = await this.patchEvent(updated.id, {
							sync_status: 'synced',
							sync_error: null,
							last_synced_at: new Date().toISOString()
						});
					} catch (error) {
						updated = await this.patchEvent(updated.id, {
							sync_status: 'error',
							sync_error: safeErrorMessage(
								error,
								'Failed to update Google Calendar event'
							)
						});
						throw error;
					}
				}
			}

			return { source: 'ontology', event: updated };
		}

		const eventId = getStringArg(args?.event_id, args?.external_event_id);
		if (!eventId) {
			throw new Error('event_id is required for Google event update');
		}
		const timezone =
			args?.timezone !== undefined ||
			typeof args?.start_at === 'string' ||
			typeof args?.end_at === 'string'
				? await this.resolveInputTimezone(args?.timezone)
				: undefined;
		const startAt =
			typeof args?.start_at === 'string'
				? parseDateTimeInput(args.start_at, 'start_at')
				: undefined;
		const endAt =
			typeof args?.end_at === 'string'
				? parseDateTimeInput(args.end_at, 'end_at')
				: undefined;
		if (startAt && endAt && Date.parse(endAt) <= Date.parse(startAt)) {
			throw new Error('end_at must be after start_at');
		}
		const calendarId = await this.resolveCalendarIdForScope({
			calendarScope: getStringArg(args?.calendar_scope, args?.calendarScope) as
				| CalendarScope
				| undefined,
			calendarId: getStringArg(args?.calendar_id, args?.calendarId),
			projectId: getStringArg(args?.project_id, args?.projectId)
		});
		const updated = await this.patchGoogleEvent(calendarId, eventId, {
			title: getStringArg(args?.title),
			description: Object.prototype.hasOwnProperty.call(args ?? {}, 'description')
				? (getStringArg(args?.description) ?? null)
				: undefined,
			location: Object.prototype.hasOwnProperty.call(args ?? {}, 'location')
				? (getStringArg(args?.location) ?? null)
				: undefined,
			startAt,
			endAt,
			timezone
		});

		return { source: 'google', result: { success: true, event_id: eventId, event: updated } };
	}

	async deleteCalendarEvent(args: any): Promise<unknown> {
		const ontoEventId = getUuidArg('onto_event_id', args?.onto_event_id);
		if (ontoEventId) {
			const existing = await this.getOntologyEvent(ontoEventId);
			if (!existing) {
				throw new Error('Event not found');
			}
			if (args?.sync_to_calendar !== false) {
				for (const sync of this.eventSyncRows(existing)) {
					if (sync.user_id !== this.userId || !sync.external_event_id) continue;
					const googleCalendarId = await this.resolveGoogleCalendarIdForSyncRow(sync);
					if (!googleCalendarId) continue;
					await this.deleteGoogleEvent(googleCalendarId, sync.external_event_id);
					await this.upsertEventSync({
						eventId: existing.id,
						projectCalendarId: sync.calendar_id,
						externalEventId: sync.external_event_id,
						status: 'deleted',
						error: null
					});
				}
			}
			const deleted = await this.patchEvent(ontoEventId, {
				deleted_at: new Date().toISOString(),
				sync_status: 'deleted',
				updated_at: new Date().toISOString()
			});
			return { source: 'ontology', event: deleted };
		}

		const eventId = getStringArg(args?.event_id, args?.external_event_id);
		if (!eventId) {
			throw new Error('event_id is required for Google event delete');
		}
		const calendarId = await this.resolveCalendarIdForScope({
			calendarScope: getStringArg(args?.calendar_scope, args?.calendarScope) as
				| CalendarScope
				| undefined,
			calendarId: getStringArg(args?.calendar_id, args?.calendarId),
			projectId: getStringArg(args?.project_id, args?.projectId)
		});
		await this.deleteGoogleEvent(calendarId, eventId);
		return {
			source: 'google',
			result: {
				success: true,
				event_id: eventId,
				message: 'Calendar event deleted successfully'
			}
		};
	}

	async getProjectCalendar(args: any): Promise<unknown> {
		const projectId = getUuidArg('project_id', args?.project_id, args?.projectId);
		if (!projectId) {
			throw new Error('project_id is required');
		}
		const calendar = await this.getProjectCalendarRow(projectId);
		if (!calendar) {
			return null;
		}
		return {
			...calendar,
			sync_mode: await this.getProjectCalendarSyncMode(projectId)
		};
	}

	async setProjectCalendar(args: any): Promise<unknown> {
		const projectId = getUuidArg('project_id', args?.project_id, args?.projectId);
		if (!projectId) {
			throw new Error('project_id is required');
		}
		const requestedCalendarId =
			typeof args?.calendar_id === 'string' ? normalizeCalendarId(args.calendar_id) : null;
		if (args?.calendar_id && !requestedCalendarId) {
			throw new Error('calendar_id must be a valid Google Calendar ID');
		}

		const existing = await this.getProjectCalendarRow(projectId);
		if (!existing || args?.action === 'create') {
			if (existing) {
				throw new Error('Calendar already exists for this project');
			}
			return this.createProjectCalendarMapping({
				projectId,
				name: getStringArg(args?.name),
				description: getStringArg(args?.description),
				colorId: getStringArg(args?.color_id),
				calendarId: requestedCalendarId ?? undefined
			});
		}

		return this.updateProjectCalendarMapping(existing, {
			name: getStringArg(args?.name),
			description: getStringArg(args?.description),
			colorId: getStringArg(args?.color_id),
			syncEnabled: typeof args?.sync_enabled === 'boolean' ? args.sync_enabled : undefined
		});
	}

	private requireClientId(): string {
		if (!this.clientId) {
			throw new Error('Google OAuth client ID is not configured');
		}
		return this.clientId;
	}

	private requireClientSecret(): string {
		if (!this.clientSecret) {
			throw new Error('Google OAuth client secret is not configured');
		}
		return this.clientSecret;
	}

	private createOAuth2Client(): OAuth2Client {
		return new google.auth.OAuth2(this.requireClientId(), this.requireClientSecret());
	}

	private async getAuthenticatedClient(): Promise<OAuth2Client> {
		const cached = this.clientCache.get(this.userId);
		if (cached && cached.expires > Date.now()) {
			return cached.client;
		}

		const tokens = await this.getTokens();
		if (!tokens?.access_token || !tokens.refresh_token) {
			throw new Error('No calendar connection found. Please connect Google Calendar.');
		}

		const oauth2Client = this.createOAuth2Client();
		oauth2Client.setCredentials({
			access_token: tokens.access_token,
			refresh_token: tokens.refresh_token,
			expiry_date: tokens.expiry_date ?? undefined,
			token_type: tokens.token_type || 'Bearer',
			scope: tokens.scope || 'https://www.googleapis.com/auth/calendar'
		});

		oauth2Client.on('tokens', (newTokens) => {
			void this.updateTokens(newTokens).catch((error) => {
				console.error('Failed to update calendar tokens after refresh:', error);
			});
		});

		if (tokens.expiry_date && tokens.expiry_date < Date.now() + 5 * 60 * 1000) {
			try {
				const { credentials } = await oauth2Client.refreshAccessToken();
				await this.updateTokens(credentials);
				oauth2Client.setCredentials({
					...credentials,
					refresh_token: credentials.refresh_token ?? tokens.refresh_token
				});
			} catch {
				throw new Error(
					'Calendar authentication expired. Please reconnect Google Calendar.'
				);
			}
		}

		this.clientCache.set(this.userId, {
			client: oauth2Client,
			expires: Date.now() + 10 * 60 * 1000
		});

		return oauth2Client;
	}

	private async getTokens(): Promise<
		(StoredCalendarTokenFields & { requiresEncryptionUpgrade: boolean }) | null
	> {
		const { data, error } = await this.admin
			.from('user_calendar_tokens')
			.select('access_token, refresh_token, expiry_date, scope, updated_at, token_type')
			.eq('user_id', this.userId)
			.maybeSingle();

		if (error || !data) {
			return null;
		}

		const normalizedTokens = decodeStoredCalendarTokens(data as StoredCalendarTokenFields);
		if (normalizedTokens.requiresEncryptionUpgrade) {
			await this.upgradeStoredTokensIfNeeded(normalizedTokens);
		}

		return normalizedTokens;
	}

	private async upgradeStoredTokensIfNeeded(tokens: StoredCalendarTokenFields): Promise<void> {
		const encryptedPatch = buildEncryptedCalendarTokenPatch({
			...(typeof tokens.access_token === 'string'
				? { access_token: tokens.access_token }
				: {}),
			...('refresh_token' in tokens ? { refresh_token: tokens.refresh_token ?? null } : {})
		});

		if (Object.keys(encryptedPatch).length === 0) {
			return;
		}

		const { error } = await this.admin
			.from('user_calendar_tokens')
			.update(encryptedPatch)
			.eq('user_id', this.userId);

		if (error) {
			throw new Error(error.message || 'Failed to upgrade calendar token encryption');
		}
	}

	private async updateTokens(credentials: {
		access_token?: string | null;
		refresh_token?: string | null;
		expiry_date?: number | null;
		token_type?: string | null;
		scope?: string | null;
	}): Promise<void> {
		const encryptedPatch = buildEncryptedCalendarTokenPatch({
			...(credentials.access_token !== undefined
				? { access_token: credentials.access_token ?? null }
				: {}),
			...(credentials.refresh_token !== undefined
				? { refresh_token: credentials.refresh_token ?? null }
				: {})
		});

		const { error } = await this.admin
			.from('user_calendar_tokens')
			.update({
				...encryptedPatch,
				expiry_date: credentials.expiry_date || null,
				token_type: credentials.token_type || 'Bearer',
				scope: credentials.scope || undefined,
				updated_at: new Date().toISOString()
			})
			.eq('user_id', this.userId);

		if (error) {
			throw new Error(error.message || 'Failed to update calendar tokens');
		}

		this.clientCache.delete(this.userId);
	}

	private async googleCalendar(): Promise<calendar_v3.Calendar> {
		const auth = await this.getAuthenticatedClient();
		return google.calendar({ version: 'v3', auth });
	}

	private async getActorId(): Promise<string> {
		if (!this.actorId) {
			this.actorId = await ensureActorId(this.admin, this.userId);
		}
		return this.actorId;
	}

	private async getUserTimezone(): Promise<string> {
		const { data } = await this.admin
			.from('users')
			.select('timezone')
			.eq('id', this.userId)
			.maybeSingle();

		const timezone = typeof data?.timezone === 'string' ? data.timezone : this.defaultTimezone;
		try {
			return assertValidTimezone(timezone);
		} catch {
			return DEFAULT_TIMEZONE;
		}
	}

	private async resolveInputTimezone(candidate?: string | null): Promise<string> {
		const trimmed = typeof candidate === 'string' ? candidate.trim() : '';
		if (!trimmed) {
			return this.getUserTimezone();
		}
		return assertValidTimezone(trimmed);
	}

	private async resolveListRange(args: any): Promise<{
		timeMin: string;
		timeMax: string;
		timezone: string;
		defaultsApplied: { timeMin: boolean; timeMax: boolean };
	}> {
		const timezone = await this.resolveInputTimezone(args?.timezone);
		const rawTimeMin = getStringArg(args?.timeMin, args?.time_min);
		const rawTimeMax = getStringArg(args?.timeMax, args?.time_max);
		const defaultsApplied = { timeMin: false, timeMax: false };
		const now = Date.now();

		const timeMin = rawTimeMin
			? parseDateTimeInput(rawTimeMin, 'timeMin')
			: new Date(now - DEFAULT_LIST_LOOKBACK_DAYS * DAY_IN_MS).toISOString();
		const timeMax = rawTimeMax
			? parseDateTimeInput(rawTimeMax, 'timeMax')
			: new Date(now + DEFAULT_LIST_LOOKAHEAD_DAYS * DAY_IN_MS).toISOString();

		defaultsApplied.timeMin = !rawTimeMin;
		defaultsApplied.timeMax = !rawTimeMax;

		if (Date.parse(timeMax) < Date.parse(timeMin)) {
			throw new Error('timeMax/time_max must be after timeMin/time_min');
		}

		return { timeMin, timeMax, timezone, defaultsApplied };
	}

	private async resolveCalendarIdForScope(input: {
		calendarScope?: CalendarScope;
		calendarId?: string;
		projectId?: string;
	}): Promise<string> {
		const projectId = getUuidArg('project_id', input.projectId);
		const scope = normalizeCalendarScope(input.calendarScope, projectId ? 'project' : 'user');
		const requestedCalendarId = normalizeCalendarId(input.calendarId);

		if (scope === 'project') {
			if (!projectId) {
				throw new Error('project_id is required when calendar_scope is project');
			}
			const projectCalendar = await this.getProjectCalendarRow(projectId);
			if (!projectCalendar?.calendar_id) {
				throw new Error('Project calendar not found');
			}
			if (projectCalendar.sync_enabled === false) {
				throw new Error('Project calendar sync is disabled');
			}
			return projectCalendar.calendar_id;
		}

		if (scope === 'calendar_id') {
			if (!requestedCalendarId) {
				throw new Error('calendar_id must be a valid Google Calendar ID');
			}
			return requestedCalendarId;
		}

		return requestedCalendarId ?? 'primary';
	}

	private async resolveCalendarSyncTarget(input: {
		calendarScope?: CalendarScope;
		calendarId?: string;
		projectId?: string;
	}): Promise<{ googleCalendarId: string; projectCalendarId: string | null }> {
		const projectId = getUuidArg('project_id', input.projectId);
		const scope = normalizeCalendarScope(input.calendarScope, projectId ? 'project' : 'user');
		const requestedCalendarId = normalizeCalendarId(input.calendarId);

		if (scope === 'project') {
			if (!projectId) {
				throw new Error('project_id is required when calendar_scope is project');
			}
			const projectCalendar = await this.getProjectCalendarRow(projectId);
			if (!projectCalendar?.calendar_id) {
				throw new Error('Project calendar not found');
			}
			if (projectCalendar.sync_enabled === false) {
				throw new Error('Project calendar sync is disabled');
			}
			return {
				googleCalendarId: projectCalendar.calendar_id,
				projectCalendarId: projectCalendar.id
			};
		}

		if (scope === 'calendar_id') {
			if (!requestedCalendarId) {
				throw new Error('calendar_id must be a valid Google Calendar ID');
			}
			return { googleCalendarId: requestedCalendarId, projectCalendarId: null };
		}

		return { googleCalendarId: requestedCalendarId ?? 'primary', projectCalendarId: null };
	}

	private async resolveGoogleCalendarIdForSyncRow(
		sync: Pick<OntoEventSyncRow, 'calendar_id'>
	): Promise<string | null> {
		const { data, error } = await this.admin
			.from('project_calendars')
			.select('calendar_id')
			.eq('id', sync.calendar_id)
			.eq('user_id', this.userId)
			.maybeSingle();

		if (error) {
			throw new Error(error.message || 'Failed to resolve project calendar mapping');
		}

		return typeof data?.calendar_id === 'string' ? data.calendar_id : null;
	}

	private async getProjectCalendarRow(projectId: string): Promise<ProjectCalendarRow | null> {
		const { data, error } = await this.admin
			.from('project_calendars')
			.select('*')
			.eq('project_id', projectId)
			.eq('user_id', this.userId)
			.maybeSingle();

		if (error) {
			throw new Error(error.message || 'Failed to load project calendar');
		}

		return (data as ProjectCalendarRow | null) ?? null;
	}

	private async getProjectCalendarSyncMode(
		projectId: string
	): Promise<'actor_projection' | 'member_fanout'> {
		const { data } = await this.admin
			.from('onto_projects')
			.select('props')
			.eq('id', projectId)
			.is('deleted_at', null)
			.maybeSingle();
		const props = (data?.props as Record<string, unknown> | null) ?? {};
		return props.calendar_sync_mode === 'member_fanout' ? 'member_fanout' : 'actor_projection';
	}

	private async listGoogleEvents(params: {
		calendarId: string;
		timeMin: string;
		timeMax: string;
		maxResults: number;
		q?: string;
	}): Promise<calendar_v3.Schema$Event[]> {
		const calendar = await this.googleCalendar();
		const response = await calendar.events.list({
			calendarId: params.calendarId,
			timeMin: params.timeMin,
			timeMax: params.timeMax,
			maxResults: params.maxResults,
			q: params.q,
			singleEvents: true,
			orderBy: 'startTime'
		});

		return response.data.items ?? [];
	}

	private async listOntologyEvents(params: {
		projectId?: string;
		timeMin: string;
		timeMax: string;
		limit: number;
	}): Promise<Array<OntoEventRow & { onto_event_sync?: OntoEventSyncRow[] }>> {
		const actorId = await this.getActorId();
		let query = this.admin
			.from('onto_events')
			.select(
				`*,
				onto_event_sync (
					id,
					calendar_id,
					user_id,
					provider,
					external_event_id,
					sync_status,
					sync_error,
					last_synced_at
				)`
			)
			.eq(params.projectId ? 'project_id' : 'created_by', params.projectId ?? actorId)
			.is('deleted_at', null)
			.gte('start_at', params.timeMin)
			.lte('start_at', params.timeMax)
			.order('start_at', { ascending: true })
			.limit(params.limit);

		const { data, error } = await query;
		if (error) {
			throw new Error(error.message || 'Failed to load ontology events');
		}

		return ((data ?? []) as Array<OntoEventRow & { onto_event_sync?: OntoEventSyncRow[] }>).map(
			(event) => ({
				...event,
				onto_event_sync: this.eventSyncRows(event)
			})
		);
	}

	private async getOntologyEvent(
		eventId: string
	): Promise<(OntoEventRow & { onto_event_sync?: OntoEventSyncRow[] }) | null> {
		const { data, error } = await this.admin
			.from('onto_events')
			.select(
				`*,
				onto_event_sync (
					id,
					calendar_id,
					user_id,
					provider,
					external_event_id,
					sync_status,
					sync_error,
					last_synced_at
				)`
			)
			.eq('id', eventId)
			.is('deleted_at', null)
			.maybeSingle();

		if (error) {
			throw new Error(error.message || 'Failed to load event');
		}
		if (!data) {
			return null;
		}

		return {
			...(data as OntoEventRow & { onto_event_sync?: OntoEventSyncRow[] }),
			onto_event_sync: this.eventSyncRows(
				data as OntoEventRow & { onto_event_sync?: OntoEventSyncRow[] }
			)
		};
	}

	private eventSyncRows(event: { onto_event_sync?: unknown }): OntoEventSyncRow[] {
		return Array.isArray(event.onto_event_sync)
			? (event.onto_event_sync as OntoEventSyncRow[]).filter(
					(sync) => sync.user_id === this.userId
				)
			: [];
	}

	private mergeEvents(params: {
		googleEvents: calendar_v3.Schema$Event[];
		ontoEvents: Array<OntoEventRow & { onto_event_sync?: OntoEventSyncRow[] }>;
	}): Array<Record<string, unknown>> {
		const googleById = new Map<string, calendar_v3.Schema$Event>();
		for (const event of params.googleEvents) {
			if (event.id) {
				googleById.set(event.id, event);
			}
		}

		const merged: Array<Record<string, unknown>> = [];
		for (const event of params.ontoEvents) {
			const syncRows = this.eventSyncRows(event);
			const externalId = syncRows[0]?.external_event_id ?? null;
			const matchedGoogle = externalId ? googleById.get(externalId) : undefined;
			if (externalId) {
				googleById.delete(externalId);
			}
			const props = ((event.props ?? {}) as Record<string, unknown>) ?? {};
			merged.push({
				source: 'ontology',
				is_synced: Boolean(externalId),
				external_event_id: externalId ?? matchedGoogle?.id ?? null,
				onto_event_id: event.id,
				title: event.title,
				start_at: event.start_at,
				end_at: event.end_at,
				owner_entity_type: event.owner_entity_type,
				owner_entity_id: event.owner_entity_id,
				task_link: typeof props.task_link === 'string' ? props.task_link : null,
				sync_status: event.sync_status,
				sync_error: event.sync_error,
				event
			});
		}

		for (const event of googleById.values()) {
			merged.push({
				source: 'google',
				is_synced: false,
				external_event_id: event.id ?? null,
				title: event.summary ?? null,
				start_at: googleEventStart(event),
				end_at: googleEventEnd(event),
				event
			});
		}

		return merged.sort((a, b) => {
			const aTime = new Date(String(a.start_at ?? 0)).getTime();
			const bTime = new Date(String(b.start_at ?? 0)).getTime();
			return aTime - bTime;
		});
	}

	private async insertGoogleEvent(
		calendarId: string,
		input: {
			title: string;
			description: string | null;
			location: string | null;
			startAt: string;
			endAt: string;
			timezone: string;
		}
	): Promise<calendar_v3.Schema$Event> {
		const calendar = await this.googleCalendar();
		const response = await calendar.events.insert({
			calendarId,
			requestBody: {
				summary: input.title,
				description: input.description ?? undefined,
				location: input.location ?? undefined,
				start: eventTimeFromIso(input.startAt, input.timezone),
				end: eventTimeFromIso(input.endAt, input.timezone)
			}
		});
		return response.data;
	}

	private async patchGoogleEvent(
		calendarId: string,
		eventId: string,
		input: {
			title?: string;
			description?: string | null;
			location?: string | null;
			startAt?: string;
			endAt?: string;
			timezone?: string;
		}
	): Promise<calendar_v3.Schema$Event> {
		const requestBody: calendar_v3.Schema$Event = {};
		if (input.title !== undefined) requestBody.summary = input.title;
		if (input.description !== undefined)
			requestBody.description = input.description ?? undefined;
		if (input.location !== undefined) requestBody.location = input.location ?? undefined;
		if (input.startAt) requestBody.start = eventTimeFromIso(input.startAt, input.timezone);
		if (input.endAt) requestBody.end = eventTimeFromIso(input.endAt, input.timezone);

		const calendar = await this.googleCalendar();
		const response = await calendar.events.patch({
			calendarId,
			eventId,
			requestBody
		});
		return response.data;
	}

	private async deleteGoogleEvent(calendarId: string, eventId: string): Promise<void> {
		const calendar = await this.googleCalendar();
		await calendar.events.delete({
			calendarId,
			eventId,
			sendUpdates: 'none'
		});
	}

	private async patchEvent(
		eventId: string,
		patch: Record<string, unknown>
	): Promise<OntoEventRow> {
		const { data, error } = await this.admin
			.from('onto_events')
			.update(patch)
			.eq('id', eventId)
			.select('*')
			.single();

		if (error || !data) {
			throw new Error(error?.message || 'Failed to update event');
		}

		return data as OntoEventRow;
	}

	private async upsertEventSync(input: {
		eventId: string;
		projectCalendarId: string;
		externalEventId: string;
		status: string;
		error: string | null;
	}): Promise<OntoEventSyncRow> {
		const now = new Date().toISOString();
		const payload = {
			event_id: input.eventId,
			user_id: this.userId,
			provider: 'google',
			calendar_id: input.projectCalendarId,
			external_event_id: input.externalEventId,
			sync_status: input.status,
			sync_error: input.error,
			last_synced_at: input.error ? null : now,
			updated_at: now
		};
		const { data, error } = await this.admin
			.from('onto_event_sync')
			.upsert(payload, { onConflict: 'event_id,user_id,provider' })
			.select('*')
			.single();

		if (error || !data) {
			throw new Error(error?.message || 'Failed to update event sync state');
		}

		return data as OntoEventSyncRow;
	}

	private async resolveTaskMetadata(
		taskId: string,
		expectedProjectId?: string
	): Promise<{
		taskId: string;
		taskTitle: string;
		projectId: string;
		taskLink: string;
	}> {
		const { data: task, error } = await this.admin
			.from('onto_tasks')
			.select('id, title, project_id')
			.eq('id', taskId)
			.is('deleted_at', null)
			.maybeSingle();

		if (error) {
			throw new Error(error.message || 'Failed to load task');
		}
		if (!task) {
			throw new Error('Task not found');
		}
		if (expectedProjectId && task.project_id !== expectedProjectId) {
			throw new Error('Task does not belong to the specified project');
		}

		return {
			taskId: task.id,
			taskTitle: task.title ?? 'Task',
			projectId: task.project_id,
			taskLink: `/projects/${task.project_id}/tasks/${task.id}`
		};
	}

	private async ensureTaskEventEdge(input: {
		projectId: string;
		taskId: string;
		eventId: string;
	}): Promise<void> {
		const { data: existingEdge } = await this.admin
			.from('onto_edges')
			.select('id')
			.eq('src_id', input.taskId)
			.eq('src_kind', 'task')
			.eq('dst_id', input.eventId)
			.eq('dst_kind', 'event')
			.eq('rel', 'has_event')
			.maybeSingle();

		if (existingEdge) {
			return;
		}

		await this.admin.from('onto_edges').insert({
			project_id: input.projectId,
			src_id: input.taskId,
			src_kind: 'task',
			dst_id: input.eventId,
			dst_kind: 'event',
			rel: 'has_event'
		});
	}

	private async createProjectCalendarMapping(input: {
		projectId: string;
		name?: string;
		description?: string;
		colorId?: string;
		calendarId?: string;
	}): Promise<ProjectCalendarRow> {
		const { data: project, error: projectError } = await this.admin
			.from('onto_projects')
			.select('id, name, description, props')
			.eq('id', input.projectId)
			.is('deleted_at', null)
			.maybeSingle();
		if (projectError || !project) {
			throw new Error(projectError?.message || 'Project not found');
		}

		const calendarName = input.name || `${project.name} - Tasks`;
		const calendarDescription =
			input.description || project.description || `Tasks and events for ${project.name}`;
		const colorId = this.normalizeColorId(input.colorId) ?? '7';
		let mappedCalendarId = input.calendarId ?? null;
		let mappedCalendarName = calendarName;
		let createdGoogleCalendarId: string | null = null;

		if (mappedCalendarId) {
			const matchedCalendar = await this.findUserCalendar(mappedCalendarId);
			if (!matchedCalendar) {
				throw new Error('Selected Google calendar was not found');
			}
			if (
				matchedCalendar.accessRole === 'reader' ||
				matchedCalendar.accessRole === 'freeBusyReader'
			) {
				throw new Error(
					'Selected Google calendar is read-only. Choose a writable calendar.'
				);
			}
			mappedCalendarName = input.name || matchedCalendar.summary || calendarName;
		} else {
			const timezone = await this.getUserTimezone();
			const calendar = await this.googleCalendar();
			const response = await calendar.calendars.insert({
				requestBody: {
					summary: calendarName,
					description: calendarDescription,
					timeZone: timezone
				}
			});
			mappedCalendarId = response.data.id ?? null;
			if (!mappedCalendarId) {
				throw new Error('Google Calendar did not return a calendar ID');
			}
			createdGoogleCalendarId = mappedCalendarId;
		}

		await this.patchCalendarListColor(mappedCalendarId, colorId).catch(() => undefined);

		const { data, error } = await this.admin
			.from('project_calendars')
			.insert({
				project_id: input.projectId,
				user_id: this.userId,
				calendar_id: mappedCalendarId,
				calendar_name: mappedCalendarName,
				color_id: colorId,
				hex_color: GOOGLE_CALENDAR_HEX_COLORS[colorId] ?? GOOGLE_CALENDAR_HEX_COLORS['7'],
				is_primary: false,
				sync_enabled: true,
				visibility: 'private',
				sync_status: 'active'
			})
			.select('*')
			.single();

		if (error || !data) {
			if (createdGoogleCalendarId) {
				const calendar = await this.googleCalendar();
				await calendar.calendars
					.delete({ calendarId: createdGoogleCalendarId })
					.catch(() => undefined);
			}
			throw new Error(error?.message || 'Failed to save project calendar mapping');
		}

		return data as ProjectCalendarRow;
	}

	private async updateProjectCalendarMapping(
		existing: ProjectCalendarRow,
		input: {
			name?: string;
			description?: string;
			colorId?: string;
			syncEnabled?: boolean;
		}
	): Promise<ProjectCalendarRow> {
		const colorId = this.normalizeColorId(input.colorId);
		const calendar = await this.googleCalendar();
		const calendarPatch: calendar_v3.Schema$Calendar = {};
		if (input.name) calendarPatch.summary = input.name;
		if (input.description) calendarPatch.description = input.description;
		if (Object.keys(calendarPatch).length > 0) {
			await calendar.calendars.patch({
				calendarId: existing.calendar_id,
				requestBody: calendarPatch
			});
		}
		if (colorId) {
			await this.patchCalendarListColor(existing.calendar_id, colorId).catch(() => undefined);
		}

		const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
		if (input.name) patch.calendar_name = input.name;
		if (colorId) {
			patch.color_id = colorId;
			patch.hex_color = GOOGLE_CALENDAR_HEX_COLORS[colorId] ?? null;
		}
		if (typeof input.syncEnabled === 'boolean') patch.sync_enabled = input.syncEnabled;
		if (Object.keys(calendarPatch).length > 0 || colorId) patch.sync_status = 'active';

		const { data, error } = await this.admin
			.from('project_calendars')
			.update(patch)
			.eq('id', existing.id)
			.select('*')
			.single();

		if (error || !data) {
			throw new Error(error?.message || 'Failed to update project calendar mapping');
		}

		return data as ProjectCalendarRow;
	}

	private normalizeColorId(value?: string): string | null {
		if (!value) return null;
		const trimmed = value.trim();
		return Object.prototype.hasOwnProperty.call(GOOGLE_CALENDAR_HEX_COLORS, trimmed)
			? trimmed
			: null;
	}

	private async findUserCalendar(
		calendarId: string
	): Promise<calendar_v3.Schema$CalendarListEntry | null> {
		const calendar = await this.googleCalendar();
		const response = await calendar.calendarList.list({
			showHidden: false,
			showDeleted: false
		});
		return response.data.items?.find((item) => item.id === calendarId) ?? null;
	}

	private async patchCalendarListColor(calendarId: string, colorId: string): Promise<void> {
		const calendar = await this.googleCalendar();
		await calendar.calendarList.patch({
			calendarId,
			requestBody: { colorId }
		});
	}
}

export function createAgentRunCalendarPort(params: CreateAgentRunCalendarPortParams): CalendarPort {
	return new AgentRunCalendarPort(params);
}
