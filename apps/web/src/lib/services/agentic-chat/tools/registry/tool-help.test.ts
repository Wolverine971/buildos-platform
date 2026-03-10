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
		expect(help.workflow.join(' ')).toContain('util.contact');
		expect(help.workflow.join(' ')).toContain('util.web');
		expect(help.workflow.join(' ')).toContain('tool_help({ path: help_path })');
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

	it('includes explicit range and paging guidance for calendar list ops', () => {
		const help = getToolHelp('cal.event.list', {
			format: 'short',
			include_examples: true
		});

		expect(help.type).toBe('op');
		expect(Array.isArray(help.notes)).toBe(true);
		expect(help.notes.join(' ')).toContain('timeMin/timeMax');
		expect(help.notes.join(' ')).toContain('limit');
		expect(Array.isArray(help.examples)).toBe(true);
		expect(help.examples[0]?.tool_exec?.args?.time_min).toBe('2026-03-01');
		expect(help.examples[1]?.tool_exec?.args?.offset).toBe(100);
	});

	it('includes required identifier guidance for calendar update ops', () => {
		const help = getToolHelp('cal.event.update', {
			format: 'short',
			include_examples: true
		});

		expect(help.type).toBe('op');
		expect(Array.isArray(help.notes)).toBe(true);
		expect(help.notes.join(' ')).toContain('onto_event_id or args.event_id');
		expect(help.example_tool_exec?.args?.onto_event_id).toBe('<onto_event_id_uuid>');
		expect(help.example_tool_exec?.args?.title).toBe('<title>');
	});

	it('returns calendar skill playbook for cal.skill', () => {
		const help = getToolHelp('cal.skill', {
			format: 'full',
			include_examples: true
		});

		expect(help.type).toBe('skill');
		expect(help.path).toBe('cal.skill');
		expect(Array.isArray(help.workflow)).toBe(true);
		expect(Array.isArray(help.ops?.read)).toBe(true);
		expect(Array.isArray(help.ops?.write)).toBe(true);
		expect(help.ops.read.map((item: any) => item.op)).toContain('cal.event.list');
		expect(help.ops.write.map((item: any) => item.op)).toContain('cal.event.create');
		expect(help.ops.write.map((item: any) => item.op)).toContain('cal.event.update');
		expect(help.ops.write.map((item: any) => item.op)).toContain('cal.event.delete');
	});

	it('lists calendar skill under cal namespace', () => {
		const help = getToolHelp('cal', {
			format: 'short',
			include_examples: true
		});

		expect(help.type).toBe('directory');
		expect(help.path).toBe('cal');
		expect(Array.isArray(help.items)).toBe(true);
		expect(help.items.map((item: any) => item.name)).toContain('cal.skill');
	});

	it('supports profile overview op discovery', () => {
		const help = getToolHelp('util.profile.overview', {
			format: 'short',
			include_examples: true
		});

		expect(help.type).toBe('op');
		expect(help.op).toBe('util.profile.overview');
		expect(Array.isArray(help.notes)).toBe(true);
		expect(help.notes.join(' ')).toContain('not preloaded');
		expect(help.example_tool_exec?.args).toEqual({});
	});

	it('lists util.profile namespace with profile overview op', () => {
		const help = getToolHelp('util.profile', {
			format: 'short',
			include_examples: true
		});

		expect(help.type).toBe('directory');
		expect(help.path).toBe('util.profile');
		expect(Array.isArray(help.items)).toBe(true);
		expect(help.items.map((item: any) => item.name)).toContain('util.profile.overview');
	});

	it('supports contact search op discovery with redaction notes', () => {
		const help = getToolHelp('util.contact.search', {
			format: 'short',
			include_examples: true
		});

		expect(help.type).toBe('op');
		expect(help.op).toBe('util.contact.search');
		expect(Array.isArray(help.notes)).toBe(true);
		expect(help.notes.join(' ')).toContain('redacted');
	});

	it('lists util.contact namespace with contact ops', () => {
		const help = getToolHelp('util.contact', {
			format: 'short',
			include_examples: true
		});

		expect(help.type).toBe('directory');
		expect(help.path).toBe('util.contact');
		expect(Array.isArray(help.items)).toBe(true);
		expect(help.items.map((item: any) => item.name)).toContain('util.contact.search');
		expect(help.items.map((item: any) => item.name)).toContain('util.contact.upsert');
	});
});
