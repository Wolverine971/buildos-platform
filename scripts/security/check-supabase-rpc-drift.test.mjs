// scripts/security/check-supabase-rpc-drift.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('reads RPC names from public when another schema appears first', () => {
	const fixtureRoot = mkdtempSync(join(tmpdir(), 'buildos-rpc-drift-'));
	try {
		const typesPath = join(fixtureRoot, 'database.types.ts');
		const openApiPath = join(fixtureRoot, 'openapi.json');
		writeFileSync(
			typesPath,
			[
				'export type Database = {',
				'  libri: {',
				'    Functions: {',
				'      [_ in never]: never',
				'    }',
				'    Enums: {',
				'      [_ in never]: never',
				'    }',
				'  }',
				'  public: {',
				'    Functions: {',
				'      expected_rpc: { Args: never; Returns: never }',
				'    }',
				'    Enums: {',
				'      [_ in never]: never',
				'    }',
				'  }',
				'}',
				''
			].join('\n')
		);
		writeFileSync(openApiPath, JSON.stringify({ paths: { '/rpc/expected_rpc': {} } }));

		const result = spawnSync(
			process.execPath,
			[
				resolve('scripts/security/check-supabase-rpc-drift.mjs'),
				'--types',
				typesPath,
				'--openapi',
				openApiPath
			],
			{ encoding: 'utf8' }
		);

		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /RPC schema is aligned \(1 function name\(s\)\)\./);
	} finally {
		rmSync(fixtureRoot, { recursive: true, force: true });
	}
});
