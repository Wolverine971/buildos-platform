// apps/worker/tests/agenticChatPostgresFailure.test.ts
import { describe, expect, it } from 'vitest';
import { isTransientDatabaseFailureCode } from '../src/workers/agentic-chat/shared/postgres-failure';

describe('isTransientDatabaseFailureCode', () => {
	it.each([
		['', 'no database answer (network or fetch failure)'],
		['08006', 'connection failure'],
		['08001', 'unable to connect'],
		['40001', 'serialization failure'],
		['40P01', 'deadlock'],
		['55P03', 'lock not available'],
		['57014', 'statement timeout'],
		['57P01', 'admin shutdown'],
		['57P03', 'cannot connect now'],
		['53300', 'too many connections'],
		['53200', 'out of memory'],
		['PGRST000', 'PostgREST could not connect'],
		['PGRST003', 'PostgREST pool timeout'],
		['pgrst001', 'case-insensitive PostgREST code']
	])('retries %s (%s)', (code) => {
		expect(isTransientDatabaseFailureCode(code)).toBe(true);
	});

	it.each([
		['P0001', 'RAISE EXCEPTION guard'],
		['42501', 'insufficient privilege'],
		['42804', 'datatype mismatch (backend contract defect)'],
		['23505', 'unique violation'],
		['22P02', 'invalid text representation'],
		['PGRST116', 'single() found no rows'],
		['PGRST202', 'function missing from schema cache'],
		['PGRST204', 'column missing from schema cache']
	])('fails fast on %s (%s)', (code) => {
		expect(isTransientDatabaseFailureCode(code)).toBe(false);
	});

	it('treats null and undefined as no database answer', () => {
		expect(isTransientDatabaseFailureCode(null)).toBe(true);
		expect(isTransientDatabaseFailureCode(undefined)).toBe(true);
	});
});
