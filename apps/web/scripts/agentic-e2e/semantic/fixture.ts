// apps/web/scripts/agentic-e2e/semantic/fixture.ts
//
// Tier-1 semantic-discovery eval fixture + labeled query battery
// (docs/architecture/semantic-discovery/README.md §Eval plan, tasker/71).
//
// "Driftline Supply Co." — a plausible small outdoor-gear e-commerce brand
// running its marketing inside BuildOS. The marketing landscape (positioning,
// segments, campaigns under a parent doc, tasks/goals/milestones) is laced
// with DECOYS (engineering, warehouse ops, vendor finance) that thematic
// marketing queries must NOT surface — and two queries run the other
// direction, where the ops entities are the hits and marketing must stay out.
//
// Vocabulary-mismatch cases (the class FTS provably fails, June 2026 eval):
//   - "Who we serve" never says marketing/audience/segment → q-audience.
//   - "target audience", "short-form video", "recovering lost sales",
//     "repeat purchases", "visual assets" never appear verbatim in their
//     expected-hit entities.
//
// Expectations are keyed "kind:title" (unique within the fixture); the runner
// resolves them to entity ids after seeding.

import type { ProjectSpec } from '@buildos/shared-agent-ops/ontology/onto';

export const FIXTURE_PROJECT_NAME = 'Driftline Supply Co.';

/** ISO timestamp `days` from now. */
function fromNow(days: number): string {
	const d = new Date();
	d.setDate(d.getDate() + days);
	return d.toISOString();
}

