// src/lib/tests/llm-simple/helpers/simple-llm-runner.ts

import { BrainDumpProcessor } from '$lib/utils/braindump-processor';
import type { BrainDumpParseResult } from '$lib/types/brain-dump';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import { createClient } from '@supabase/supabase-js';

// Simple test configuration
const TEST_CONFIG = {
	userId: 'test-user-123',
	brainDumpId: 'test-brain-dump-123',
	defaultOptions: {
		autoExecute: false,
		streamResults: false,
		useDualProcessing: false,
		retryAttempts: 1
	}
};

/**
 * Simplified LLM Test Runner - no complex mocking, minimal abstractions
 */
export class SimpleLLMRunner {
	private processor: BrainDumpProcessor;

	constructor(supabase: SupabaseClient<Database>) {
		this.processor = new BrainDumpProcessor(supabase);
	}

	/**
	 * Process brain dump for new project creation
	 */
	async processNewProject(brainDump: string): Promise<BrainDumpParseResult> {
		return this.processor.processBrainDump({
			brainDump: brainDump.trim(),
			userId: TEST_CONFIG.userId,
			brainDumpId: TEST_CONFIG.brainDumpId,
			options: TEST_CONFIG.defaultOptions
		});
	}

	/**
	 * Process brain dump for existing project updates
	 */
	async processExistingProject(
		brainDump: string,
		projectId: string
	): Promise<BrainDumpParseResult> {
		return this.processor.processBrainDump({
			brainDump: brainDump.trim(),
			userId: TEST_CONFIG.userId,
			selectedProjectId: projectId,
			brainDumpId: TEST_CONFIG.brainDumpId,
			options: TEST_CONFIG.defaultOptions
		});
	}
}

/**
 * Create test supabase client
 */
function createTestSupabaseClient(): SupabaseClient<Database> {
	const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
	const supabaseKey = process.env.PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

	return createClient<Database>(supabaseUrl, supabaseKey);
}

/**
 * Helper functions for easy test setup
 */
export function createLLMRunner(supabase?: SupabaseClient<Database>): SimpleLLMRunner {
	const client = supabase || createTestSupabaseClient();
	return new SimpleLLMRunner(client);
}

/**
 * Quick helper for new project tests
 */
export async function processNewProject(brainDump: string): Promise<BrainDumpParseResult> {
	const runner = createLLMRunner();
	return runner.processNewProject(brainDump);
}

/**
 * Quick helper for existing project tests
 */
export async function processExistingProject(
	brainDump: string,
	projectId: string
): Promise<BrainDumpParseResult> {
	const runner = createLLMRunner();
	return runner.processExistingProject(brainDump, projectId);
}
