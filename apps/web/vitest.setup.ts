// apps/web/vitest.setup.ts
import { vi } from 'vitest';
import '@testing-library/jest-dom';

// $env/dynamic/public reads SvelteKit's injected runtime env, which doesn't
// exist in the vitest environment — resolve it to process.env instead.
vi.mock('$env/dynamic/public', () => ({ env: process.env }));

// jsdom doesn't implement matchMedia; Svelte's MediaQuery (prefersReducedMotion)
// calls it at module load.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
	window.matchMedia = vi.fn().mockImplementation((query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: vi.fn(),
		removeListener: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn()
	}));
}

// Store original console methods
const originalConsole = {
	log: console.log,
	error: console.error,
	warn: console.warn,
	info: console.info,
	debug: console.debug
};

// Mock console methods to reduce noise in tests
// These are expected errors/warnings from error handling tests
if (process.env.VITEST_SILENT !== 'false') {
	// Create spy functions that suppress output but can be checked in tests
	global.console = {
		...console,
		// Suppress error and warn output from expected test scenarios
		error: vi.fn(),
		warn: vi.fn(),
		// For log, only suppress if it starts with known test patterns
		log: vi.fn((message, ...args) => {
			// Suppress known test output patterns
			const suppressPatterns = [
				'🔴 Error Logger Fallback',
				'Error logged with ID:',
				'Operation failed:',
				'Recurring task missing'
			];

			const messageStr = String(message);
			const shouldSuppress = suppressPatterns.some((pattern) => messageStr.includes(pattern));

			if (!shouldSuppress && process.env.VITEST_DEBUG === 'true') {
				originalConsole.log(message, ...args);
			}
		}),
		// Keep info and debug for debugging when needed
		info: process.env.VITEST_DEBUG === 'true' ? originalConsole.info : vi.fn(),
		debug: process.env.VITEST_DEBUG === 'true' ? originalConsole.debug : vi.fn()
	};
}
