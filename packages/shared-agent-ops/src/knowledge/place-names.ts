// packages/shared-agent-ops/src/knowledge/place-names.ts
//
// One spelling per place. Sources write the same town many ways ("Annapolis, MD", "annapolis /
// maryland / united states", "ANNAPOLIS US-MD"), and a place entry is matched by its name, so
// without this the same town becomes several places and "everyone in Maryland" finds a third
// of them.
//
//   canonicalPlace({ city, region, country }) → name "Annapolis, MD" + key "place:us:md:annapolis"
//   parsePlaceName("Annapolis, Maryland")     → the same place, for folding entries already saved
//
// The key carries the roll-up: every place under "place:us:md:" is in Maryland, every place
// under "place:us:" is in the United States. These parse structured values (codes, comma-separated
// place names), not language.

import { collapseWhitespace } from './normalize';

export const US_STATES: Readonly<Record<string, string>> = {
	AL: 'Alabama',
	AK: 'Alaska',
	AZ: 'Arizona',
	AR: 'Arkansas',
	CA: 'California',
	CO: 'Colorado',
	CT: 'Connecticut',
	DE: 'Delaware',
	DC: 'District of Columbia',
	FL: 'Florida',
	GA: 'Georgia',
	HI: 'Hawaii',
	ID: 'Idaho',
	IL: 'Illinois',
	IN: 'Indiana',
	IA: 'Iowa',
	KS: 'Kansas',
	KY: 'Kentucky',
	LA: 'Louisiana',
	ME: 'Maine',
	MD: 'Maryland',
	MA: 'Massachusetts',
	MI: 'Michigan',
	MN: 'Minnesota',
	MS: 'Mississippi',
	MO: 'Missouri',
	MT: 'Montana',
	NE: 'Nebraska',
	NV: 'Nevada',
	NH: 'New Hampshire',
	NJ: 'New Jersey',
	NM: 'New Mexico',
	NY: 'New York',
	NC: 'North Carolina',
	ND: 'North Dakota',
	OH: 'Ohio',
	OK: 'Oklahoma',
	OR: 'Oregon',
	PA: 'Pennsylvania',
	PR: 'Puerto Rico',
	RI: 'Rhode Island',
	SC: 'South Carolina',
	SD: 'South Dakota',
	TN: 'Tennessee',
	TX: 'Texas',
	UT: 'Utah',
	VT: 'Vermont',
	VA: 'Virginia',
	WA: 'Washington',
	WV: 'West Virginia',
	WI: 'Wisconsin',
	WY: 'Wyoming'
};

export const CA_PROVINCES: Readonly<Record<string, string>> = {
	AB: 'Alberta',
	BC: 'British Columbia',
	MB: 'Manitoba',
	NB: 'New Brunswick',
	NL: 'Newfoundland and Labrador',
	NS: 'Nova Scotia',
	NT: 'Northwest Territories',
	NU: 'Nunavut',
	ON: 'Ontario',
	PE: 'Prince Edward Island',
	QC: 'Quebec',
	SK: 'Saskatchewan',
	YT: 'Yukon'
};

/** Countries whose regions are written as a short code after the town ("Austin, TX"). */
const CODED_REGIONS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
	US: US_STATES,
	CA: CA_PROVINCES
};

const COUNTRY_ALIASES: Readonly<Record<string, string>> = {
	usa: 'US',
	'u.s.': 'US',
	'u.s.a.': 'US',
	'united states of america': 'US',
	america: 'US',
	uk: 'GB',
	'u.k.': 'GB',
	'great britain': 'GB',
	england: 'GB',
	scotland: 'GB',
	wales: 'GB',
	'northern ireland': 'GB',
	'south korea': 'KR',
	russia: 'RU',
	'czech republic': 'CZ',
	'the netherlands': 'NL',
	holland: 'NL',
	uae: 'AE'
};

let countryNames: Intl.DisplayNames | null | undefined;
let countryByName: Map<string, string> | undefined;

function displayNames(): Intl.DisplayNames | null {
	if (countryNames !== undefined) return countryNames;
	try {
		countryNames = new Intl.DisplayNames(['en'], { type: 'region' });
	} catch {
		countryNames = null;
	}
	return countryNames;
}

/** "US" → "United States". Null for a code the runtime does not know. */
export function countryName(code: string): string | null {
	const upper = code.toUpperCase();
	if (!/^[A-Z]{2}$/.test(upper)) return null;
	try {
		const name = displayNames()?.of(upper);
		return name && name !== upper ? name : null;
	} catch {
		return null;
	}
}

