// apps/worker/src/workers/agentic-chat/tools/calendar-read-port.ts
//
// Worker adapter for `AgenticChatCalendarReadPortV1` — the provider half of the
// three shared calendar READ tools. It composes the same source-aware services
// web uses (`createWorkerGoogleCalendarServices`) plus the shared
// project-calendar row read.
//
// Two properties this file must keep:
//
//  1. Nothing here touches OAuth environment variables at construction time.
//     `createWorkerGoogleCalendarServices` resolves credentials lazily inside
//     the credential service, so a worker deployed without the Calendar OAuth
//     env still boots; a calendar read then reports
//     `credentials_not_configured` as `coverage: 'unavailable'` instead of
//     throwing an unhandled error or blaming Google.
//  2. There is NO legacy single-OAuth-account fallback. A user with no active
//     source-aware read target gets `coverage: 'unavailable'` with
//     `reason_code: 'not_connected'`, never an empty event list.
//
// Authorization: the port is bound to the turn's trusted `userId` claim and
// refuses any input carrying a different one. Project membership is asserted by
// the shared read tools through the access port before they call in here.

import type { Database } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import {
	type AgenticChatCalendarEventV1,
	type AgenticChatCalendarGetEventResultV1,
	type AgenticChatCalendarListEventsInputV1,
	type AgenticChatCalendarListEventsResultV1,
	type AgenticChatCalendarReadPortV1,
	type AgenticChatProjectCalendarInputV1,
	type AgenticChatProjectCalendarV1,
	resolveCalendarReadCoverage
} from '@buildos/agentic-chat-runtime/tools';
import { ProjectCalendarReadService } from '@buildos/shared-agent-ops/calendar/project-calendar-read.service';
import { GoogleCalendarConnectionError } from '@buildos/shared-agent-ops/calendar/google-calendar-runtime';
import {
	type WorkerGoogleCalendarServicesOptions,
	createWorkerGoogleCalendarServices
} from './calendar-services';

type WorkerGoogleCalendarServices = ReturnType<typeof createWorkerGoogleCalendarServices>;

/**
 * Connection-level failures mean "there is no calendar to ask", not "the read
 * failed". They become `coverage: 'unavailable'` with the reason attached; any
 * other error still throws so the turn records a real tool failure.
 */
const CONNECTION_LEVEL_REASON_CODES = new Map<string, string>([
	// Provider error code -> the reason code the model-facing tools speak. The
	// two credential codes are deliberately renamed: `not_configured` and
	// `database_error` read like transient provider trouble, and the model told a
	// user a missing server variable was "a transient issue on Google's side".
	['not_configured', 'credentials_not_configured'],
	['database_error', 'credentials_unreadable'],
	['connection_not_found', 'connection_not_found'],
	['source_not_found', 'source_not_found'],
	['refresh_token_required', 'refresh_token_required'],
	['reconnect_required', 'reconnect_required']
]);

function connectionLevelReasonCode(error: unknown): string | null {
	const code = (error as { code?: unknown } | null)?.code;
	if (typeof code !== 'string') return null;
	// Bundle boundaries can break instanceof; match by shape as the calendar
	// services themselves do.
	const name = (error as { name?: unknown } | null)?.name;
	if (
		error instanceof GoogleCalendarConnectionError ||
		name === 'GoogleCalendarConnectionError'
	) {
		return CONNECTION_LEVEL_REASON_CODES.get(code) ?? null;
	}
	// A source that is not enabled for reading is that source's problem, not a
	// failed tool call. Report it instead of throwing the whole read away.
	if (name === 'GoogleCalendarTargetError' && code === 'CALENDAR_SOURCE_NOT_CAPABLE') {
		return 'source_not_readable';
	}
	return null;
}

function unavailableListResult(reasonCode: string): AgenticChatCalendarListEventsResultV1 {
	return {
		events: [],
		mode: 'none',
		coverage: 'unavailable',
		sourceCount: 0,
		successfulSourceCount: 0,
		failedSourceCount: 0,
		partial: false,
		sourceFailures: [
			{ calendar: '', calendar_source_id: '', connection_id: '', reason_code: reasonCode }
		]
	};
}

function toPortEvent(event: Record<string, any>): AgenticChatCalendarEventV1 {
	return {
		id: event.id ?? null,
		providerEventId: event.providerEventId ?? event.id ?? null,
		calendarSourceId: event.calendarSourceId ?? null,
		connectionId: event.connectionId ?? null,
		providerCalendarId: event.providerCalendarId ?? null,
		calendarSummary: event.calendarSummary ?? null,
		connectionLabel: event.connectionLabel ?? null,
		summary: event.summary ?? null,
		description: event.description ?? null,
		location: event.location ?? null,
		status: event.status ?? null,
		htmlLink: event.htmlLink ?? null,
		start: event.start ?? null,
		end: event.end ?? null,
		contributingSourceEvents: event.contributingSourceEvents ?? [],
		// The legacy web tool echoed the aggregated provider event back to the
		// model verbatim; carry it so the shared tool can do the same.
		raw: event
	};
}

export type WorkerAgenticChatCalendarReadPortOptions = {
	/** Test seam: supply the composed provider services instead of building them. */
	services?: () => WorkerGoogleCalendarServices;
	serviceOptions?: WorkerGoogleCalendarServicesOptions;
};

/**
 * Binds one calendar read port to a single trusted user id for the duration of
 * a turn. Provider services are built on first use, never at construction.
 */
