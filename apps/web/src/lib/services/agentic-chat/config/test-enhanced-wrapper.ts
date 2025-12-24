// apps/web/src/lib/services/agentic-chat/config/test-enhanced-wrapper.ts
/**
 * Test file to verify Enhanced LLM Wrapper integration
 *
 * Run with: pnpm exec tsx apps/web/src/lib/services/agentic-chat/config/test-enhanced-wrapper.ts
 */

import { createEnhancedLLMWrapper } from './enhanced-llm-wrapper';
import { SmartLLMService } from '../../smart-llm-service';
import type { ChatContextType } from '@buildos/shared-types';

// Mock SmartLLMService for testing
class MockSmartLLMService extends SmartLLMService {
	constructor() {
		// @ts-ignore - Mock constructor
		super({ supabase: null });
	}

	async *streamText(options: any) {
		console.log('[MockLLM] streamText called with:', {
			profile: options.profile,
			temperature: options.temperature,
			maxTokens: options.maxTokens,
			hasTools: !!options.tools?.length
		});

		yield { type: 'text', content: `Using profile: ${options.profile}` };
		yield { type: 'done', usage: { total_tokens: 100 } };
	}

	async generateText(options: any): Promise<string> {
		console.log('[MockLLM] generateText called with:', {
			profile: options.profile,
			temperature: options.temperature,
			maxTokens: options.maxTokens
		});

		return `Generated with profile: ${options.profile || 'default'}`;
	}
}

async function testEnhancedWrapper() {
	console.log('=== Testing Enhanced LLM Wrapper ===\n');

	const mockLLM = new MockSmartLLMService();
	const enhancedLLM = createEnhancedLLMWrapper(mockLLM);

	// Test 1: Stream with project audit context (should use 'quality' profile)
	console.log('Test 1: Project Audit Context');
	console.log('Expected: quality profile for complex planning');

	for await (const chunk of enhancedLLM.streamText({
		messages: [{ role: 'user', content: 'Audit my project' }],
		userId: 'test-user',
		contextType: 'project_audit' as ChatContextType,
		operationType: 'planner_stream'
	})) {
		if (chunk.type === 'text') {
			console.log('Result:', chunk.content);
		}
	}
	console.log('');

	// Test 2: Stream with calendar context (should use 'balanced' profile)
	console.log('Test 2: Calendar Context');
	console.log('Expected: balanced profile for simple operations');

	for await (const chunk of enhancedLLM.streamText({
		messages: [{ role: 'user', content: 'Schedule a focus block' }],
		userId: 'test-user',
		contextType: 'calendar' as ChatContextType,
		operationType: 'planner_stream'
	})) {
		if (chunk.type === 'text') {
			console.log('Result:', chunk.content);
		}
	}
	console.log('');

	// Test 3: Stream with tools (should maintain tool-calling priority)
	console.log('Test 3: Tool-heavy Context');
	console.log('Expected: balanced profile (Claude Haiku) for tool reliability');

	for await (const chunk of enhancedLLM.streamText({
		messages: [{ role: 'user', content: 'Execute tools' }],
		userId: 'test-user',
		tools: [{ type: 'function', function: { name: 'test_tool' } }],
		contextType: 'ontology' as ChatContextType,
		operationType: 'tool_heavy'
	})) {
		if (chunk.type === 'text') {
			console.log('Result:', chunk.content);
		}
	}
	console.log('');

	// Test 4: Generate text with automatic profile selection
	console.log('Test 4: Text Generation');
	console.log('Expected: auto-selected profile based on context');

	const result = await enhancedLLM.generateText({
		systemPrompt: 'You are a helpful assistant',
		prompt: 'Generate a plan',
		contextType: 'project_forecast' as ChatContextType,
		operationType: 'plan_generation'
	});

	console.log('Result:', result);
	console.log('');

	// Test 5: Override with explicit profile
	console.log('Test 5: Explicit Profile Override');
	console.log('Expected: speed profile (forced)');

	for await (const chunk of enhancedLLM.streamText({
		messages: [{ role: 'user', content: 'Quick response' }],
		userId: 'test-user',
		profile: 'speed', // Explicit override
		contextType: 'project_audit' as ChatContextType // Would normally use 'quality'
	})) {
		if (chunk.type === 'text') {
			console.log('Result:', chunk.content);
		}
	}

	console.log('\n=== All Tests Complete ===');
}

// Run tests if this file is executed directly
if (require.main === module) {
	testEnhancedWrapper().catch(console.error);
}

export { testEnhancedWrapper };
