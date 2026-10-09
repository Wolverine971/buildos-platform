// packages/shared-agent-ops/src/task-entities/task-entities.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildTaskEntityCards,
	buildTaskEntityChips,
	detectTaskTextEntities,
	looksLikeFileName,
	normalizeExtractedTaskEntities,
	normalizePhone,
	pickKeyTaskEntityChips,
	planTaskEntityMerge,
	quoteInText,
	type TaskEntityRecord
} from './task-entities';

// Shapes of real tasks, with dummy numbers and emails.
const CINDYS = `Walk in: Cindy's Hot Shots, ask for John M.
**Where:** Cindy's Hot Shots, 115-C Holsum Way, Glen Burnie. Go to Cindy's, not 201 Holsum Way, where JW's Google pin sits. Open Tue 10–8 (checked Oct 5).
**Directions:** https://www.google.com/maps/dir/?api=1&destination=115-C%20Holsum%20Way
**Who:** John M., owner of JW Firearms Training. His cell is printed on his course pages (443-555-0183); use whatever number he gives you.`;

const TRUE_NORTH = `Call True North Roofing: ask for Bruce P. or Anthony D. (443-555-0164)
Phone: 443-555-0164 · info@tnrmd.example.com
Ask for 20 minutes at the Millersville office (around 3:00 today fits the route), or Zoom if they're on job sites.
Voicemail: your name, Glen Burnie, the idea, 410-555-0152, try again Thursday.`;

function row(partial: Partial<TaskEntityRecord> & Pick<TaskEntityRecord, 'kind' | 'natural_key'>) {
	return {
		id: partial.id ?? `${partial.kind}:${partial.natural_key}`,
		task_id: 't1',
		project_id: 'p1',
		value: partial.natural_key,
		display: partial.natural_key,
		role: 'primary',
		about: null,
		quote: null,
		confidence: 'medium',
		source: 'llm',
		status: 'suggested',
		in_text: true,
		position: 0,
		data: {},
		source_hash: null,
		extractor_version: 1,
		status_changed_at: null,
		created_at: '',
		updated_at: '',
		...partial
	} as TaskEntityRecord;
}

describe('detectTaskTextEntities', () => {
	it('finds the phone, email and links in a field-sales task, once each', () => {
		const found = detectTaskTextEntities(TRUE_NORTH);
		expect(found.map((entity) => [entity.kind, entity.value])).toEqual([
			['phone', '+14435550164'],
			['email', 'info@tnrmd.example.com'],
			['phone', '+14105550152']
		]);
	});

	it('reads a maps URL as one link and does not mine its digits for phone numbers', () => {
		const found = detectTaskTextEntities(CINDYS);
		expect(found.map((entity) => entity.kind)).toEqual(['link', 'phone']);
		expect(found[0].display).toBe('google.com/maps/dir');
		expect(found[1].display).toBe('443-555-0183');
	});

	it('marks meeting links and keeps bare domains, without echoing an email domain', () => {
		const found = detectTaskTextEntities(
			'Meeting Thu 10:00: https://zoom.us/j/5550123456?pwd=x. RFI on sam.gov, questions to pat@chesapeaketax.com'
		);
		expect(found).toEqual([
			expect.objectContaining({ kind: 'meeting_link', display: 'Zoom' }),
			expect.objectContaining({
				kind: 'link',
				value: 'https://sam.gov/',
				display: 'sam.gov'
			}),
			expect.objectContaining({ kind: 'email', value: 'pat@chesapeaketax.com' })
		]);
	});

	it('ignores dates and reference numbers that only look numeric', () => {
		expect(
			detectTaskTextEntities('Due 2026-10-12, RFI 2027-NLS-0075, $159,000–$263,000')
		).toEqual([]);
	});
});

describe('normalizePhone', () => {
	it('canonicalizes North American and international numbers', () => {
		expect(normalizePhone('(443) 555-2190')).toBe('+14435552190');
		expect(normalizePhone('1-410-555-0144')).toBe('+14105550144');
		expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958');
		expect(normalizePhone('555-0144')).toBeNull();
	});
});

