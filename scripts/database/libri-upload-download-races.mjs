// Only invoked against a newly created disposable database, never hosted credentials.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

export const uploadDownloadContract = '20260907015150_libri_upload_download_authorization.test.sql';
const library = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const upload = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
const token = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
const authorize = `SET ROLE service_role; SELECT libri.authorize_image_upload_download('${library}','${upload}','${token}',1);`;

export async function verifyUploadDownloadRaces(connectionArgs) {
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
	async function race(
		label,
		holderSql,
		contenderSql,
		expectDenied,
		commit = true,
		expireWhileWaiting = false
	) {
		const holder = session('libri_download_holder');
		let contender;
		try {
			holder.child.stdin.write(`BEGIN; ${holderSql};\nSELECT 'READY';\n`);
			await until(
				() => holder.output().includes('READY'),
				`${label}: missing holder barrier`
			);
			contender = session('libri_download_contender');
			contender.child.stdin.end(contenderSql);
			await until(
				() =>
					query(
						"SELECT count(*) FROM pg_stat_activity WHERE application_name='libri_download_contender' AND wait_event_type='Lock'"
					) === '1',
				`${label}: no observed overlap`
			);
			if (expireWhileWaiting) {
				const expires = Number(holder.output().split('\n')[0]);
				const started = Number(
					query(
						"SELECT extract(epoch FROM query_start)*1000 FROM pg_stat_activity WHERE application_name='libri_download_contender'"
					)
				);
				assert.ok(
					Number.isFinite(expires) && started < expires,
					'contender must begin before lease expiry'
				);
				await delay(1100);
			}
			holder.child.stdin.end(commit ? 'COMMIT;\n' : 'ROLLBACK;\n');
			const results = await Promise.all([holder.done, contender.done]);
			for (const result of results)
				assert.equal(result.code, 0, `${label}: ${result.stderr}`);
			if (expectDenied !== null)
				assert.equal(results[1].stdout.trim() === '', expectDenied, label);
			console.log(`  ✓ ${label} (observed real overlapping transactions)`);
		} finally {
			for (const item of [holder, contender].filter(Boolean)) {
				if (item.child.exitCode === null) item.child.kill('SIGTERM');
				await item.done;
			}
		}
	}
	const reset = () =>
		query(`UPDATE libri.library_members SET role='owner'; UPDATE libri.image_upload_controls SET admission_enabled=true,processing_enabled=true;
		UPDATE libri.image_upload_processing SET status='leased',attempt=1,lease_token='${token}',lease_expires_at=clock_timestamp()+interval '90 seconds';`);
	for (const [label, sql] of [
		[
			'membership revocation wins before download authorization',
			"UPDATE libri.library_members SET role='viewer'"
		],
		[
			'processing disable wins before download authorization',
			'UPDATE libri.image_upload_controls SET processing_enabled=false'
		],
		[
			'admission disable wins before download authorization',
			'UPDATE libri.image_upload_controls SET admission_enabled=false'
		],
		[
			'replacement lease fences queued download',
			"UPDATE libri.image_upload_processing SET attempt=2,lease_token='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2'"
		],
		[
			'failure settlement fences queued download',
			"UPDATE libri.image_upload_processing SET status='blocked',last_failure='invalid_image'"
		]
	]) {
		reset();
		await race(label, sql, authorize, true);
	}
	reset();
	await race(
		'lease expires while authorization waits for the processing lock',
		"UPDATE libri.image_upload_processing SET lease_expires_at=clock_timestamp()+interval '1 second' RETURNING extract(epoch FROM lease_expires_at)*1000",
		authorize,
		true,
		true,
		true
	);
	reset();
	await race(
		'rolled-back revocation does not deny current authority',
		"UPDATE libri.library_members SET role='viewer'",
		authorize,
		false,
		false
	);
	reset();
	await race(
		'authorization holds membership stable only until its transaction ends',
		authorize,
		"UPDATE libri.library_members SET role='viewer'",
		null
	);
	assert.equal(query(authorize), '', 'revocation must deny the next authorization');
}
