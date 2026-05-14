// apps/worker/src/workers/briefAudio/audioSynthesisProcess.ts
import { fork } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import type { BriefAudioSynthesisResult } from '../../lib/tts/kokoro';

type ChildResponse =
	| {
			ok: true;
			result: {
				mp3Base64: string;
				durationMs: number | null;
				generationMs: number;
				sampleRate: number | null;
				model: string;
				voice: string;
			};
	  }
	| {
			ok: false;
			error: string;
			stack?: string;
	  };

function resolveChildPath(): string {
	const candidates = [
		path.join(__dirname, 'audioSynthesisChild.js'),
		path.resolve(process.cwd(), 'apps/worker/dist/workers/briefAudio/audioSynthesisChild.js'),
		path.resolve(process.cwd(), 'dist/workers/briefAudio/audioSynthesisChild.js'),
		path.join(__dirname, 'audioSynthesisChild.ts')
	];

	const childPath = candidates.find((candidate) => existsSync(candidate));
	if (!childPath) {
		throw new Error('Audio synthesis child entrypoint was not found');
	}

	return childPath;
}

function getExecArgv(childPath: string): string[] {
	if (childPath.endsWith('.ts')) {
		return process.execArgv;
	}

	return process.execArgv.filter(
		(arg) => !arg.startsWith('--inspect') && !arg.startsWith('--debug')
	);
}

function isChildResponse(message: unknown): message is ChildResponse {
	if (!message || typeof message !== 'object') return false;
	const maybe = message as { ok?: unknown };
	return typeof maybe.ok === 'boolean';
}

function buildChildFailureMessage(message: ChildResponse, stderr: string): string {
	if (message.ok) return 'Audio synthesis child failed';
	const details = stderr.trim();
	return details ? `${message.error}; stderr: ${details.slice(-2000)}` : message.error;
}

export function synthesizeBriefAudioInChild(
	text: string,
	timeoutMs: number
): Promise<BriefAudioSynthesisResult> {
	return new Promise((resolve, reject) => {
		const childPath = resolveChildPath();
		const child = fork(childPath, [], {
			env: process.env,
			execArgv: getExecArgv(childPath),
			stdio: ['ignore', 'ignore', 'pipe', 'ipc']
		});

		let stderr = '';
		let settled = false;
		let timeout: ReturnType<typeof setTimeout> | null = null;

		const settle = (callback: () => void): void => {
			if (settled) return;
			settled = true;
			if (timeout) {
				clearTimeout(timeout);
			}
			callback();
		};

		timeout = setTimeout(() => {
			settle(() => {
				child.kill('SIGKILL');
				const details = stderr.trim();
				reject(
					new Error(
						details
							? `Audio synthesis timed out after ${timeoutMs}ms; stderr: ${details.slice(-2000)}`
							: `Audio synthesis timed out after ${timeoutMs}ms`
					)
				);
			});
		}, timeoutMs);

		child.stderr?.on('data', (chunk: Buffer) => {
			stderr += chunk.toString('utf8');
			if (stderr.length > 8000) {
				stderr = stderr.slice(-8000);
			}
		});

		child.once('message', (message: unknown) => {
			settle(() => {
				if (!isChildResponse(message)) {
					reject(new Error('Audio synthesis child returned an invalid response'));
					return;
				}

				if (!message.ok) {
					reject(new Error(buildChildFailureMessage(message, stderr)));
					return;
				}

				resolve({
					mp3: Buffer.from(message.result.mp3Base64, 'base64'),
					durationMs: message.result.durationMs,
					generationMs: message.result.generationMs,
					sampleRate: message.result.sampleRate,
					model: message.result.model,
					voice: message.result.voice
				});
			});
		});

		child.once('error', (error) => {
			settle(() => {
				reject(error);
			});
		});

		child.once('exit', (code, signal) => {
			settle(() => {
				const details = stderr.trim();
				reject(
					new Error(
						`Audio synthesis child exited before returning audio (code ${code ?? 'null'}, signal ${
							signal ?? 'null'
						})${details ? `; stderr: ${details.slice(-2000)}` : ''}`
					)
				);
			});
		});

		child.send({ text }, (error) => {
			if (error) {
				settle(() => {
					reject(error);
				});
			}
		});
	});
}