export function fixtureSpec(): ProjectSpec {
	return {
		project: {
			name: FIXTURE_PROJECT_NAME,
			type_key: 'project.business.company',
			state_key: 'active',
			description:
				'Small outdoor-gear brand selling packs and trail accessories direct-to-consumer, working toward the spring line launch.'
		},
		context_document: {
			title: 'Driftline Supply Co. — project context',
			body_markdown: `# Driftline Supply Co.

Small outdoor-gear brand. Two product lines (daypacks, trail accessories), one
storefront, one warehouse. Spring line launches next quarter; the push this
cycle is growing direct sales while keeping fulfillment tight.`
		},
		entities: [
			// ── marketing landscape ─────────────────────────────────────
			{
				temp_id: 'd-brand',
				kind: 'document',
				title: 'Brand positioning — Driftline',
				body_markdown: `# Brand positioning — Driftline

## The promise
Gear for the last mile — the stretch where cheap zippers fail and heavy packs
get left in the car. We sell the confidence to keep going, not the gear itself.

## How we talk
Field-notes voice: specific, unhurried, first-person plural. We show mud on the
product. We never say "premium" and we never shout discounts.

## Against the field
Big-box outdoor brands sell aspiration (summits, sponsored athletes). We sell
the Saturday two hours from the trailhead. That contrast is the whole wedge.`
			},
			{
				temp_id: 'd-segments',
				kind: 'document',
				title: 'Who we serve',
				body_markdown: `# Who we serve

## Weekend trail hikers
Day-hike regulars within an hour of a metro. Buy one pack every few years;
notice stitching and rain covers. They find us through trip-report blogs.

## Van-life travelers
Living out of a vehicle, gear works daily and fails fast. They care about
warranty turnaround more than price. Loud on YouTube and Instagram.

## Bike commuters
City riders who want a bag that works in an office. Waterproofing and laptop
sleeves decide the purchase. They compare obsessively before buying.`
			},
			{
				temp_id: 'd-campaigns',
				kind: 'document',
				title: 'Campaigns',
				body_markdown: `# Campaigns

Index of active and planned pushes. One campaign owner each, a calendar slot,
and a budget line. Children of this doc are the per-campaign briefs: the spring
trailhead launch, the welcome email series, and the creator seeding program.`
			},
			{
				temp_id: 'd-camp-spring',
				kind: 'document',
				title: 'Spring trailhead launch',
				body_markdown: `# Spring trailhead launch

The spring line (two daypack colorways, trail wallet) goes live the first
Saturday of April.

- **Email:** three-send sequence to the full list — tease, launch, last-call.
- **Instagram Reels:** six clips shot on the Patapsco loop, posted daily launch week.
- **Trailhead posters:** QR posters at eight regional trailheads (permits filed).
- **Homepage:** takeover hero with the mud-on-product shots from the photoshoot.`
			},
			{
				temp_id: 'd-camp-welcome',
				kind: 'document',
				title: 'Welcome email series',
				body_markdown: `# Welcome email series

Five-send drip for new subscribers: the Driftline story, a fit guide, a
field-repair guide, a customer story, then a first-order nudge. Separate
two-send branch for shoppers who leave items in the cart — soft reminder at
four hours, restock-risk note at three days. All sends plain-text style.`
			},
			{
				temp_id: 'd-camp-ugc',
				kind: 'document',
				title: 'Creator seeding program',
				body_markdown: `# Creator seeding program

Send the spring daypack to 20 small hiking and van-life creators (5k–50k
followers) with no strings — a card asking for honest field use, not a script.
Track posted Reels/TikToks in the sheet; repost the best three with credit.
Budget: 20 units + shipping. Success looks like 8+ organic clips in six weeks.`
			},
			{
				temp_id: 'g-revenue',
				kind: 'goal',
				name: 'Grow direct sales to 40% of revenue',
				description:
					'Shift mix away from wholesale by growing the email list and getting first-time buyers to a second order within 90 days.',
				target_date: fromNow(120),
				measurement_criteria: 'DTC share of monthly revenue ≥ 40% for two consecutive months.',
				priority: 'high'
			},
			{
				temp_id: 'ms-spring',
				kind: 'milestone',
				title: 'Spring launch live',
				due_at: fromNow(35),
				description: 'Product pages up, launch emails scheduled, Reels queued, posters placed.'
			},
			{
				temp_id: 'plan-q2',
				kind: 'plan',
				name: 'Q2 demand push',
				description:
					'Sequenced quarter: photoshoot → launch → creator seeding → welcome-series optimization. Owner: DJ.',
				start_date: fromNow(7),
				end_date: fromNow(98)
			},
			{
				temp_id: 't-newsletter',
				kind: 'task',
				title: 'Write April field-notes newsletter',
				state_key: 'todo',
				priority: 2,
				description:
					'Trail-report style: the Patapsco shoot day, one repair story, spring line teaser. Keep it under 600 words.'
			},
			{
				temp_id: 't-photoshoot',
				kind: 'task',
				title: 'Book product photoshoot for spring line',
				state_key: 'in_progress',
				priority: 1,
				description:
					'Golden-hour session on the Patapsco loop. Need the mud-on-product hero shots for the homepage takeover and the launch emails.'
			},
			{
				temp_id: 't-influencers',
				kind: 'task',
				title: 'Shortlist 20 hiking micro-creators',
				state_key: 'todo',
				priority: 2,
				description:
					'5k–50k followers, real trail content, engagement over follower count. Note shipping addresses for the seeding round.'
			},
			{
				temp_id: 't-cart',
				kind: 'task',
				title: 'Set up abandoned-cart email sequence',
				state_key: 'todo',
				priority: 2,
				description:
					'Two sends: soft reminder at four hours, restock-risk note at day three. Plain-text, no discount codes per brand rules.'
			},
			{
				temp_id: 'r-brand',
				kind: 'risk',
				title: 'Discount-heavy launch erodes brand',
				impact: 'medium',
				probability: 0.3,
				content:
					'Pressure to hit the launch number with promo codes would break the no-shouting-discounts positioning. If week one is soft, the answer is more creator clips, not coupons.'
			},
			{
				temp_id: 'req-voice',
				kind: 'requirement',
				text: 'Every customer-facing send and caption passes the field-notes voice check: specific, unhurried, no "premium", no discount shouting.'
			},
			// ── decoys: engineering / ops / finance ─────────────────────
			{
				temp_id: 't-checkout',
				kind: 'task',
				title: 'Fix checkout double-charge bug',
				state_key: 'in_progress',
				priority: 1,
				description:
					'Two customers charged twice when retrying a failed card. Reproduce with the payment-gateway sandbox, add an idempotency key to the charge call, refund the affected orders.'
			},
			{
				temp_id: 't-inventory',
				kind: 'task',
				title: 'Reconcile warehouse inventory sync',
				state_key: 'todo',
				priority: 2,
				description:
					'Storefront stock counts drift from the warehouse spreadsheet after every restock. Nightly sync job, alert on mismatch over 2 units.'
			},
			{
				temp_id: 'd-ops',
				kind: 'document',
				title: 'Fulfillment runbook',
				body_markdown: `# Fulfillment runbook

Pick/pack/ship SOP: orders batch at 10am and 3pm; padded mailers for
accessories, boxes for packs; regional carrier for in-state, postal for the
rest. Returns get inspected same-day and restocked or set aside for repair.
Escalate address problems before relabeling anything.`
			},
			{
				temp_id: 'd-vendor',
				kind: 'document',
				title: 'Vendor payment terms',
				body_markdown: `# Vendor payment terms

Buckle supplier: net-30, 2% early-pay discount inside 10 days. Webbing mill:
net-45, minimum order 500m. Freight forwarder invoices on delivery. Keep the
early-pay discount when cash allows — it beats the money-market yield.`
			},
			{
				temp_id: 'd-eng',
				kind: 'document',
				title: 'Storefront platform notes',
				body_markdown: `# Storefront platform notes

Headless storefront on the hosted commerce API; images through the CDN with
on-the-fly resizing. Deploys go out through CI on merge; roll back by
re-promoting the previous build. Payment webhooks land in the orders service —
check its logs first for any charge weirdness.`
			},
			{
				temp_id: 't-hiring',
				kind: 'task',
				title: 'Interview part-time warehouse associate',
				state_key: 'todo',
				description:
					'Two candidates for the pick/pack shift. Check weekend availability and lifting comfort; trial shift before offer.'
			},
			{
				temp_id: 'g-ship',
				kind: 'goal',
				name: 'Cut fulfillment time to 2 days',
				description:
					'Order-to-carrier handoff in two business days including restock weeks. Batch timing and bin layout are the levers.',
				target_date: fromNow(90),
				measurement_criteria: 'p90 order-to-ship ≤ 2 business days over a rolling month.'
			},
			{
				temp_id: 'ms-warehouse',
				kind: 'milestone',
				title: 'Warehouse move complete',
				due_at: fromNow(50),
				description: 'New unit racked, bins labeled, carrier pickup rescheduled to the new dock.'
			},
			{
				temp_id: 'r-supply',
				kind: 'risk',
				title: 'Buckle supplier lead times slip past 6 weeks',
				impact: 'high',
				probability: 0.4,
				content:
					'Current quote is 4 weeks; peak season historically doubles it. A slip past 6 weeks pushes spring-line restock into May. Mitigation: order the second batch before launch, qualify a backup supplier.'
			}
		],
		relationships: [
			{
				from: { temp_id: 'd-campaigns', kind: 'document' },
				to: { temp_id: 'd-camp-spring', kind: 'document' },
				intent: 'containment'
			},
			{
				from: { temp_id: 'd-campaigns', kind: 'document' },
				to: { temp_id: 'd-camp-welcome', kind: 'document' },
				intent: 'containment'
			},
			{
				from: { temp_id: 'd-campaigns', kind: 'document' },
				to: { temp_id: 'd-camp-ugc', kind: 'document' },
				intent: 'containment'
			},
			{
				from: { temp_id: 'plan-q2', kind: 'plan' },
				to: { temp_id: 't-photoshoot', kind: 'task' },
				intent: 'containment'
			},
			{
				from: { temp_id: 'plan-q2', kind: 'plan' },
				to: { temp_id: 't-influencers', kind: 'task' },
				intent: 'containment'
			},
			{
				from: { temp_id: 'plan-q2', kind: 'plan' },
				to: { temp_id: 't-cart', kind: 'task' },
				intent: 'containment'
			}
		]
	};
}

