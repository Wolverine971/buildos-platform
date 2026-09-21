// scripts/dev.mjs
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const children = [];
const closedChildren = new WeakSet();
const ansiEscape = /\x1b\[[0-?]*[ -/]*[@-~]/g;
let lastOutputAt = Date.now();
let stopping = false;
let shutdownPromise;

function deferredOutputMatch(pattern, timeoutMs, description) {
	let buffer = '';
	let timeout;
	let settled = false;
	let resolvePromise;
	let rejectPromise;

	const promise = new Promise((resolve, reject) => {
		resolvePromise = resolve;
		rejectPromise = reject;
		timeout = setTimeout(() => {
			if (settled) return;
			settled = true;
			reject(new Error(`Timed out waiting for ${description}`));
		}, timeoutMs);
	});

	return {
		promise,
		observe(chunk) {
			if (settled) return;
			buffer = `${buffer}${chunk.toString().replace(ansiEscape, '')}`.slice(-8_192);
			const match = buffer.match(pattern);
			if (!match) return;
			settled = true;
			clearTimeout(timeout);
			resolvePromise(match);
		},
		reject(error) {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			rejectPromise(error);
		}
	};
}

function start(label, args, observe = () => {}) {
	console.info(`[dev] Starting ${label}...`);
	const child = spawn('pnpm', args, {
		cwd: root,
		env: process.env,
		detached: process.platform !== 'win32',
		stdio: ['ignore', 'pipe', 'pipe']
	});
	children.push(child);
	child.once('close', () => closedChildren.add(child));

	for (const [stream, destination] of [
		[child.stdout, process.stdout],
		[child.stderr, process.stderr]
	]) {
		stream.on('data', (chunk) => {
			lastOutputAt = Date.now();
			destination.write(chunk);
			observe(chunk);
		});
	}

	child.once('error', (error) => {
		console.error(`[dev] Could not start ${label}:`, error);
		void shutdown(1, 'SIGTERM');
	});
	child.once('exit', (code, signal) => {
		if (stopping) return;
		console.error(
			`[dev] ${label} exited unexpectedly (${signal ? `signal ${signal}` : `code ${code ?? 1}`})`
		);
		void shutdown(code || 1, 'SIGTERM');
	});

	return child;
}

function isRunning(child) {
	return Boolean(
		!closedChildren.has(child) &&
			child.exitCode === null &&
			child.signalCode === null &&
			child.pid
	);
}

function signalChild(child, signal) {
	if (!child.pid || (process.platform === 'win32' && !isRunning(child))) return;
	try {
		if (process.platform === 'win32') child.kill(signal);
		else process.kill(-child.pid, signal);
	} catch {
		// The process may have exited between the running check and the signal.
	}
}

function waitForExit(child) {
	if (!isRunning(child)) return Promise.resolve();
	return new Promise((resolve) => child.once('close', resolve));
}

function shutdown(exitCode, signal) {
	if (shutdownPromise) return shutdownPromise;
	stopping = true;
	shutdownPromise = (async () => {
		for (const child of [...children].reverse()) signalChild(child, signal);

		const gracefulExit = Promise.all(children.map(waitForExit));
		const timedOut = await Promise.race([
			gracefulExit.then(() => false),
			new Promise((resolve) => setTimeout(() => resolve(true), 30_000))
		]);
		if (timedOut) {
			for (const child of [...children].reverse()) signalChild(child, 'SIGKILL');
			await Promise.all(children.map(waitForExit));
		}

		process.exit(exitCode);
	})();
	return shutdownPromise;
}

async function waitForOutputToSettle(quietMs, maxWaitMs) {
	const deadline = Date.now() + maxWaitMs;
	while (Date.now() < deadline) {
		const remainingQuietTime = quietMs - (Date.now() - lastOutputAt);
		if (remainingQuietTime <= 0) return;
		await new Promise((resolve) => setTimeout(resolve, Math.min(remainingQuietTime, 250)));
	}
}

for (const signal of ['SIGINT', 'SIGTERM']) {
	process.on(signal, () => {
		if (stopping) {
			for (const child of children) signalChild(child, 'SIGKILL');
			process.exit(signal === 'SIGINT' ? 130 : 143);
		}
		void shutdown(signal === 'SIGINT' ? 130 : 143, signal);
	});
}

async function main() {
	const workerReady = deferredOutputMatch(
		/API server running on port \d+/,
		120_000,
		'the worker to start listening'
	);
	const worker = start('worker', ['--filter', '@buildos/worker', 'dev'], workerReady.observe);
	worker.once('exit', (code, signal) => {
		workerReady.reject(
			new Error(
				`Worker exited before it was ready (${signal ? `signal ${signal}` : `code ${code ?? 1}`})`
			)
		);
	});

	// Keep the package watchers from the old `turbo dev` command running, but
	// exclude both apps so their launch order is controlled here.
	start('workspace package watchers', ['exec', 'turbo', 'dev', '--filter=./packages/*']);

	await workerReady.promise;
	console.info('[dev] Worker is ready.');

	const webReady = deferredOutputMatch(
		/Local:\s+(https?:\/\/\S+)/,
		120_000,
		'the web app to report its local URL'
	);
	const web = start('web', ['--filter', '@buildos/web', 'dev'], webReady.observe);
	web.once('exit', (code, signal) => {
		webReady.reject(
			new Error(
				`Web app exited before it was ready (${signal ? `signal ${signal}` : `code ${code ?? 1}`})`
			)
		);
	});

	const [, webUrl] = await webReady.promise;
	await waitForOutputToSettle(750, 5_000);
	console.info(`\n[dev] Web ready: ${webUrl}`);
}

main().catch((error) => {
	console.error('[dev] Startup failed:', error);
	void shutdown(1, 'SIGTERM');
});
