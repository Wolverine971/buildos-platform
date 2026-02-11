// apps/web/src/lib/tests/llm/helpers/simple-runner.ts
import { BrainDumpProcessor } from '$lib/utils/braindump-processor';
import type { BrainDumpParseResult } from '$lib/types';
import type { ProjectWithRelations } from '$lib/types/project';
import type { SupabaseClient } from '@supabase/supabase-js';

// Minimal mock Supabase for testing
export function createMockSupabase(existingProject?: Partial<ProjectWithRelations>): any {
	return {
		from: () => ({
			select: () => ({
				eq: () => ({
					single: () =>
						Promise.resolve({
							data: existingProject || null,
							error: null
						}),
					in: () => ({
						order: () => ({
							limit: () =>
								Promise.resolve({ data: existingProject?.tasks || [], error: null })
						})
					})
				})
			})
		})
	};
}

// Process new project brain dump
export async function processNewProject(brainDump: string): Promise<BrainDumpParseResult> {
	const mockSupabase = createMockSupabase();
	const processor = new BrainDumpProcessor(mockSupabase as SupabaseClient);

	return processor.processBrainDump({
		brainDump,
		userId: 'test-user',
		brainDumpId: 'test-dump',
		options: {
			autoExecute: false,
			useDualProcessing: false
		}
	});
}

// Process brain dump for existing project
export async function processExistingProject(
	brainDump: string,
	projectId: string,
	existingProject: Partial<ProjectWithRelations>
): Promise<BrainDumpParseResult> {
	const mockSupabase = createMockSupabase(existingProject);
	const processor = new BrainDumpProcessor(mockSupabase as SupabaseClient);

	return processor.processBrainDump({
		brainDump,
		userId: 'test-user',
		selectedProjectId: projectId,
		brainDumpId: 'test-dump',
		options: {
			autoExecute: false,
			useDualProcessing: false
		}
	});
}
