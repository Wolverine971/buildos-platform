// apps/web/src/lib/server/runtime-versions.test.ts
import { describe, expect, it } from 'vitest';
import { describeServerRuntimeVersions } from './runtime-versions';

describe('describeServerRuntimeVersions', () => {
	it('reports exact runtime versions', () => {
		expect(
			describeServerRuntimeVersions({
				node: '22.23.4',
				brotli: '1.2.0',
				undici: '6.25.0',
				openssl: '3.5.4'
			})
		).toBe('[runtime] web node=v22.23.4 brotli=1.2.0 undici=6.25.0 openssl=3.5.4');
	});

	it('marks missing values instead of guessing', () => {
		expect(describeServerRuntimeVersions({})).toBe(
			'[runtime] web node=vunknown brotli=n/a undici=n/a openssl=n/a'
		);
	});
});
