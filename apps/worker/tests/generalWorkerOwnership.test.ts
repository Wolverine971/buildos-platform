// apps/worker/tests/generalWorkerOwnership.test.ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const indexSource = readSource('../src/index.ts');
const appSource = readSource('../src/app.ts');
const bootstrapSource = readSource('../src/bootstrap.ts');

describe('general worker process ownership', () => {
	it('keeps the entrypoint environment-only', () => {
		expect(lineCount(indexSource)).toBeLessThanOrEqual(20);
		expect(indexSource).toContain("import 'dotenv/config'");
		expect(indexSource).toContain("import('./bootstrap.js')");
		expect(indexSource).not.toMatch(/express|startWorker|startScheduler|\.listen\(/);
	});

	it('keeps process lifecycle out of the Express composition root', () => {
		expect(lineCount(appSource)).toBeLessThanOrEqual(300);
		expect(appSource).toContain('registerHealthRoute');
		expect(appSource).toContain('registerBriefQueueRoute');
		expect(appSource).toContain('registerQueueInspectionRoutes');
		expect(appSource).toContain("app.use('/sms/scheduled', smsScheduledRoutes)");
		expect(appSource).not.toMatch(/process\.on|startWorker|startScheduler|\.listen\(/);
	});

	// Start order (queue -> scheduler -> HTTP) is asserted behaviorally in
	// generalWorkerBootstrap.test.ts.
	it('keeps the process bootstrap small', () => {
		expect(lineCount(bootstrapSource)).toBeLessThanOrEqual(300);
	});
});

function readSource(relativePath: string): string {
	return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

function lineCount(source: string): number {
	return source.split(/\r?\n/).length;
}
