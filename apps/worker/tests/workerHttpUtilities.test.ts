// apps/worker/tests/workerHttpUtilities.test.ts
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { isWorkerAuthorized } from '../src/http/auth';
import { getErrorMessage } from '../src/http/errors';
import { getSafeTimezone, isValidTimezone } from '../src/http/timezone';
import { jsonParseErrorHandler } from '../src/middleware/jsonError';

const originalWorkerToken = process.env.PRIVATE_RAILWAY_WORKER_TOKEN;

afterEach(() => {
	if (originalWorkerToken === undefined) {
		delete process.env.PRIVATE_RAILWAY_WORKER_TOKEN;
	} else {
		process.env.PRIVATE_RAILWAY_WORKER_TOKEN = originalWorkerToken;
	}
});

describe('worker HTTP auth utilities', () => {
	it('authorizes only the configured bearer token', () => {
		process.env.PRIVATE_RAILWAY_WORKER_TOKEN = 'worker-secret';

		expect(isWorkerAuthorized('Bearer worker-secret')).toBe(true);
		expect(isWorkerAuthorized('Bearer wrong-secret')).toBe(false);
		expect(isWorkerAuthorized('Basic worker-secret')).toBe(false);
		expect(isWorkerAuthorized(undefined)).toBe(false);
	});

	it('fails closed when the worker token is not configured', () => {
		delete process.env.PRIVATE_RAILWAY_WORKER_TOKEN;

		expect(isWorkerAuthorized('Bearer worker-secret')).toBe(false);
	});
});

describe('worker HTTP error utilities', () => {
	it('formats Error and non-Error values consistently', () => {
		expect(getErrorMessage(new Error('failed'))).toBe('failed');
		expect(getErrorMessage('failed')).toBe('failed');
		expect(getErrorMessage(42)).toBe('42');
	});
});

describe('worker timezone utilities', () => {
	it('accepts real IANA timezones and rejects malformed names', () => {
		expect(isValidTimezone('America/New_York')).toBe(true);
		expect(isValidTimezone('Not/A_Timezone')).toBe(false);
	});

	it('falls back to UTC for missing or invalid timezone values', () => {
		expect(getSafeTimezone(undefined, 'user-1')).toBe('UTC');
		expect(getSafeTimezone('America/New_York', 'user-1')).toBe('America/New_York');
		expect(getSafeTimezone('Not/A_Timezone', 'user-1')).toBe('UTC');
		expect(console.warn).toHaveBeenCalledWith(
			expect.stringContaining('Invalid timezone "Not/A_Timezone"')
		);
	});
});

describe('worker JSON error middleware', () => {
	function createResponse() {
		return {
			status: vi.fn().mockReturnThis(),
			json: vi.fn()
		} as unknown as Response & {
			status: ReturnType<typeof vi.fn>;
			json: ReturnType<typeof vi.fn>;
		};
	}

	it('returns a JSON 400 response for malformed JSON bodies', () => {
		const error = Object.assign(new SyntaxError('Unexpected token } in JSON'), {
			status: 400,
			type: 'entity.parse.failed'
		});
		const response = createResponse();
		const next = vi.fn() as NextFunction;

		jsonParseErrorHandler(error, {} as Request, response, next);

		expect(response.status).toHaveBeenCalledWith(400);
		expect(response.json).toHaveBeenCalledWith({ error: 'Invalid JSON body' });
		expect(next).not.toHaveBeenCalled();
	});

	it('passes non-JSON parse errors to the next error handler', () => {
		const error = new Error('boom');
		const response = createResponse();
		const next = vi.fn() as NextFunction;

		jsonParseErrorHandler(error, {} as Request, response, next);

		expect(response.status).not.toHaveBeenCalled();
		expect(response.json).not.toHaveBeenCalled();
		expect(next).toHaveBeenCalledWith(error);
	});
});

describe('worker HTTP size guardrail', () => {
	it('passes for the current HTTP module surface', () => {
		const workerRoot = resolve(__dirname, '..');
		const output = execFileSync(
			process.execPath,
			[resolve(workerRoot, 'scripts/check-worker-http-module-size.cjs')],
			{ cwd: workerRoot, encoding: 'utf8' }
		);

		expect(output).toContain('[worker-http-size-guard] OK');
	});
});