describe('normalizeExtractedTaskEntities', () => {
	it('keeps checked entities, drops invented ones, and marks the owner', () => {
		const { entities, dropped } = normalizeExtractedTaskEntities(
			{
				entities: [
					{
						kind: 'person',
						value: 'Bruce P.',
						display: 'Bruce P.',
						quote: 'Bruce P.',
						role: 'primary',
						about: 'True North Roofing'
					},
					{
						kind: 'phone',
						value: '443 555 0164',
						quote: '443-555-0164',
						role: 'primary',
						about: 'True North Roofing'
					},
					{
						kind: 'phone',
						value: '+14105550152',
						quote: '410-555-0152',
						role: 'primary'
					},
					{
						kind: 'time',
						value: '2026-10-06T15:00:00-04:00',
						display: 'Tue 3:00 PM',
						quote: 'around 3:00 today',
						role: 'meeting',
						confidence: 'low'
					},
					{
						kind: 'person',
						value: 'Laura P.',
						quote: 'Laura P. decides',
						role: 'secondary'
					},
					{
						kind: 'time',
						value: 'next Thursday',
						quote: 'try again Thursday',
						role: 'follow_up'
					},
					{ kind: 'mystery', value: 'x', quote: 'Glen Burnie' }
				]
			},
			TRUE_NORTH,
			{ owner: { phones: ['410-555-0152'], emails: ['dj@example.com'] } }
		);
		expect(entities.map((entity) => [entity.kind, entity.value, entity.role])).toEqual([
			['person', 'Bruce P.', 'primary'],
			['phone', '+14435550164', 'primary'],
			['phone', '+14105550152', 'owner_self'],
			['time', '2026-10-06T15:00:00-04:00', 'meeting']
		]);
		expect(entities[1].display).toBe('443-555-0164');
		expect(entities.map((entity) => entity.position)).toEqual([0, 1, 2, 3]);
		expect(dropped).toEqual([
			'person: quote not in the text',
			'time: value is not an ISO date or date-time',
			'unknown kind mystery'
		]);
	});

	it('adds fixed-format values the model left out, as secondary', () => {
		const { entities } = normalizeExtractedTaskEntities(
			{ entities: [{ kind: 'person', value: 'Bruce P.', quote: 'Bruce P.' }] },
			TRUE_NORTH,
			{ detected: detectTaskTextEntities(TRUE_NORTH), owner: { phones: ['+14105550152'] } }
		);
		expect(entities.map((entity) => [entity.kind, entity.role])).toEqual([
			['person', 'primary'],
			['phone', 'secondary'],
			['email', 'secondary'],
			['phone', 'owner_self']
		]);
		expect(entities[1].data).toEqual({ detector_only: true });
	});

	it('drops a phone, email or link the text never wrote, but keeps one quoted in a sentence', () => {
		const text =
			'Tandem CPA asked me to use the contact form on their website. Email india@tandemcpa.example to confirm.';
		const { entities, dropped } = normalizeExtractedTaskEntities(
			{
				entities: [
					{
						kind: 'link',
						value: 'https://tandemcpa.example/contact',
						display: 'Contact form',
						quote: 'contact form on their website'
					},
					{
						kind: 'email',
						value: 'india@tandemcpa.example',
						quote: 'Email india@tandemcpa.example to confirm'
					},
					{ kind: 'phone', value: '+14105550199', quote: 'Tandem CPA' },
					{ kind: 'email', value: 'info@tandemcpa.example', quote: 'Tandem CPA' }
				]
			},
			text
		);
		expect(entities.map((entity) => [entity.kind, entity.value])).toEqual([
			['email', 'india@tandemcpa.example']
		]);
		expect(dropped).toEqual([
			'link: address not in the text',
			'phone: number not in the text',
			'email: address not in the text'
		]);
	});

	it('reclassifies a video link the model called a plain link', () => {
		const text = 'Join here: https://meet.google.com/abc-defg-hij';
		const { entities } = normalizeExtractedTaskEntities(
			{
				entities: [
					{
						kind: 'link',
						value: 'https://meet.google.com/abc-defg-hij',
						quote: 'https://meet.google.com/abc-defg-hij'
					}
				]
			},
			text
		);
		expect(entities[0]).toMatchObject({
			kind: 'meeting_link',
			display: 'Google Meet',
			data: { provider: 'Google Meet' }
		});
	});
});

describe('quoteInText', () => {
	it('ignores case, spacing and markdown emphasis', () => {
		expect(quoteInText('**Where:** Cindy’s  Hot Shots', "where: cindy's hot shots")).toBe(true);
		expect(quoteInText('Call Pat', 'Call Laura')).toBe(false);
	});
});

