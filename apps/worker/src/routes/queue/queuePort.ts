import type { SupabaseQueue } from '../../lib/supabaseQueue';

/** Queue operations used by the general worker's HTTP-only composition. */
export type GeneralWorkerHttpQueue = Pick<
	SupabaseQueue,
	'add' | 'cancelBriefJobsForDate' | 'getJob' | 'getStats' | 'getUserJobs'
>;
