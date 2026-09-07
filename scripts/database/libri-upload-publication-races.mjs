// Invoked only by the disposable SQL runner. No hosted credential/environment fallback.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

export const uploadPublicationContract =
	'20260907041707_libri_upload_publication_contract.test.sql';
const library = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const upload = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
const token = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
const verified =
	'{"mimeType":"image/png","byteSize":1024,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","width":32,"height":32,"channels":3}';
const fence = "'" + library + "','" + upload + "','" + token + "',1";
const prepare = 'SELECT libri.prepare_image_upload_publication(' + fence + ",'" + verified + "');";
const finish =
	'SELECT libri.finalize_image_upload_publication(' +
	fence +
	",(SELECT id FROM libri.image_upload_publications WHERE attempt=1),'ffffffff-ffff-4fff-8fff-fffffffffff1','" +
	verified +
	"');";

export async function verifyUploadPublicationRaces(connectionArgs) {
	const args = ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...connectionArgs];
	const query = (sql) =>
		execFileSync('psql', [...args, '-c', sql], {
			encoding: 'utf8',
			stdio: 'pipe',
			timeout: 10000
		}).trim();
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
		throw new Error(message);
	}
	function reset(prepared = true) {
		query(
			'DELETE FROM libri.image_upload_publications; DELETE FROM libri.images; DELETE FROM libri.source_book_links; DELETE FROM libri.sources; ' +
				"UPDATE libri.library_members SET role='owner'; UPDATE libri.image_upload_controls SET admission_enabled=true,processing_enabled=true; " +
				"UPDATE libri.image_upload_processing SET status='leased',attempt=1,lease_token='" +
				token +
				"',lease_expires_at=clock_timestamp()+interval '90 seconds',last_failure=NULL; " +
				(prepared ? 'SET ROLE service_role; ' + prepare : '')
		);
	}
	async function race(
		label,
		holderSql,
		contenderSql,
		{ commit = true, expiry = false, expectedImages = 0, validate = () => {} } = {}
	) {
		const holder = session('libri_publication_holder');
		let contender;
		try {
			holder.child.stdin.write('BEGIN; ' + holderSql + "\nSELECT 'READY';\n");
			await until(
				() => holder.output().includes('READY'),
				label + ': holder barrier missing'
			);
			contender = session('libri_publication_contender');
			contender.child.stdin.end(contenderSql);
			await until(
				() =>
					query(
						"SELECT count(*) FROM pg_stat_activity WHERE application_name='libri_publication_contender' AND wait_event_type='Lock'"
					) === '1',
				label + ': no observed overlap'
			);
			if (expiry) {
				assert.equal(
					query(
						"SELECT query_start < (SELECT lease_expires_at FROM libri.image_upload_processing) FROM pg_stat_activity WHERE application_name='libri_publication_contender'"
					),
					't',
					'contender starts before expiry'
				);
				await delay(1100);
			}
			holder.child.stdin.end(commit ? 'COMMIT;\n' : 'ROLLBACK;\n');
			const [first, second] = await Promise.all([holder.done, contender.done]);
			assert.equal(first.code, 0, label + ': ' + first.stderr);
			assert.equal(second.code, 0, label + ': ' + second.stderr);
			assert.equal(Number(query('SELECT count(*) FROM libri.images')), expectedImages, label);
			validate(second.stdout.trim());
			console.log('  ✓ ' + label + ' (observed real overlapping transactions)');
		} finally {
			for (const s of [holder, contender].filter(Boolean)) {
				if (s.child.exitCode === null) s.child.kill('SIGTERM');
				await s.done;
			}
		}
	}
	const denied = (output) => assert.equal(output, '');
	reset(false);
	await race(
		'concurrent prepare reuses one immutable publication',
		'SET ROLE service_role; ' + prepare,
		'SET ROLE service_role; ' + prepare,
		{
			validate: (output) =>
				assert.equal(
					JSON.parse(output).publication_id,
					query('SELECT id FROM libri.image_upload_publications')
				)
		}
	);
	assert.equal(query('SELECT count(*) FROM libri.image_upload_publications'), '1');
	for (const [label, sql] of [
		[
			'membership revocation wins finalization',
			"UPDATE libri.library_members SET role='viewer';"
		],
		[
			'processing disable wins finalization',
			'UPDATE libri.image_upload_controls SET processing_enabled=false;'
		],
		[
			'admission disable wins finalization',
			'UPDATE libri.image_upload_controls SET admission_enabled=false;'
		],
		[
			'replacement lease fences publication',
			"UPDATE libri.image_upload_processing SET attempt=2,lease_token='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2';"
		],
		[
			'failure settlement fences publication',
			"UPDATE libri.image_upload_processing SET status='blocked',last_failure='invalid_image';"
		]
	]) {
		reset();
		await race(label, sql, 'SET ROLE service_role; ' + finish, { validate: denied });
	}
	reset();
	await race(
		'duplicate finalization commits one image/source/outbox',
		'SET ROLE service_role; ' + finish,
		'SET ROLE service_role; ' + finish,
		{
			expectedImages: 1,
			validate: (output) => assert.equal(JSON.parse(output).already_published, true)
		}
	);
	assert.equal(
		query(
			"SELECT count(*) FROM libri.image_upload_publications WHERE status='published' AND followup_status='pending'"
		),
		'1'
	);
	reset();
	await race(
		'rolled-back finalization leaves the next attempt atomic',
		'SET ROLE service_role; ' + finish,
		'SET ROLE service_role; ' + finish,
		{
			commit: false,
			expectedImages: 1,
			validate: (output) => assert.equal(JSON.parse(output).already_published, false)
		}
	);
	reset();
	await race(
		'published upload cannot be reclaimed by another token',
		'SET ROLE service_role; ' + finish,
		"SET ROLE libri_worker; SELECT libri.claim_image_upload('" +
			library +
			"','" +
			upload +
			"','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2');",
		{ expectedImages: 1, validate: denied }
	);
	reset();
	query(
		"UPDATE libri.image_upload_processing SET lease_expires_at=clock_timestamp()+interval '1 second'"
	);
	await race(
		'expiry during the publication-row wait denies finalization',
		'SELECT id FROM libri.image_upload_publications FOR UPDATE;',
		'SET ROLE service_role; ' + finish,
		{ expiry: true, validate: denied }
	);
	reset();
	await race(
		'changed verification while waiting cannot publish',
		'UPDATE libri.image_upload_publications SET verified_metadata=verified_metadata||\'{"width":31}\';',
		'SET ROLE service_role; ' + finish,
		{ validate: denied }
	);
	reset();
}