export function createWorkerAgenticChatCalendarReadPort(input: {
	client: SupabaseClient<Database>;
	userId: string;
	options?: WorkerAgenticChatCalendarReadPortOptions;
}): AgenticChatCalendarReadPortV1 {
	const { client, userId } = input;
	const options = input.options ?? {};
	let services: WorkerGoogleCalendarServices | null = null;

	const requireServices = (): WorkerGoogleCalendarServices => {
		if (!services) {
			services = options.services
				? options.services()
				: createWorkerGoogleCalendarServices(
						client as unknown as TypedSupabaseClient,
						options.serviceOptions
					);
		}
		return services;
	};

	const assertBoundUser = (candidate: string): void => {
		if (candidate !== userId) {
			throw new Error('Calendar read port received a userId outside the turn claim');
		}
	};

	return {
		async listEvents(
			listInput: AgenticChatCalendarListEventsInputV1
		): Promise<AgenticChatCalendarListEventsResultV1> {
			assertBoundUser(listInput.userId);
			let response;
			try {
				response = await requireServices().read.listEvents({
					userId,
					calendarSourceId: listInput.calendarSourceId,
					calendarId: listInput.calendarId,
					timeMin: listInput.timeMin,
					timeMax: listInput.timeMax,
					maxResults: listInput.maxResults,
					q: listInput.query,
					timeZone: listInput.timeZone,
					budgetMs: listInput.budgetMs
				});
			} catch (error) {
				const reasonCode = connectionLevelReasonCode(error);
				if (reasonCode) return unavailableListResult(reasonCode);
				throw error;
			}

			const sourceStatuses = response.sourceStatuses ?? [];
			// The worker has no legacy single-account route, so zero enabled read
			// targets means nothing was read at all. Reporting that as vacuously
			// "complete" would let the model call an empty list proof of free time.
			if (sourceStatuses.length === 0) return unavailableListResult('not_connected');

			const successfulSourceCount = sourceStatuses.filter(
				(status) => status.status === 'success'
			).length;
			const sourceCount = sourceStatuses.length;
			return {
				events: (response.events ?? []).map((event) =>
					toPortEvent(event as unknown as Record<string, any>)
				),
				mode: 'source_aware',
				coverage: resolveCalendarReadCoverage(sourceCount, successfulSourceCount),
				sourceCount,
				successfulSourceCount,
				failedSourceCount: sourceCount - successfulSourceCount,
				partial: Boolean(response.partial),
				sourceFailures: sourceStatuses
					.filter((status) => status.status !== 'success')
					.map((status) => ({
						calendar: status.providerCalendarId,
						calendar_source_id: status.calendarSourceId,
						connection_id: status.connectionId,
						reason_code: status.reasonCode ?? 'provider_error'
					}))
			};
		},

		async getEvent(getInput): Promise<AgenticChatCalendarGetEventResultV1> {
			assertBoundUser(getInput.userId);
			const empty = (reasonCode: string): AgenticChatCalendarGetEventResultV1 => ({
				event: null,
				calendarSourceId: null,
				connectionId: null,
				providerCalendarId: null,
				reasonCode
			});

			try {
				const activeServices = requireServices();
				// Without an explicit source selector the resolver needs at least one
				// active read target; say "not connected" rather than surfacing an
				// internal resolver error to the model.
				if (
					!getInput.calendarSourceId &&
					!(await activeServices.targets.hasActiveTarget(userId, 'read'))
				) {
					return empty('not_connected');
				}
				const result = await activeServices.write.getEvent({
					userId,
					providerEventId: getInput.providerEventId,
					selector: {
						...(getInput.calendarSourceId
							? { calendarSourceId: getInput.calendarSourceId }
							: {}),
						...(getInput.calendarId ? { calendarId: getInput.calendarId } : {})
					}
				});
				return {
					event: toPortEvent({
						...(result.event as unknown as Record<string, any>),
						calendarSourceId: result.calendarSourceId,
						connectionId: result.connectionId,
						providerCalendarId: result.providerCalendarId,
						providerEventId: result.providerEventId
					}),
					calendarSourceId: result.calendarSourceId,
					connectionId: result.connectionId,
					providerCalendarId: result.providerCalendarId,
					reasonCode: null
				};
			} catch (error) {
				const reasonCode = connectionLevelReasonCode(error);
				if (reasonCode) return empty(reasonCode);
				throw error;
			}
		},

		async getProjectCalendar(
			projectInput: AgenticChatProjectCalendarInputV1
		): Promise<AgenticChatProjectCalendarV1 | null> {
			assertBoundUser(projectInput.userId);
			// A DB-only read: it needs no OAuth credentials, so it never reports
			// `not_configured`.
			const outcome = await new ProjectCalendarReadService(
				client as unknown as TypedSupabaseClient
			).readProjectCalendar(projectInput.projectId, userId);
			if (outcome.status === 'error') {
				throw new Error(outcome.message);
			}
			if (!outcome.calendar) return null;
			const calendar = outcome.calendar;
			return {
				id: calendar.id ?? null,
				projectId: projectInput.projectId,
				calendarId: calendar.calendar_id ?? null,
				calendarSourceId: calendar.calendar_source_id ?? null,
				calendarName: calendar.calendar_name ?? null,
				syncEnabled: calendar.sync_enabled !== false,
				syncMode: calendar.sync_mode,
				raw: calendar
			};
		}
	};
}
