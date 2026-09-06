// Only invoked by the SQL runner against its newly created disposable database.
// No environment credential lookup or hosted fallback exists in this module.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

export const uploadProcessingContract = '20260906201700_libri_upload_processing_leases.test.sql';
const library = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const id = (n) => `dddddddd-dddd-4ddd-8ddd-ddddddddddd${n}`;
const token = (n) => `eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee${n}`;
const claim = (n, generation = 1) =>
	`SET ROLE libri_worker; SELECT libri.claim_image_upload('${library}','${id(n)}','${token(generation)}');`;
const fail = (generation) =>
	`SET ROLE libri_worker; SELECT libri.fail_image_upload('${library}','${id(1)}','${token(generation)}',${generation},'invalid_image');`;

export async function verifyUploadProcessingRaces(connectionArgs) {
	const args = ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...connectionArgs];
	const query = (sql) =>
		execFileSync('psql', [...args, '-c', sql], {
			encoding: 'utf8',
			stdio: 'pipe',
			timeout: 10_000
		}).trim();
	function session(name) {
		const child = spawn('psql', args, {
			env: { ...process.env, PGAPPNAME: name },
			stdio: ['pipe', 'pipe', 'pipe'],
			timeout: 15_000
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
		const end = Date.now() + 1500;
		while (Date.now() < end) {
			if (check()) return;
			await delay(20);
		}
		throw new Error(message);
	}
	async function race(label, holderSql, contenderSql, commit = true) {
		const holder = session('libri_processing_holder');
		let contender;
		try {
			holder.child.stdin.write(`BEGIN; ${holderSql};\nSELECT 'HOLDER_READY';\n`);
			await until(
				() => holder.output().includes('HOLDER_READY'),
				`${label}: holder barrier missing`
			);
			contender = session('libri_processing_contender');
			contender.child.stdin.end(contenderSql);
			await until(
				() =>
					query(
						"SELECT count(*) FROM pg_stat_activity WHERE application_name='libri_processing_contender' AND wait_event_type='Lock'"
					) === '1',
				`${label}: no observed lock overlap`
			);
			holder.child.stdin.end(commit ? 'COMMIT;\n' : 'ROLLBACK;\n');
			const results = await Promise.all([holder.done, contender.done]);
			for (const result of results)
				assert.equal(result.code, 0, `${label}: ${result.stderr}`);
			console.log(`  ✓ ${label} (observed real overlapping transactions)`);
			return results.map((result) =>
				result.stdout
					.trim()
					.replace(/\n?HOLDER_READY$/, '')
					.trim()
			);
		} finally {
			for (const item of [holder, contender].filter(Boolean)) {
				if (item.child.exitCode === null) item.child.kill('SIGTERM');
				await item.done;
			}
		}
	}
	const reset = () => query('DELETE FROM libri.image_upload_processing');
	reset();
	let results = await race(
		'different uploads share a one-active-lease cap',
		claim(1),
		claim(2, 2)
	);
	assert.equal(JSON.parse(results[0]).attempt, 1);
	assert.equal(results[1], '');
	assert.equal(
		query("SELECT count(*) FROM libri.image_upload_processing WHERE status='leased'"),
		'1'
	);
	reset();
	results = await race(
		'duplicate claim retry retains one token/deadline/attempt',
		claim(1),
		claim(1)
	);
	assert.deepEqual(JSON.parse(results[0]), JSON.parse(results[1]));
	reset();
	results = await race('competing token cannot take a live lease', claim(1), claim(1, 2));
	assert.equal(results[1], '');
	reset();
	results = await race(
		'rolled-back claim does not spend an attempt',
		claim(1),
		claim(1, 2),
		false
	);
	assert.equal(JSON.parse(results[1]).attempt, 1);
	reset();
	query(claim(1));
	query("UPDATE libri.image_upload_processing SET lease_expires_at=now()-interval '1 second'");
	results = await race(
		'late failure is fenced after a replacement claim commits',
		claim(1, 2),
		fail(1)
	);
	assert.equal(JSON.parse(results[0]).attempt, 2);
	assert.equal(results[1], 'f');
	assert.equal(query('SELECT attempt FROM libri.image_upload_processing'), '2');
	reset();
	results = await race(
		'processing disable wins before a queued claim',
		'UPDATE libri.image_upload_controls SET processing_enabled=false',
		claim(1)
	);
	assert.equal(results[1], '');
	assert.equal(query('SELECT count(*) FROM libri.image_upload_processing'), '0');
	query('UPDATE libri.image_upload_controls SET processing_enabled=true');
	results = await race(
		'membership revocation wins before a queued claim',
		`UPDATE libri.library_members SET role='viewer' WHERE library_id='${library}'`,
		claim(1)
	);
	assert.equal(results[1], '');
	assert.equal(query('SELECT count(*) FROM libri.image_upload_processing'), '0');
	query(`UPDATE libri.library_members SET role='owner' WHERE library_id='${library}'`);
	query(claim(1));
	results = await race(
		'duplicate failure retry retains its acknowledged outcome',
		fail(1),
		fail(1)
	);
	assert.deepEqual(results, ['t', 't']);
	assert.equal(query('SELECT status FROM libri.image_upload_processing'), 'blocked');
	assert.equal(
		query(
			"SELECT count(*) FROM libri.image_upload_intents WHERE status='awaiting_verification'"
		),
		'3'
	);
}
