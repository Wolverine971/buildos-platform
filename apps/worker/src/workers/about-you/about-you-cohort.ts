// apps/worker/src/workers/about-you/about-you-cohort.ts
//
// Who gets an inferred About you note. ABOUT_YOU_USER_IDS is a comma-separated
// list of user ids, or `*` for everyone. Unset or empty means nobody: the job and
// its sweep stay dark until the cohort is named.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type AboutYouCohort = 'all' | readonly string[];

export function parseAboutYouCohort(raw: string | undefined | null): AboutYouCohort {
	const value = (raw ?? '').trim();
	if (value === '*') return 'all';
	return [
		...new Set(
			value
				.split(',')
				.map((id) => id.trim().toLowerCase())
				.filter((id) => UUID.test(id))
		)
	];
}

export function aboutYouCohort(env: NodeJS.ProcessEnv = process.env): AboutYouCohort {
	return parseAboutYouCohort(env.ABOUT_YOU_USER_IDS);
}

export function isAboutYouUser(userId: string, cohort: AboutYouCohort = aboutYouCohort()): boolean {
	if (cohort === 'all') return true;
	return cohort.includes(userId.trim().toLowerCase());
}
