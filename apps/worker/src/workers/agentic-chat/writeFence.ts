export type AgenticChatGenerationWriteFenceV1 = {
	turnRunId: string;
	queueJobId: string;
	processingToken: string;
	executionGeneration: number;
};

/**
 * One canonical RPC argument envelope for every current-generation durable
 * chat write. Keeping the four ownership fields together makes omission a
 * compile-time-visible exception instead of a per-adapter convention.
 */
export function agenticChatGenerationWriteFenceArgsV1(input: AgenticChatGenerationWriteFenceV1): {
	p_turn_run_id: string;
	p_queue_job_id: string;
	p_processing_token: string;
	p_execution_generation: number;
} {
	return {
		p_turn_run_id: input.turnRunId,
		p_queue_job_id: input.queueJobId,
		p_processing_token: input.processingToken,
		p_execution_generation: input.executionGeneration
	};
}
