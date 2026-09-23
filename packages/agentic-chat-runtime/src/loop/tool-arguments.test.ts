// packages/agentic-chat-runtime/src/loop/tool-arguments.test.ts
import { describe, expect, it } from 'vitest';
import { parseToolArguments } from './tool-arguments';

describe('parseToolArguments', () => {
	it('treats missing or blank arguments as an empty object', () => {
		expect(parseToolArguments(undefined)).toEqual({ args: {} });
		expect(parseToolArguments(null)).toEqual({ args: {} });
		expect(parseToolArguments('   ')).toEqual({ args: {} });
	});

	it('parses JSON objects and passes already-parsed objects through', () => {
		expect(parseToolArguments('{"project_id":"p1"}')).toEqual({ args: { project_id: 'p1' } });
		const args = { project_id: 'p1' };
		expect(parseToolArguments(args).args).toBe(args);
	});

	it('unwraps double-encoded JSON strings', () => {
		expect(parseToolArguments(JSON.stringify('{"title":"Launch"}'))).toEqual({
			args: { title: 'Launch' }
		});
	});

	it('recovers objects from markdown fences and concatenated segments', () => {
		expect(parseToolArguments('```json\n{"title":"Launch"}\n```')).toEqual({
			args: { title: 'Launch' }
		});
		expect(parseToolArguments('{"project_id":"p1"}{"title":"Launch"}')).toEqual({
			args: { project_id: 'p1', title: 'Launch' }
		});
	});

	it('rejects arrays, scalars, and unrecoverable text with an error', () => {
		expect(parseToolArguments([1, 2])).toEqual({
			args: {},
			error: 'Tool arguments must be a JSON object.'
		});
		expect(parseToolArguments(42)).toEqual({
			args: {},
			error: 'Tool arguments must be a JSON object.'
		});
		const malformed = parseToolArguments('{"project_id": "p1"');
		expect(malformed.args).toEqual({});
		expect(malformed.error).toMatch(/^Invalid JSON in tool arguments:/);
	});
});
