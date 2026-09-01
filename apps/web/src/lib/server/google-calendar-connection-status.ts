// apps/web/src/lib/server/google-calendar-connection-status.ts
import type { CalendarService } from '$lib/services/calendar-service';
import type {
	CalendarTargetCapability,
	GoogleCalendarTargetService
} from './google-calendar-target.service';

type LegacyConnectionPort = Pick<CalendarService, 'hasStoredConnection'>;
type SourceAwareConnectionPort = Pick<GoogleCalendarTargetService, 'hasActiveTarget'>;

export type GoogleCalendarBackend = 'source-aware' | 'legacy' | null;

export type GoogleCalendarBackendResolution = {
	backend: GoogleCalendarBackend;
	connected: boolean;
	legacyConnected: boolean;
	sourceAwareConnected: boolean;
};

/**
 * Compatibility status for surfaces that still serve both Calendar storage models.
 * One broken provider must not hide a healthy connection from the other model.
 */
export async function resolveGoogleCalendarBackend(params: {
	userId: string;
	capability: CalendarTargetCapability;
	legacy: LegacyConnectionPort;
	sourceAware: SourceAwareConnectionPort;
}): Promise<GoogleCalendarBackendResolution> {
	const [legacyResult, sourceAwareResult] = await Promise.allSettled([
		params.legacy.hasStoredConnection(params.userId),
		params.sourceAware.hasActiveTarget(params.userId, params.capability)
	]);
	const legacyConnected = legacyResult.status === 'fulfilled' && legacyResult.value;
	const sourceAwareConnected =
		sourceAwareResult.status === 'fulfilled' && sourceAwareResult.value;
	return {
		backend: sourceAwareConnected ? 'source-aware' : legacyConnected ? 'legacy' : null,
		connected: sourceAwareConnected || legacyConnected,
		legacyConnected,
		sourceAwareConnected
	};
}

export async function hasUsableGoogleCalendarConnection(params: {
	userId: string;
	capability: CalendarTargetCapability;
	legacy: LegacyConnectionPort;
	sourceAware: SourceAwareConnectionPort;
}): Promise<boolean> {
	return (await resolveGoogleCalendarBackend(params)).connected;
}