/** The code in use today for a region code that may have been retired ("DD" → "DE"). */
function currentRegionCode(code: string): string {
	try {
		const canonical = Intl.getCanonicalLocales(`und-${code}`)[0] ?? '';
		return canonical.split('-')[1] ?? code;
	} catch {
		return code;
	}
}

/** A country written as a code or an English name → its two-letter code. */
export function countryCode(value: string | null | undefined): string | null {
	const text = collapseWhitespace(value ?? '');
	if (!text) return null;
	const lower = text.toLowerCase();
	if (COUNTRY_ALIASES[lower]) return COUNTRY_ALIASES[lower]!;
	if (/^[a-z]{2}$/i.test(text) && countryName(text)) return currentRegionCode(text.toUpperCase());
	if (!countryByName) {
		countryByName = new Map();
		const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
		for (const a of letters) {
			for (const b of letters) {
				const code = a + b;
				// Retired codes still resolve to a name ("DD" → Germany): keep current codes only.
				if (currentRegionCode(code) !== code) continue;
				const name = countryName(code);
				if (name && !countryByName.has(name.toLowerCase()))
					countryByName.set(name.toLowerCase(), code);
			}
		}
	}
	return countryByName.get(lower) ?? null;
}

/**
 * A state or province written as "VA", "US-VA" or "Virginia" → its code, for countries that
 * write regions as codes. Null otherwise.
 */
export function regionCode(value: string | null | undefined, country: string): string | null {
	const table = CODED_REGIONS[country];
	const text = collapseWhitespace(value ?? '');
	if (!table || !text) return null;
	const bare = text
		.replace(new RegExp(`^${country}-`, 'i'), '')
		.replace(/\./g, '')
		.toUpperCase();
	if (table[bare]) return bare;
	const lower = text.toLowerCase();
	for (const [code, name] of Object.entries(table)) {
		if (name.toLowerCase() === lower) return code;
	}
	return null;
}

/** Which coded-region country a bare state name or code belongs to ("Maryland" → US, MD). */
function codedRegion(value: string): { country: string; code: string } | null {
	for (const country of Object.keys(CODED_REGIONS)) {
		const code = regionCode(value, country);
		if (code) return { country, code };
	}
	return null;
}

/**
 * Towns that sources name two ways, by country. Without these the same city is two places:
 * Wikidata says "New York City" and "Washington, D.C.", everything else "New York" and
 * "Washington" + DC.
 */
const CITY_ALIASES: Readonly<
	Record<string, Readonly<Record<string, { city: string; region: string }>>>
> = {
	US: {
		'new york city': { city: 'New York', region: 'NY' },
		'washington, d.c.': { city: 'Washington', region: 'DC' },
		'washington d.c.': { city: 'Washington', region: 'DC' },
		'washington, dc': { city: 'Washington', region: 'DC' },
		'washington dc': { city: 'Washington', region: 'DC' }
	}
};

/** Lowercase letters and digits only, accents removed: the part of a key a town contributes. */
function foldPlaceWord(value: string): string {
	return value
		.normalize('NFD')
		.replace(/\p{M}+/gu, '')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim()
		.replace(/ /g, '-');
}

/**
 * A town as a person would write it. Sources that shout ("MCLEAN") or whisper ("san francisco")
 * are put in title case; anything already in mixed case ("McLean") is kept as written.
 */
