// apps/web/src/lib/server/time-block-runtime.service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { CalendarService } from '$lib/services/calendar-service';
import { TimeBlockService } from '$lib/services/time-block.service';
import { GoogleCalendarWriteService } from './google-calendar-write.service';

export async function createTimeBlockRuntimeService(
	supabase: SupabaseClient<Database>,
	userId: string
): Promise<TimeBlockService> {
	const sourceAwareCalendar = new GoogleCalendarWriteService(createAdminSupabaseClient());
	const hasSourceAwareWriteTarget = await sourceAwareCalendar
		.hasActiveTarget(userId, 'write')
		.catch(() => false);
	return new TimeBlockService(supabase, userId, new CalendarService(supabase), {
		sourceAwareCalendar: hasSourceAwareWriteTarget ? sourceAwareCalendar : undefined
	});
}
