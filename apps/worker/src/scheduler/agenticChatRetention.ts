import { supabase } from '../lib/supabase';

/**
 * Delete expired sensitive Agentic Chat transcript fields without coupling the
 * scheduler composition root to the cleanup RPC's generated type lifecycle.
 */
export async function runAgenticChatSensitiveTranscriptCleanup(): Promise<void> {
	try {
		const client = supabase as unknown as {
			rpc(
				name: 'cleanup_agentic_chat_sensitive_transcripts',
				args?: { p_retention_days?: number; p_batch_size?: number }
			): Promise<{ data: unknown; error: unknown }>;
		};
		const { data, error } = await client.rpc('cleanup_agentic_chat_sensitive_transcripts');
		if (error) {
			console.warn('⚠️ Scheduled Agentic Chat sensitive transcript cleanup failed:', error);
			return;
		}

		const summary: Record<string, unknown> =
			data && typeof data === 'object' && !Array.isArray(data)
				? (data as Record<string, unknown>)
				: {};
		const toolExecutionsDeleted = numericSummaryValue(summary, 'tool_executions_deleted');
		const turnEventsDeleted = numericSummaryValue(summary, 'turn_events_deleted');
		if (toolExecutionsDeleted > 0 || turnEventsDeleted > 0) {
			console.log(
				`✅ Scheduled Agentic Chat sensitive transcript cleanup complete: toolExecutions=${toolExecutionsDeleted}, turnEvents=${turnEventsDeleted}`
			);
		}
	} catch (error) {
		console.error('❌ Scheduled Agentic Chat sensitive transcript cleanup failed:', error);
	}
}

function numericSummaryValue(summary: Record<string, unknown>, key: string): number {
	const value = summary[key];
	return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
