// apps/worker/scripts/company-lookup-try.ts
//
// Try the free company lookup (tasker 170) on names you type, against the live free sources.
// Free, saves nothing, and touches no database: the company directory is skipped unless you
// pass --directory, which reads company_directory with the worker's service-role client.
//
//   cd apps/worker && pnpm exec tsx scripts/company-lookup-try.ts "Booz Allen Hamilton" "Stripe"
//   cd apps/worker && pnpm exec tsx scripts/company-lookup-try.ts --directory "Summit Consulting"
//   ... --site boozallen.com "Booz Allen Hamilton"   (as if the entry already had that website)
//
// Each name is sent to Wikidata, GLEIF, USAspending and Clearbit, so only type names you are
// content to send there.

import {
	type CompanyCandidate,
	companyOptionAbout,
	companyOptionLine
} from '@buildos/shared-agent-ops/knowledge';
import { fetchPublicUrl } from '@buildos/shared-agent-ops/web/safe-fetch';
import {
	type CompanyLocateDeps,
	companyLookupStores,
	createPacedJsonFetch,
	locateCompany
} from '../src/workers/knowledge/companyLocate';

async function main() {
	const args = process.argv.slice(2);
	const useDirectory = args.includes('--directory');
	const siteAt = args.indexOf('--site');
	const site = siteAt >= 0 ? (args[siteAt + 1] ?? null) : null;
	const names = args.filter(
		(arg, i) => !arg.startsWith('--') && (siteAt < 0 || i !== siteAt + 1)
	);
	if (!names.length) {
		console.error(
			'Usage: tsx scripts/company-lookup-try.ts [--directory] [--site domain] "Company name" ...'
		);
		process.exit(1);
	}

	const memory = new Map<string, CompanyCandidate[]>();
	let directory: CompanyLocateDeps['directory'] = async () => [];
	if (useDirectory) {
		const { supabase } = await import('../src/lib/supabase');
		directory = companyLookupStores(supabase as never).directory;
	}
	const deps: CompanyLocateDeps = {
		directory,
		cache: {
			get: async (source, key) => memory.get(`${source}:${key}`) ?? null,
			set: async (source, key, candidates) => void memory.set(`${source}:${key}`, candidates)
		},
		fetchJson: createPacedJsonFetch(),
		fetchHtml: async (url) => {
			const page = await fetchPublicUrl(url, { timeoutMs: 6_000, maxBytes: 700_000 });
			return page.status < 400 ? page.body : null;
		}
	};

	for (const name of names) {
		const started = Date.now();
		const { verdict, sources } = await locateCompany(name, site, deps);
		console.log(
			`\n${name}  →  ${verdict.outcome}  (${verdict.total} with this name, ${Date.now() - started} ms)`
		);
		console.log(
			`  sources: ${
				Object.entries(sources)
					.map(([s, state]) => `${s} ${state}`)
					.join(', ') || 'none asked'
			}`
		);
		const shown = verdict.chosen ? [verdict.chosen] : verdict.options;
		for (const option of shown) {
			console.log(
				`  • ${option.name}: ${companyOptionLine(option) || '(no town or website)'}`
			);
			const about = companyOptionAbout(option);
			if (about) console.log(`      ${about}`);
			if (option.street) console.log(`      ${option.street}`);
			console.log(
				`      from ${option.sources.map((s) => s.source).join(' + ')}${option.agreed ? ' (agree)' : ''}`
			);
		}
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