// ── labeled battery ────────────────────────────────────────────────────────
//
// Keys are "kind:title" (goal/plan use name; requirement uses its text).
// expected_hits: must appear in the top `limit` results.
// expected_misses: decoys that must NOT appear in the top max(5, |hits|)
// positions (the runner's violation window).

export type Tier1Query = {
	id: string;
	theme: string;
	limit?: number;
	expected_hits: string[];
	expected_misses: string[];
	notes?: string;
};

const REQ_VOICE =
	'requirement:Every customer-facing send and caption passes the field-notes voice check: specific, unhurried, no "premium", no discount shouting.';

export const TIER1_BATTERY: Tier1Query[] = [
	{
		id: 'q-marketing-broad',
		theme: 'everything related to marketing',
		limit: 15,
		expected_hits: [
			'document:Brand positioning — Driftline',
			'document:Who we serve',
			'document:Campaigns',
			'document:Spring trailhead launch',
			'document:Welcome email series',
			'document:Creator seeding program',
			'goal:Grow direct sales to 40% of revenue',
			'plan:Q2 demand push'
		],
		expected_misses: [
			'task:Fix checkout double-charge bug',
			'document:Fulfillment runbook',
			'document:Vendor payment terms',
			'task:Interview part-time warehouse associate'
		],
		notes: 'The headline discovery case: cross-entity, zero decoys.'
	},
	{
		id: 'q-positioning',
		theme: 'our brand positioning and how we talk about ourselves',
		expected_hits: ['document:Brand positioning — Driftline', REQ_VOICE],
		expected_misses: ['document:Fulfillment runbook', 'document:Vendor payment terms']
	},
	{
		id: 'q-audience',
		theme: 'target audience and customer segments',
		expected_hits: ['document:Who we serve'],
		expected_misses: ['task:Fix checkout double-charge bug', 'document:Vendor payment terms'],
		notes: 'Vocabulary mismatch: the doc never says audience/segment/marketing.'
	},
	{
		id: 'q-campaigns',
		theme: 'current campaigns and promotional pushes',
		expected_hits: [
			'document:Campaigns',
			'document:Spring trailhead launch',
			'document:Welcome email series',
			'document:Creator seeding program'
		],
		expected_misses: ['document:Fulfillment runbook']
	},
	{
		id: 'q-email',
		theme: 'email strategy',
		expected_hits: [
			'document:Welcome email series',
			'task:Set up abandoned-cart email sequence',
			'task:Write April field-notes newsletter'
		],
		expected_misses: ['task:Fix checkout double-charge bug']
	},
	{
		id: 'q-shortform',
		theme: 'short-form video and social content plans',
		expected_hits: ['document:Creator seeding program', 'document:Spring trailhead launch'],
		expected_misses: ['document:Storefront platform notes'],
		notes: 'Vocabulary mismatch: entities say Reels/TikToks, never "short-form video".'
	},
	{
		id: 'q-abandoned',
		theme: "recovering lost sales from shoppers who don't finish buying",
		expected_hits: [
			'task:Set up abandoned-cart email sequence',
			'document:Welcome email series'
		],
		// The checkout double-charge bug is deliberately NOT a decoy here:
		// customers charged twice / failing to complete checkout genuinely IS
		// lost-sales material, and surfacing it alongside cart recovery is good
		// judgment. It stays a decoy on the clearly-off-theme queries.
		expected_misses: ['task:Reconcile warehouse inventory sync'],
		notes: 'The abandoned-cart entities must outrank ops noise.'
	},
	{
		id: 'q-creators',
		theme: 'influencer and creator partnerships',
		expected_hits: ['document:Creator seeding program', 'task:Shortlist 20 hiking micro-creators'],
		expected_misses: ['task:Interview part-time warehouse associate'],
		notes: 'People-trap: hiring interview is the adjacent decoy.'
	},
	{
		id: 'q-launch',
		theme: 'spring product launch',
		expected_hits: [
			'document:Spring trailhead launch',
			'milestone:Spring launch live',
			'task:Book product photoshoot for spring line'
		],
		expected_misses: ['milestone:Warehouse move complete']
	},
	{
		id: 'q-dtc',
		theme: 'growing repeat purchases and direct revenue',
		expected_hits: ['goal:Grow direct sales to 40% of revenue'],
		expected_misses: ['goal:Cut fulfillment time to 2 days', 'document:Vendor payment terms'],
		notes: 'Vocabulary mismatch: goal says "second order within 90 days", not repeat purchases.'
	},
	{
		id: 'q-photo',
		theme: 'photography and visual assets for the product line',
		expected_hits: ['task:Book product photoshoot for spring line'],
		expected_misses: ['task:Reconcile warehouse inventory sync'],
		notes: 'Vocabulary mismatch: the task never says photography or visual assets.'
	},
	{
		id: 'q-content',
		theme: 'content we are planning to publish',
		expected_hits: [
			'task:Write April field-notes newsletter',
			'document:Creator seeding program'
		],
		expected_misses: ['document:Vendor payment terms']
	},
	{
		id: 'q-brand-risk',
		theme: 'risks to the brand from discounting',
		expected_hits: ['risk:Discount-heavy launch erodes brand'],
		expected_misses: ['risk:Buckle supplier lead times slip past 6 weeks']
	},
	{
		id: 'q-demand-plan',
		theme: 'plan for driving demand next quarter',
		expected_hits: ['plan:Q2 demand push', 'document:Campaigns'],
		expected_misses: ['document:Fulfillment runbook']
	},
	{
		id: 'q-voice',
		theme: 'rules for how our writing should sound',
		expected_hits: [REQ_VOICE, 'document:Brand positioning — Driftline'],
		expected_misses: ['document:Storefront platform notes']
	},
	// ── reverse direction: ops/eng queries where marketing must stay out ──
	{
		id: 'q-site-reliability',
		theme: 'website bugs and store reliability',
		expected_hits: ['task:Fix checkout double-charge bug', 'document:Storefront platform notes'],
		expected_misses: ['document:Brand positioning — Driftline', 'document:Campaigns']
	},
	{
		id: 'q-ops',
		theme: 'warehouse and shipping operations',
		expected_hits: [
			'document:Fulfillment runbook',
			'task:Reconcile warehouse inventory sync',
			'goal:Cut fulfillment time to 2 days',
			'milestone:Warehouse move complete'
		],
		expected_misses: ['document:Spring trailhead launch']
	},
	{
		id: 'q-suppliers',
		theme: 'supplier and vendor management',
		expected_hits: [
			'document:Vendor payment terms',
			'risk:Buckle supplier lead times slip past 6 weeks'
		],
		expected_misses: ['document:Creator seeding program']
	}
];
