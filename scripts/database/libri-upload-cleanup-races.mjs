// Disposable SQL runner only. Reject hosted endpoints before even connecting.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
export const uploadCleanupContract = '20260908192820_libri_upload_cleanup_leases.test.sql';
const library = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const token = (n) => `cccccccc-cccc-4ccc-8ccc-ccccccccccc${n}`;
const target = (kind = 'staging') =>
	`(SELECT id FROM libri.image_upload_cleanup_targets WHERE kind='${kind}')`;
const fence = (n = 1, generation = 1) => `'${library}',${target()},'${token(n)}',${generation}`;
const claim = (n = 1, kind = 'staging') =>
	`SELECT libri.claim_image_upload_cleanup('${library}',${target(kind)},'${token(n)}');`;
const authorize = () => `SELECT libri.authorize_image_upload_cleanup(${fence()});`;
const finish = () => `SELECT libri.finish_image_upload_cleanup(${fence()},'absent');`;

function assertDisposableConnection(connectionArgs) {
	if (connectionArgs.length === 2 && connectionArgs[0] === '-d') {
		const url = new URL(connectionArgs[1]);
		assert.ok(
			['localhost', '127.0.0.1', '[::1]'].includes(url.hostname),
			'Cleanup tests require loopback CI PostgreSQL'
		);
		assert.match(
			url.pathname,
			/^\/buildos_sql_contract_\d+_\d+$/,
			'Cleanup tests require a runner-created disposable database'
		);
		assert.equal(url.search, '');
		assert.equal(url.hash, '');
		return;
	}
	assert.equal(connectionArgs.length, 6);
	const [hostOption, socket, userOption, user, databaseOption, database] = connectionArgs;
	assert.equal(hostOption, '-h');
	assert.ok(
		socket.startsWith('/') &&
			socket.includes('/buildos-sql-contract-') &&
			socket.endsWith('/socket')
	);
	assert.equal(userOption, '-U');
	assert.equal(user, 'postgres');
	assert.equal(databaseOption, '-d');
	assert.equal(database, 'postgres');
}
export async function verifyUploadCleanupRaces(connectionArgs) {
	assertDisposableConnection(connectionArgs);
	const args = ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...connectionArgs];
	const query = (sql) =>
		execFileSync('psql', [...args, '-c', sql], {
			encoding: 'utf8',
			stdio: 'pipe',
			timeout: 10000
		}).trim();
	const reset = () =>
		query(
			'DELETE FROM libri.image_upload_cleanup_checks; UPDATE libri.image_upload_controls SET cleanup_enabled=true;'
		);
	function session(name) {
		const child = spawn('psql', args, {
			env: { ...process.env, PGAPPNAME: name },
			stdio: ['pipe', 'pipe', 'pipe'],
			timeout: 15000
		});
		let stdout = '',
			stderr = '';
		child.stdout.on('data', (data) => {
			stdout += data;
		});
		child.stderr.on('data', (data) => {
			stderr += data;
		});
		child.stdin.on('error', () => {});
		const done = new Promise((resolve) => {
			child.on('error', (error) => resolve({ code: -1, stdout, stderr: String(error) }));
			child.on('close', (code) => resolve({ code, stdout, stderr }));
		});
		return { child, done, output: () => stdout };
	}
	async function until(check, message) {
		const deadline = Date.now() + 1500;
		while (Date.now() < deadline) {
			if (check()) return;
			await delay(20);
		}
		throw Error(message);
	}
	async function race(
		label,
		holderSql,
		contenderSql,
		{ validate, commit = true, expiry = false } = {}
	) {
		const holder = session('libri_cleanup_holder');
		let contender;
		try {
			holder.child.stdin.write('BEGIN; ' + holderSql + "\nSELECT 'READY';\n");
			await until(
				() => holder.output().includes('READY'),
				label + ': missing holder barrier'
			);
			contender = session('libri_cleanup_contender');
			contender.child.stdin.end('SET ROLE service_role; ' + contenderSql);
			await until(
				() =>
					query(
						"SELECT count(*) FROM pg_stat_activity WHERE application_name='libri_cleanup_contender' AND wait_event_type='Lock'"
					) === '1',
				label + ': overlap not observed'
			);
			if (expiry) {
				assert.equal(
					query(
						"SELECT query_start < (SELECT lease_expires_at FROM libri.image_upload_cleanup_checks) FROM pg_stat_activity WHERE application_name='libri_cleanup_contender'"
					),
					't'
				);
				await delay(1100);
			}
			holder.child.stdin.end(commit ? 'COMMIT;\n' : 'ROLLBACK;\n');
			const [first, second] = await Promise.all([holder.done, contender.done]);
			assert.equal(first.code, 0, label + ': ' + first.stderr);
			assert.equal(second.code, 0, label + ': ' + second.stderr);
			validate?.(second.stdout.trim());
			console.log('  ✓ ' + label + ' (observed real overlapping transactions)');
		} finally {
			for (const s of [holder, contender].filter(Boolean)) {
				if (s.child.exitCode === null) s.child.kill('SIGTERM');
				await s.done;
			}
		}
	}
	reset();
	await race(
		'duplicate cleanup claim keeps the exact lease',
		'SET ROLE service_role; ' + claim(),
		claim(),
		{
			validate: (out) => {
				const receipt = JSON.parse(out);
				assert.equal(receipt.generation, 1);
				assert.equal(query('SELECT count(*) FROM libri.image_upload_cleanup_checks'), '1');
				assert.equal(
					query(
						`SELECT lease_expires_at='${receipt.lease_expires_at}'::timestamptz FROM libri.image_upload_cleanup_checks`
					),
					't'
				);
			}
		}
	);
	reset();
	await race(
		'different cleanup targets share one active slot',
		'SET ROLE service_role; ' + claim(),
		claim(2, 'unpublished'),
		{ validate: (out) => assert.equal(out, '') }
	);
	reset();
	await race(
		'rolled-back cleanup claim does not spend a generation',
		'SET ROLE service_role; ' + claim(),
		claim(2),
		{ commit: false, validate: (out) => assert.equal(JSON.parse(out).generation, 1) }
	);
	reset();
	await race(
		'cleanup kill switch wins before queued claim',
		'UPDATE libri.image_upload_controls SET cleanup_enabled=false;',
		claim(),
		{ validate: (out) => assert.equal(out, '') }
	);
	reset();
	query('SET ROLE service_role; ' + claim());
	await race(
		'cleanup kill switch wins before queued authorization',
		'UPDATE libri.image_upload_controls SET cleanup_enabled=false;',
		authorize(),
		{ validate: (out) => assert.equal(out, '') }
	);
	for (const [label, contender] of [
		['same-token claim', claim()],
		['authorization', authorize()],
		['settlement', finish()]
	]) {
		reset();
		query('SET ROLE service_role; ' + claim());
		query(
			"UPDATE libri.image_upload_cleanup_checks SET lease_expires_at=statement_timestamp()+interval '1 second';"
		);
		await race(
			'cleanup ' + label + ' refreshes time after check-row wait',
			'SELECT target_id FROM libri.image_upload_cleanup_checks FOR UPDATE;',
			contender,
			{
				expiry: true,
				validate: (out) => assert.equal(out, label === 'settlement' ? 'f' : '')
			}
		);
	}
	reset();
	query('SET ROLE service_role; ' + claim());
	query(
		"UPDATE libri.image_upload_cleanup_checks SET lease_expires_at=statement_timestamp()-interval '1 second';"
	);
	await race(
		'replacement cleanup generation fences stale completion',
		'SET ROLE service_role; ' + claim(2),
		finish(),
		{
			validate: (out) => {
				assert.equal(out, 'f');
				assert.equal(
					query(
						"SELECT generation=2 AND status='leased' FROM libri.image_upload_cleanup_checks"
					),
					't'
				);
			}
		}
	);
	reset();
	query('SET ROLE service_role; ' + claim());
	await race(
		'duplicate cleanup receipt cannot reset its observation time',
		'SET ROLE service_role; ' + finish(),
		finish(),
		{
			validate: (out) => {
				assert.equal(out, 't');
				const before = query(
					'SELECT row_to_json(c) FROM libri.image_upload_cleanup_checks c'
				);
				assert.equal(query('SET ROLE service_role; ' + finish()), 't');
				assert.equal(
					query('SELECT row_to_json(c) FROM libri.image_upload_cleanup_checks c'),
					before
				);
			}
		}
	);
	reset();
	query('SET ROLE service_role; ' + claim());
	await race(
		'failed cleanup settlement transaction can be reconciled',
		'SET ROLE service_role; ' + finish(),
		finish(),
		{ commit: false, validate: (out) => assert.equal(out, 't') }
	);
	reset();
}
