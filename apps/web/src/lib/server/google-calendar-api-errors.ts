// apps/web/src/lib/server/google-calendar-api-errors.ts
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
import { GoogleCalendarConnectionError } from './google-calendar-connection.service';
import { GoogleCalendarTargetError } from './google-calendar-target.service';
import { GoogleCalendarWriteError } from './google-calendar-write.service';

export function googleCalendarRuntimeErrorResponse(error: unknown): Response | null {
	if (error instanceof GoogleCalendarWriteError) {
		switch (error.code) {
			case 'CALENDAR_PROVIDER_EVENT_ID_MISSING':
				return ApiResponse.error(error.message, 502, error.code);
			case 'CALENDAR_MAPPING_PERSIST_FAILED':
			case 'CALENDAR_ORPHAN_RECORDED':
				return ApiResponse.error(
					error.message,
					HttpStatus.INTERNAL_SERVER_ERROR,
					error.code
				);
		}
	}

	if (!(error instanceof GoogleCalendarTargetError)) return null;

	switch (error.code) {
		case 'CALENDAR_SOURCE_NOT_FOUND':
		case 'CALENDAR_MAPPING_NOT_FOUND':
			return ApiResponse.error(error.message, HttpStatus.NOT_FOUND, error.code);
		case 'CALENDAR_SOURCE_AMBIGUOUS':
			return ApiResponse.error(error.message, HttpStatus.CONFLICT, error.code);
		case 'CALENDAR_SOURCE_REQUIRED':
		case 'CALENDAR_PROJECT_SOURCE_REQUIRED':
		case 'CALENDAR_EVENT_SOURCE_REQUIRED':
		case 'CALENDAR_SOURCE_NOT_CAPABLE':
			return ApiResponse.error(error.message, HttpStatus.UNPROCESSABLE_ENTITY, error.code);
	}
}

export function googleCalendarConnectionErrorResponse(error: unknown): Response {
	const runtimeResponse = googleCalendarRuntimeErrorResponse(error);
	if (runtimeResponse) return runtimeResponse;

	if (error instanceof GoogleCalendarConnectionError) {
		switch (error.code) {
			case 'not_configured':
				return ApiResponse.error(
					'Multi-account Google Calendar is not available yet',
					HttpStatus.SERVICE_UNAVAILABLE,
					'GOOGLE_CALENDAR_NOT_CONFIGURED'
				);
			case 'connection_not_found':
				return ApiResponse.error(
					error.message,
					HttpStatus.NOT_FOUND,
					'GOOGLE_CALENDAR_CONNECTION_NOT_FOUND'
				);
			case 'source_not_found':
				return ApiResponse.error(
					error.message,
					HttpStatus.NOT_FOUND,
					'GOOGLE_CALENDAR_SOURCE_NOT_FOUND'
				);
			case 'source_conflict':
				return ApiResponse.error(
					error.message,
					HttpStatus.CONFLICT,
					'GOOGLE_CALENDAR_SOURCE_CONFLICT'
				);
			case 'source_not_writable':
				return ApiResponse.error(
					error.message,
					HttpStatus.UNPROCESSABLE_ENTITY,
					'GOOGLE_CALENDAR_SOURCE_NOT_WRITABLE'
				);
			case 'connection_limit_exceeded':
			case 'account_already_connected':
				return ApiResponse.error(
					error.message,
					HttpStatus.CONFLICT,
					'GOOGLE_CALENDAR_CONNECTION_CONFLICT'
				);
			case 'account_mismatch':
			case 'scope_mismatch':
			case 'refresh_token_required':
				return ApiResponse.error(
					error.message,
					HttpStatus.UNPROCESSABLE_ENTITY,
					'GOOGLE_CALENDAR_CONNECTION_INVALID'
				);
			case 'reconnect_required':
				return ApiResponse.error(
					error.message,
					HttpStatus.CONFLICT,
					'GOOGLE_CALENDAR_RECONNECT_REQUIRED'
				);
		}
	}

	return ApiResponse.error(
		'Unable to manage Google Calendar connections',
		HttpStatus.INTERNAL_SERVER_ERROR,
		'GOOGLE_CALENDAR_CONNECTION_FAILED'
	);
}
