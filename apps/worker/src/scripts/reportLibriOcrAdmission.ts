import 'dotenv/config';
import { createLibriDatabase } from '../workers/libri/database';

void main().catch((error: unknown) => {
	console.error('Libri OCR admission audit failed:', error);
	process.exitCode = 1;
});

async function main(): Promise<void> {
	const admissionId = process.argv[2]?.trim();
	if (!admissionId) {
		throw new Error('Usage: pnpm libri:admission-audit -- <admission-uuid>');
	}

	const database = createLibriDatabase(requireEnvironment(process.env, 'LIBRI_DATABASE_URL'), {
		caCertificate: requireEnvironment(process.env, 'LIBRI_DATABASE_CA_CERT')
	});

	try {
		await database.probe();
		const receipt = await database.auditOcrAdmission({ admissionId });
		console.log(JSON.stringify(receipt));
		if (!receipt.healthy) process.exitCode = 2;
	} finally {
		await database.close();
	}
}

function requireEnvironment(environment: NodeJS.ProcessEnv, name: string): string {
	const value = environment[name]?.trim();
	if (!value) throw new Error(`${name} is required for the Libri admission audit`);
	return value;
}
