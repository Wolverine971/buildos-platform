// packages/shared-agent-ops/src/knowledge/place-names.test.ts
import { describe, expect, it } from 'vitest';
import {
	canonicalPlace,
	countryCode,
	parentPlaceKey,
	parsePlaceName,
	regionCode
} from './place-names';

describe('canonicalPlace', () => {
	it('gives one name and key to every spelling of a US town', () => {
		const spellings = [
			canonicalPlace({ city: 'Annapolis', region: 'MD', country: 'US' }),
			canonicalPlace({ city: 'annapolis', region: 'maryland', country: 'united states' }),
			canonicalPlace({ city: 'ANNAPOLIS', region: 'US-MD', country: 'USA' }),
			canonicalPlace({ city: 'Annapolis', region: 'Maryland' })
		];
		for (const place of spellings) {
			expect(place?.name).toBe('Annapolis, MD');
			expect(place?.key).toBe('place:us:md:annapolis');
			expect(place?.level).toBe('city');
		}
	});

	it('keeps a name already written in mixed case', () => {
		expect(canonicalPlace({ city: 'McLean', region: 'VA', country: 'US' })?.name).toBe(
			'McLean, VA'
		);
		expect(canonicalPlace({ city: 'MCLEAN', region: 'VA', country: 'US' })?.name).toBe(
			'Mclean, VA'
		);
		expect(canonicalPlace({ city: 'MCLEAN', region: 'VA', country: 'US' })?.key).toBe(
			canonicalPlace({ city: 'McLean', region: 'VA', country: 'US' })?.key
		);
	});

	it('puts a town outside the US and Canada directly under its country', () => {
		const london = canonicalPlace({ city: 'London', region: 'GB-LND', country: 'GB' });
		expect(london?.name).toBe('London, United Kingdom');
		expect(london?.key).toBe('place:gb::london');
		expect(
			canonicalPlace({ city: 'london', region: 'england', country: 'united kingdom' })?.key
		).toBe('place:gb::london');
	});

	it('tells the two Londons apart', () => {
		expect(canonicalPlace({ city: 'London', region: 'Ontario', country: 'Canada' })?.name).toBe(
			'London, ON'
		);
	});

	it('folds accents and punctuation in the key only', () => {
		const place = canonicalPlace({ city: 'Zürich', country: 'CH' });
		expect(place?.name).toBe('Zürich, Switzerland');
		expect(place?.key).toBe('place:ch::zurich');
		expect(canonicalPlace({ city: 'St. Louis', region: 'MO', country: 'US' })?.key).toBe(
			'place:us:mo:st-louis'
		);
	});

	it('gives the cities sources name two ways a single place', () => {
		const nyc = canonicalPlace({ city: 'New York City', country: 'United States' });
		expect(nyc?.name).toBe('New York, NY');
		expect(nyc?.key).toBe(
			canonicalPlace({ city: 'new york', region: 'new york', country: 'us' })?.key
		);
		const dc = canonicalPlace({ city: 'Washington, D.C.', country: 'United States' });
		expect(dc?.name).toBe('Washington, DC');
		expect(dc?.key).toBe(
			canonicalPlace({ city: 'Washington', region: 'D.C.', country: 'US' })?.key
		);
	});

	it('returns a state or a country when that is all a source gives', () => {
		expect(canonicalPlace({ region: 'colorado', country: 'us' })).toMatchObject({
			name: 'Colorado',
			key: 'place:us:co:',
			level: 'region'
		});
		expect(canonicalPlace({ country: 'United States' })).toMatchObject({
			name: 'United States',
			key: 'place:us::',
			level: 'country'
		});
	});

	it('refuses a town with nothing to say which country it is in', () => {
		expect(canonicalPlace({ city: 'Montgomery' })).toBeNull();
		expect(canonicalPlace({ city: 'Springfield', region: 'Somewhere' })).toBeNull();
	});
});

describe('parsePlaceName', () => {
	it('reads the place names already saved in a graph', () => {
		expect(parsePlaceName('Annapolis, MD')?.key).toBe('place:us:md:annapolis');
		expect(parsePlaceName('Annapolis, Maryland')?.key).toBe('place:us:md:annapolis');
		expect(parsePlaceName('Washington, District of Columbia, United States')?.name).toBe(
			'Washington, DC'
		);
		expect(parsePlaceName('Cody, Wyoming')?.key).toBe('place:us:wy:cody');
		expect(parsePlaceName('Colorado')?.key).toBe('place:us:co:');
		expect(parsePlaceName('United States')?.key).toBe('place:us::');
		expect(parsePlaceName('Maryland, United States')?.key).toBe('place:us:md:');
		expect(parsePlaceName('Paris, France')?.key).toBe('place:fr::paris');
	});

	it('leaves alone what is not a town, state or country', () => {
		expect(parsePlaceName('Montgomery')).toBeNull();
		expect(parsePlaceName('Flint')).toBeNull();
		expect(parsePlaceName('8258 Veterans Hwy')).toBeNull();
		expect(parsePlaceName('Glen Burnie, MD 21061')).toBeNull();
		// A two-letter word alone is not read as a state or country code.
		expect(parsePlaceName('IN')).toBeNull();
	});
});

describe('codes and roll-up', () => {
	it('reads countries by code, name or common short form', () => {
		expect(countryCode('us')).toBe('US');
		expect(countryCode('USA')).toBe('US');
		expect(countryCode('United Kingdom')).toBe('GB');
		expect(countryCode('uk')).toBe('GB');
		expect(countryCode('germany')).toBe('DE');
		expect(countryCode('Atlantis')).toBeNull();
	});

	it('reads states by code, register code or name', () => {
		expect(regionCode('VA', 'US')).toBe('VA');
		expect(regionCode('US-VA', 'US')).toBe('VA');
		expect(regionCode('virginia', 'US')).toBe('VA');
		expect(regionCode('Bavaria', 'DE')).toBeNull();
	});

	it('names the place a key sits inside', () => {
		expect(parentPlaceKey('place:us:md:annapolis')).toBe('place:us:md:');
		expect(parentPlaceKey('place:us:md:')).toBe('place:us::');
		expect(parentPlaceKey('place:us::')).toBeNull();
		expect(parentPlaceKey('place:gb::london')).toBe('place:gb::');
	});
});
