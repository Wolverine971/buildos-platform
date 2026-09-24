// docs/research/web-navigation-2026-09-22/tasks.ts
// Navigation tasks: start page + goal + how to recognize the destination.
// `target` is checked in code after the run; it is never sent to a model.
export type NavTask = {
	id: string;
	start: string;
	goal: string;
	target: RegExp; // URL of a page that satisfies the goal
	targetText?: RegExp; // optional: text that must appear on that page
	origin?: string;
};

export const TASKS: NavTask[] = [
	{
		id: 'naaccc-lunch',
		origin: 'prod session 2026-09-20: chat was blocked from opening this event',
		start: 'https://business.naaccc.com/event-calendar',
		goal: "Find the details page for the chamber's Networking Lunch at Italia's Corner (date, time, location).",
		target: /event-calendar\/Details\/networking-lunch-italia/i
	},
	{
		id: 'mailchimp-free-limits',
		origin: 'prod session 2026-09-08: chat was blocked from opening mailchimp.com/pricing',
		start: 'https://mailchimp.com/',
		goal: "Find how many contacts and monthly email sends Mailchimp's Free plan includes.",
		target: /mailchimp\.com\/(?:[a-z-]+\/)?pricing/i
	},
	{
		id: 'aacounty-bids',
		start: 'https://www.aacounty.org/purchasing',
		goal: 'Find where Anne Arundel County lists its current bid opportunities and open solicitations.',
		target: /aacounty\.org\/.*(?:bid|solicitation|opportunit)/i
	},
	{
		id: 'montgomery-solicitations',
		start: 'https://www.montgomerycountymd.gov/PRO/',
		goal: "Find the page listing Montgomery County's currently open solicitations.",
		target: /montgomerycountymd\.gov\/.*solicitation/i
	},
	{
		id: 'baltimore-vendor-registration',
		start: 'https://procurement.baltimorecity.gov/',
		goal: 'Find how a business registers as a vendor/supplier with Baltimore City.',
		target: /baltimorecity\.gov\/.*(?:vendor|supplier|register|registration)/i
	},
	{
		id: 'mdot-procurement',
		origin: 'ASP.NET page whose text web_visit drops entirely (<form> wrapper)',
		start: 'https://www.mdot.maryland.gov/',
		goal: "Find MDOT's page for procurement / bid opportunities for businesses.",
		target: /mdot\.maryland\.gov\/tso\/pages\/Index\.aspx\?PageId=11\b/i
	},
	{
		id: 'procore-pricing',
		start: 'https://www.procore.com/',
		goal: 'Find how Procore prices its construction software.',
		target: /procore\.com\/(?:[a-z-]+\/)?pricing/i
	},
	{
		id: 'constructconnect-pricing',
		start: 'https://www.constructconnect.com/',
		goal: 'Find ConstructConnect pricing for finding construction projects to bid on.',
		target: /constructconnect\.com\/(?:.*pric|get-started-now)/i
	},
	{
		id: 'agc-events',
		start: 'https://www.agc.org/',
		goal: "Find AGC's calendar of upcoming events, including its annual convention.",
		target: /agc\.org\/(?:connect\/events-calendar|.*convention)|agc-community\.agc\.org\/s\/lt-event/i
	},
	{
		id: 'supabase-rls',
		start: 'https://supabase.com/',
		goal: 'Find the Supabase documentation page about Row Level Security (RLS) policies.',
		target: /supabase\.com\/docs\/.*row-level-security/i
	},
	{
		id: 'svelte-derived',
		start: 'https://svelte.dev/docs/svelte/overview',
		goal: 'Find the documentation page for the $derived rune.',
		target: /svelte\.dev\/docs\/svelte\/(?:\$|%24)derived/i
	},
	{
		id: 'typesafe-score',
		start: 'https://docs.typesafe.ai/primitives/choice',
		goal: 'Find the documentation for the Score primitive.',
		target: /docs\.typesafe\.ai\/primitives\/score/i
	},
	{
		id: 'mdn-429',
		start: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/403',
		goal: 'Find the reference page for the HTTP 429 Too Many Requests status code.',
		target: /developer\.mozilla\.org\/.*\/429/i
	},
	{
		id: 'wiki-county-population',
		start: 'https://en.wikipedia.org/wiki/Glen_Burnie,_Maryland',
		goal: 'Find the population of the county that Glen Burnie is located in.',
		target: /wikipedia\.org\/wiki\/Anne_Arundel_County(?:,_Maryland)?$/i
	},
	{
		id: 'aacounty-home-bids',
		origin: 'multi-hop from a county homepage (Bid Desk)',
		start: 'https://www.aacounty.org/',
		goal: 'Find where Anne Arundel County posts its open bids and solicitations for vendors.',
		target: /aacounty\.org\/(?:solicitations|purchasing)/i
	},
	{
		id: 'hn-opus-thread',
		start: 'https://news.ycombinator.com/',
		goal: 'Open the Hacker News discussion thread about the Claude Opus 5.5 announcement.',
		target: /news\.ycombinator\.com\/item\?id=\d+/i,
		targetText: /Opus 5\.5/i
	},
	{
		id: 'linear-changelog',
		start: 'https://linear.app/',
		goal: "Find Linear's changelog of recent product updates.",
		target: /linear\.app\/changelog\/?$/i
	},
	{
		id: 'stripe-intl-fee',
		start: 'https://stripe.com/',
		goal: 'Find the additional fee Stripe charges US businesses for international cards.',
		target: /stripe\.com\/(?:[a-z-]+\/)?pricing/i
	},
	{
		id: 'anthropic-api-pricing',
		start: 'https://www.anthropic.com/',
		goal: 'Find the per-token API pricing for Claude models.',
		target: /(?:anthropic\.com|claude\.com)\/.*pricing/i
	},
	{
		id: 'buildos-pricing',
		start: 'https://build-os.com/',
		goal: 'Find what BuildOS costs.',
		target: /build-os\.com\/pricing/i
	}
];