describe('planTaskEntityMerge', () => {
	const V2 = `Call True North Roofing: Bruce P. called back and wants the Zoom.
Meeting Thu 10:00 AM: https://zoom.us/j/5550123456
Bruce's cell 443-555-0177. Ask for Anthony D. too.`;

	it('keeps confirmed rows, holds dismissed ones back, and replaces machine suggestions', () => {
		const existing = [
			row({
				id: 'bruce',
				kind: 'person',
				natural_key: 'bruce p.',
				status: 'confirmed',
				quote: 'Bruce P.'
			}),
			row({
				id: 'anthony',
				kind: 'person',
				natural_key: 'anthony d.',
				status: 'dismissed',
				quote: 'Anthony D.'
			}),
			row({
				id: 'office',
				kind: 'phone',
				natural_key: '+14435550164',
				quote: '443-555-0164'
			}),
			row({
				id: 'agent-note',
				kind: 'reference',
				natural_key: 'job-7',
				source: 'agent',
				quote: 'JOB-7'
			})
		];
		const { entities } = normalizeExtractedTaskEntities(
			{
				entities: [
					{ kind: 'person', value: 'Bruce P.', quote: 'Bruce P.' },
					{
						kind: 'meeting_link',
						value: 'https://zoom.us/j/5550123456',
						quote: 'https://zoom.us/j/5550123456'
					},
					{
						kind: 'phone',
						value: '443-555-0177',
						quote: '443-555-0177',
						about: 'Bruce P.'
					},
					{ kind: 'person', value: 'Anthony D.', quote: 'Anthony D.' }
				]
			},
			V2
		);
		const plan = planTaskEntityMerge(existing, entities, V2);
		expect(plan.insert.map((entity) => entity.kind)).toEqual(['meeting_link', 'phone']);
		expect(plan.update).toEqual([
			{ id: 'bruce', patch: { quote: 'Bruce P.', position: 0 } },
			{ id: 'agent-note', patch: { in_text: false } }
		]);
		expect(plan.remove).toEqual(['office']);
	});

	it('flags a confirmed row whose words left the text instead of deleting it', () => {
		const plan = planTaskEntityMerge(
			[
				row({
					id: 'pat',
					kind: 'person',
					natural_key: 'pat s.',
					status: 'confirmed',
					quote: 'Pat S.'
				})
			],
			[],
			'Call the Catonsville office instead.'
		);
		expect(plan).toEqual({
			insert: [],
			update: [{ id: 'pat', patch: { in_text: false } }],
			remove: []
		});
	});
});

describe('buildTaskEntityChips', () => {
	it('orders chips Join, When, Map, Who, Call and leaves out hidden rows', () => {
		const chips = buildTaskEntityChips({
			entities: [
				row({
					id: 'a',
					kind: 'phone',
					natural_key: '+14435550177',
					value: '+14435550177',
					display: '443-555-0177'
				}),
				row({ id: 'b', kind: 'person', natural_key: 'bruce p.', display: 'Bruce P.' }),
				row({
					id: 'c',
					kind: 'place',
					natural_key: '201 holsum way',
					value: '201 Holsum Way',
					display: '201 Holsum Way',
					role: 'avoid'
				}),
				row({
					id: 'd',
					kind: 'meeting_link',
					natural_key: 'zoom.us/j/1',
					value: 'https://zoom.us/j/1',
					display: 'Zoom'
				}),
				row({ id: 'e', kind: 'phone', natural_key: '+14105550152', role: 'owner_self' }),
				row({
					id: 'f',
					kind: 'place',
					natural_key: '115-c holsum way',
					value: '115-C Holsum Way, Glen Burnie',
					display: '115-C Holsum Way'
				}),
				row({ id: 'ref', kind: 'reference', natural_key: 'rfi 2027', display: 'RFI 2027' }),
				row({ id: 'g', kind: 'person', natural_key: 'anthony d.', status: 'dismissed' }),
				row({
					id: 'h',
					kind: 'time',
					natural_key: 't|meeting',
					value: '2026-10-08T10:00:00-04:00',
					display: 'Thu 10:00 AM',
					role: 'meeting'
				})
			]
		});
		expect(chips.map((chip) => `${chip.label} ${chip.display}`)).toEqual([
			'Join Zoom',
			'When Thu 10:00 AM',
			'Map 115-C Holsum Way',
			'Who Bruce P.',
			'Call 443-555-0177',
			'Not this 201 Holsum Way'
		]);
		expect(chips[2].href).toBe(
			'https://www.google.com/maps/search/?api=1&query=115-C%20Holsum%20Way%2C%20Glen%20Burnie'
		);
		expect(chips[4]).toMatchObject({
			href: 'tel:+14435550177',
			tone: 'detected',
			confirmable: false
		});
		expect(chips[3]).toMatchObject({ tone: 'understood', confirmable: true });
		expect(chips[5]).toMatchObject({ tone: 'avoid', href: null });
	});

	it('adds fixed formats the stored rows do not cover yet, and never a dismissed one', () => {
		const chips = buildTaskEntityChips({
			entities: [
				row({
					id: 'gone',
					kind: 'phone',
					natural_key: '+14435550164',
					status: 'dismissed'
				}),
				row({ id: 'bruce', kind: 'person', natural_key: 'bruce p.', display: 'Bruce P.' })
			],
			detected: detectTaskTextEntities(TRUE_NORTH)
		});
		expect(chips.map((chip) => [chip.label, chip.display, chip.id])).toEqual([
			['Who', 'Bruce P.', 'bruce'],
			['Call', '410-555-0152', null],
			['Email', 'info@tnrmd.example.com', null]
		]);
	});

	it('falls back to detected fixed formats before a model has read the task', () => {
		const chips = buildTaskEntityChips({
			entities: [],
			detected: detectTaskTextEntities(CINDYS)
		});
		expect(chips.map((chip) => [chip.label, chip.id])).toEqual([
			['Call', null],
			['Link', null]
		]);
	});
});

