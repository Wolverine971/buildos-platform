// apps/web/src/lib/services/agentic-chat/tools/registry/tool-help.test.ts
import { describe, expect, it } from 'vitest';
import { getToolHelp } from './tool-help';

describe('getToolHelp', () => {
	it('returns root command contract and workflow examples', () => {
		const help = getToolHelp('root', { format: 'short', include_examples: true });

		expect(help.type).toBe('directory');
		expect(help.path).toBe('root');
		expect(help.command_contract?.tool_exec?.required).toEqual(['op', 'args']);
		expect(Array.isArray(help.workflow)).toBe(true);
		expect(Array.isArray(help.examples)).toBe(true);
		expect(help.examples.length).toBeGreaterThan(0);
	});

	it('returns op help with required args and concrete example template', () => {
		const help = getToolHelp('onto.task.update', {
			format: 'full',
			include_examples: true,
			include_schemas: true
		});

		expect(help.type).toBe('op');
		expect(help.op).toBe('onto.task.update');
		expect(Array.isArray(help.required_args)).toBe(true);
		expect(help.required_args).toContain('task_id');
		expect(Array.isArray(help.notes)).toBe(true);
		expect(help.notes.join(' ')).toContain('task_id');
		expect(help.example_tool_exec?.op).toBe('onto.task.update');
		expect(help.example_tool_exec?.args?.task_id).toBe('<task_id_uuid>');
		expect(Object.keys(help.example_tool_exec?.args ?? {}).length).toBeGreaterThan(1);
		expect(Array.isArray(help.examples)).toBe(true);
		expect(help.examples.length).toBeGreaterThan(0);
	});

	it('includes query guidance for search ops', () => {
		const help = getToolHelp('onto.task.search', {
			format: 'short',
			include_examples: true
		});

		expect(help.type).toBe('op');
		expect(help.example_tool_exec?.args?.query).toBe('<search query>');
		expect(Array.isArray(help.notes)).toBe(true);
		expect(help.notes.join(' ')).toContain('args.query');
	});
});