export function tidyPlaceWord(value: string): string {
	const text = collapseWhitespace(value);
	if (!text) return text;
	const mixed = text !== text.toLowerCase() && text !== text.toUpperCase();
	if (mixed) return text;
	return text.toLowerCase().replace(/(^|[\s\-'’.(])(\p{L})/gu, (_, lead, letter) => {
		return `${lead}${String(letter).toUpperCase()}`;
	});
}

export interface PlaceParts {
	city?: string | null;
	region?: string | null;
	country?: string | null;
}

export interface CanonicalPlace {
	/** What the place entry is called: "Annapolis, MD", "London, United Kingdom", "Maryland". */
	name: string;
	/** Stable identity: "place:us:md:annapolis". A prefix of it is the place it sits inside. */
	key: string;
	level: 'city' | 'region' | 'country';
	city: string | null;
	/** Region as displayed: the code for coded countries ("MD"), the name elsewhere. */
	region: string | null;
	regionName: string | null;
	countryCode: string;
	country: string;
}

/**
 * The one name and key for a place, from whatever parts a source gives. Null when there is no
 * country to stand on (a bare town name could be anywhere) and no state that implies one.
 */
export function canonicalPlace(parts: PlaceParts): CanonicalPlace | null {
	const rawCity = collapseWhitespace(parts.city ?? '');
	const rawRegion = collapseWhitespace(parts.region ?? '');
	let cc = countryCode(parts.country);
	let code: string | null = null;
	if (cc) code = regionCode(rawRegion, cc);
	else if (rawRegion) {
		// "Annapolis, MD" with no country: a US state or Canadian province says which country.
		const coded = codedRegion(rawRegion);
		if (coded) {
			cc = coded.country;
			code = coded.code;
		}
	}
	if (!cc) return null;
	let cityText = rawCity;
	const alias = CITY_ALIASES[cc]?.[rawCity.toLowerCase()];
	if (alias) {
		cityText = alias.city;
		code ??= alias.region;
	}
	const country = countryName(cc) ?? cc;
	const coded = Boolean(CODED_REGIONS[cc]);
	const regionName = code
		? CODED_REGIONS[cc]![code]!
		: rawRegion
			? tidyPlaceWord(rawRegion)
			: null;
	const region = code ?? regionName;
	const city = cityText ? tidyPlaceWord(cityText) : null;
	const ccKey = cc.toLowerCase();
	// Regions outside the coded countries are spelled too many ways to key on ("Greater London",
	// "England", "GB-LND"), so there the town sits directly under its country.
	const regionKey = coded && code ? code.toLowerCase() : '';

	if (city) {
		// A coded country's town without its state is not placed: "Springfield, United States"
		// names thirty towns.
		const key = `place:${ccKey}:${regionKey}:${foldPlaceWord(city)}`;
		const name = coded
			? code
				? `${city}, ${code}`
				: `${city}, ${country}`
			: `${city}, ${country}`;
		return { name, key, level: 'city', city, region, regionName, countryCode: cc, country };
	}
	if (coded && code) {
		return {
			name: regionName!,
			key: `place:${ccKey}:${regionKey}:`,
			level: 'region',
			city: null,
			region,
			regionName,
			countryCode: cc,
			country
		};
	}
	return {
		name: country,
		key: `place:${ccKey}::`,
		level: 'country',
		city: null,
		region: null,
		regionName: null,
		countryCode: cc,
		country
	};
}

/**
 * Read a place entry's name back into parts: "Annapolis, Maryland", "Washington, District of
 * Columbia, United States", "Colorado", "United States". Null for anything else (a bare town,
 * a street address), which is left alone.
 */
export function parsePlaceName(name: string): CanonicalPlace | null {
	const parts = name
		.split(',')
		.map((part) => collapseWhitespace(part))
		.filter(Boolean);
	if (!parts.length || parts.length > 3) return null;
	if (parts.some((part) => /\d/.test(part))) return null; // a street address or a postcode
	if (parts.length === 1) {
		const only = parts[0]!;
		const coded = only.length > 2 ? codedRegion(only) : null;
		if (coded) return canonicalPlace({ region: coded.code, country: coded.country });
		return countryCode(only) && only.length > 2 ? canonicalPlace({ country: only }) : null;
	}
	if (parts.length === 2) {
		const [first, second] = parts as [string, string];
		if (codedRegion(second)) return canonicalPlace({ city: first, region: second });
		if (countryCode(second)) {
			const coded = codedRegion(first);
			// "Maryland, United States" is the state, not a town called Maryland.
			if (coded && coded.country === countryCode(second))
				return canonicalPlace({ region: coded.code, country: coded.country });
			return canonicalPlace({ city: first, country: second });
		}
		return null;
	}
	const [city, region, country] = parts as [string, string, string];
	return countryCode(country) ? canonicalPlace({ city, region, country }) : null;
}

/** The key of the place this one sits inside: a town's state, a state's country. */
export function parentPlaceKey(key: string): string | null {
	const match = key.match(/^place:([a-z]{2}):([a-z0-9-]*):([^:]*)$/);
	if (!match) return null;
	const [, cc, region, city] = match;
	if (city) return region ? `place:${cc}:${region}:` : `place:${cc}::`;
	return region ? `place:${cc}::` : null;
}