describe('key details', () => {
	const DAUNTLESS = `Call Dauntless Dogs: ask for Casey Fenske (410-555-0161)
Front desk: Angela. Email Contact@DauntlessDogs.example.com if no answer.
Join: https://zoom.us/j/123456789`;

	it('keeps the model’s key flag on at most three entities, never on avoid or owner rows', () => {
		const { entities } = normalizeExtractedTaskEntities(
			[
				{
					kind: 'phone',
					value: '+14105550161',
					quote: '410-555-0161',
					role: 'primary',
					key: true
				},
				{ kind: 'person', value: 'Casey Fenske', quote: 'Casey Fenske', key: true },
				{ kind: 'org', value: 'Dauntless Dogs', quote: 'Dauntless Dogs', key: true },
				{ kind: 'person', value: 'Angela', quote: 'Angela', key: true },
				{
					kind: 'email',
					value: 'contact@dauntlessdogs.example.com',
					quote: 'Contact@DauntlessDogs.example.com',
					role: 'avoid',
					key: true
				}
			],
			DAUNTLESS
		);
		expect(
			entities.filter((entity) => entity.data.key).map((entity) => entity.display)
		).toEqual(['410-555-0161', 'Casey Fenske', 'Dauntless Dogs']);
	});

	it('shows only flagged details and meeting links above the text', () => {
		const chips = pickKeyTaskEntityChips({
			entities: [
				row({ kind: 'person', natural_key: 'casey fenske', display: 'Casey Fenske' }),
				row({
					kind: 'phone',
					natural_key: '+14105550161',
					display: '410-555-0161',
					data: { key: true }
				}),
				row({ kind: 'place', natural_key: 'glen burnie', display: 'Glen Burnie' })
			],
			detected: detectTaskTextEntities(DAUNTLESS)
		});
		expect(chips.map((chip) => chip.label)).toEqual(['Join', 'Call']);
	});

	it('leaves out key times that have already passed', () => {
		const now = new Date(2026, 9, 8, 9, 0);
		const chips = pickKeyTaskEntityChips({
			now,
			entities: [
				row({
					kind: 'time',
					natural_key: 'past',
					value: '2026-10-06T12:00:00-04:00',
					display: 'Tue Oct 6, 12:00 PM',
					role: 'meeting',
					data: { key: true }
				}),
				row({
					kind: 'time',
					natural_key: 'today',
					value: '2026-10-08',
					display: 'Thu Oct 8',
					role: 'deadline',
					data: { key: true }
				}),
				row({
					kind: 'time',
					natural_key: 'yesterday',
					value: '2026-10-07',
					display: 'Wed Oct 7',
					role: 'deadline',
					data: { key: true }
				})
			]
		});
		expect(chips.map((chip) => chip.display)).toEqual(['Thu Oct 8']);
	});
});

describe('buildTaskEntityCards', () => {
	const rows = [
		row({ kind: 'org', natural_key: 'dauntless dogs', display: 'Dauntless Dogs' }),
		row({
			kind: 'person',
			natural_key: 'casey fenske',
			display: 'Casey Fenske',
			about: 'Dauntless Dogs'
		}),
		row({ kind: 'person', natural_key: 'angela', display: 'Angela', about: 'Dauntless Dogs' }),
		row({
			kind: 'phone',
			natural_key: '+14105550161',
			value: '+14105550161',
			display: '410-555-0161',
			about: 'Casey Fenske'
		}),
		row({
			kind: 'email',
			natural_key: 'contact@dauntlessdogs.example.com',
			display: 'contact@dauntlessdogs.example.com',
			about: 'dauntless  dogs'
		}),
		row({
			kind: 'place',
			natural_key: '7609 energy pkwy curtis bay',
			value: '7609 Energy Pkwy, Curtis Bay',
			display: '7609 Energy Pkwy',
			about: 'Dauntless Dogs'
		}),
		row({
			kind: 'phone',
			natural_key: '+14105550152',
			display: '410-555-0152',
			about: 'Casey Fenske',
			role: 'owner_self'
		}),
		row({
			kind: 'person',
			natural_key: 'rod',
			display: 'Rod',
			about: 'Dauntless Dogs',
			status: 'dismissed'
		})
	];

	it('links a person to their organization, number and colleagues', () => {
		const cards = buildTaskEntityCards(rows);
		const casey = cards.find((card) => card.name === 'Casey Fenske');
		expect(casey?.partOf).toEqual({ id: 'org:dauntless dogs', name: 'Dauntless Dogs' });
		expect(casey?.contacts.map((contact) => [contact.kind, contact.href])).toEqual([
			['phone', 'tel:+14105550161']
		]);
		expect(casey?.people.map((person) => person.name)).toEqual(['Angela']);
	});

	it('gives an organization its people (with their number), email and address', () => {
		const org = buildTaskEntityCards(rows).find((card) => card.kind === 'org');
		expect(org?.people).toEqual([
			{
				id: 'person:casey fenske',
				name: 'Casey Fenske',
				contact: expect.objectContaining({ display: '410-555-0161' })
			},
			{ id: 'person:angela', name: 'Angela', contact: null }
		]);
		expect(org?.contacts.map((contact) => contact.kind)).toEqual(['email', 'place']);
	});

	it('leaves out dismissed entities and the owner’s own details', () => {
		const cards = buildTaskEntityCards(rows);
		expect(cards.some((card) => card.name === 'Rod')).toBe(false);
		const casey = cards.find((card) => card.name === 'Casey Fenske');
		expect(casey?.contacts.some((contact) => contact.display === '410-555-0152')).toBe(false);
	});

	it('looks for the name first, then the value, then the quote', () => {
		const place = buildTaskEntityCards([
			row({
				kind: 'place',
				natural_key: 'x',
				value: '7609 Energy Pkwy, Curtis Bay',
				display: '7609 Energy Pkwy',
				quote: '7609 (or 7601) Energy Pkwy, Suite 1001, Curtis Bay'
			})
		])[0];
		expect(place.mentions).toEqual([
			'7609 Energy Pkwy',
			'7609 Energy Pkwy, Curtis Bay',
			'7609 (or 7601) Energy Pkwy, Suite 1001, Curtis Bay'
		]);
	});
});

describe('file names are not links', () => {
	it('tells a file name from a web address', () => {
		expect(looksLikeFileName('README.md')).toBe(true);
		expect(looksLikeFileName('notes/email-griffin.md')).toBe(true);
		expect(looksLikeFileName('robots.txt')).toBe(true);
		expect(looksLikeFileName('linktr.ee/krystalballuva')).toBe(false);
		expect(looksLikeFileName('sam.gov')).toBe(false);
		expect(looksLikeFileName('https://github.com/x/README.md')).toBe(false);
	});

	it('drops a file name the model sent as a link, and hides one stored earlier', () => {
		const text = 'Draft the DM from email-griffin.md, then check robots.txt on sam.gov';
		const { entities, dropped } = normalizeExtractedTaskEntities(
			[
				{ kind: 'link', value: 'email-griffin.md', quote: 'email-griffin.md' },
				{ kind: 'link', value: 'sam.gov', quote: 'sam.gov' }
			],
			text
		);
		expect(entities.map((entity) => entity.display)).toEqual(['sam.gov']);
		expect(dropped).toContain('link: a file name, not a web address');

		const stored = row({
			kind: 'link',
			natural_key: 'readme.md',
			value: 'https://readme.md/',
			display: 'README.md',
			quote: 'README.md',
			data: { key: true }
		});
		expect(buildTaskEntityChips({ entities: [stored] })).toEqual([]);
	});
});
