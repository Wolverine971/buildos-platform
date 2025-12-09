<!-- chat-gpt-copy-plan.md -->

You’re thinking about this exactly like a founder should: treat your copy as _data_ and build a “Messaging OS” around it.

I’ll do two things for you:

1. Give you a concrete plan + structure for your **copy phonebook** (how to grab and index everything).
2. Give you a **copy analysis + refactor framework** so you can align messaging and later pivot it by persona/use case without chaos.

---

## 1. Design the “Copy Phonebook” data model

Think of each snippet of text as a record with metadata, not just words in a file.

Set this up in Google Sheets, Airtable, Notion, or even Supabase as a table:

**Columns to include:**

- `page_url` – e.g. `https://build-os.com/`
- `page_type` – `home`, `pricing`, `beta`, `blog_post`, `docs`, `help`, `about`, `investors`, `legal`, etc.
- `section_id` – short handle you give it:
    - `hero`, `value-pillars`, `personas`, `features`, `faq`, `footer`, `nav`, `blog-body`, `cta-banner`, etc.

- `element_type` – more granular:
    - `title_tag`
    - `meta_description`
    - `og_title`
    - `og_description`
    - `h1`, `h2`, `h3`
    - `body_paragraph`
    - `bullet`
    - `cta_primary_button`
    - `cta_secondary_button`
    - `form_heading`
    - `testimonial_quote`
    - `tagline`

- `copy_text` – the actual text.
- `intent` – _what is this trying to do?_
    - `explain`, `differentiate`, `social_proof`, `handle_objection`, `inspire`, `educate`, `convert`, etc.

- `persona` – who it’s primarily talking to:
    - For you, things like `ADHD founder`, `overwhelmed professional`, `student/creator`, `investor`, `power-user`, etc. (Your home page already calls out “ADHD minds,” “Overwhelmed professionals,” “Students & creators.” ([BuildOS][1]))

- `funnel_stage` – `TOFU`, `MOFU`, `BOFU`, or `onboarding`, `retention`.
- `value_pillar` – your 3–5 main value props (you can refine later), e.g.:
    - `brain_dump_to_structure`
    - `calendar-integrated_execution`
    - `ADHD-friendly_workflow`
    - `context_over_chaos`

- `feature_anchor` – if it’s tied to something specific (`daily_brief`, `brain_dump`, `calendar_sync`, `goals_alignment`, etc.).
- `tone` – subjective tag: `empathetic`, `no_shame`, `direct`, `technical`, `playful`, etc.
- `priority` – how important the snippet is for your brand (e.g. `core`, `supporting`, `low-stakes`).
- `notes` – anything else: issues, ideas, “feels off”, “too generic”, etc.

That’s your “phonebook” schema.

---

## 2. Plan for grabbing all the copy

You already have a sitemap (nice), so we can treat it as the source of truth for URLs.

### Step 1 – Create the URL list

From your sitemap, put all URLs into a column in a sheet or into an array in code:

- `/`
- `/beta`
- `/pricing`
- `/about`
- `/road-map`
- all `/blogs/...` posts
- `/docs`, `/help`, `/feedback`, `/investors`, `/contact`, `/privacy`, `/terms`, etc.

### Step 2 – Decide extraction approach

You’ve got three realistic options:

#### Option A: Use an SEO crawler (fastest non-dev way)

Use something like **Screaming Frog SEO Spider** (free up to 500 URLs):

1. Plug in `https://build-os.com/`.
2. Let it crawl.
3. Export:
    - Page titles
    - Meta descriptions
    - H1s, H2s
    - Response codes, canonical URLs, etc.

4. You’ll still need manual passes for body copy and CTAs, but this gets you all the SEO/meta stuff almost automatically.

#### Option B: Write a small scraping script (more control; very you)

Because you’re on SvelteKit and comfortable coding, I’d suggest this as your main path.

**Conceptual algorithm:**

For each URL:

1. `fetch` HTML.
2. Parse with an HTML parser (Cheerio in Node, BeautifulSoup in Python).
3. Extract:
    - `<title>`
    - `<meta name="description">`
    - `<meta property="og:title">`, `<meta property="og:description">`
    - `<h1>`, `<h2>`, `<h3>`
    - All `<p>` inside `<main>` or `<article>`
    - CTA-like elements: `<button>`, `<a>` with certain classes, `role="button"`, etc.

4. For each piece, push a row into your “phonebook” structure with the right `element_type`.

**Example: Node + Cheerio pseudo-code**

```js
import fetch from 'node-fetch';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'json2csv';
import cheerio from 'cheerio';

const urls = [
	'https://build-os.com/',
	'https://build-os.com/pricing'
	// ...paste all sitemap URLs here
];

const rows = [];

async function scrapeUrl(url) {
	const res = await fetch(url);
	const html = await res.text();
	const $ = cheerio.load(html);

	const page_type = inferPageType(url); // write a small helper

	// 1) Title
	const title = $('title').text().trim();
	if (title) {
		rows.push({
			page_url: url,
			page_type,
			section_id: 'head',
			element_type: 'title_tag',
			copy_text: title
		});
	}

	// 2) Meta description
	const metaDesc = $('meta[name="description"]').attr('content') || '';
	if (metaDesc) {
		rows.push({
			page_url: url,
			page_type,
			section_id: 'head',
			element_type: 'meta_description',
			copy_text: metaDesc
		});
	}

	// 3) OG title/description
	const ogTitle = $('meta[property="og:title"]').attr('content') || '';
	if (ogTitle) {
		rows.push({
			page_url: url,
			page_type,
			section_id: 'head',
			element_type: 'og_title',
			copy_text: ogTitle
		});
	}

	const ogDesc = $('meta[property="og:description"]').attr('content') || '';
	if (ogDesc) {
		rows.push({
			page_url: url,
			page_type,
			section_id: 'head',
			element_type: 'og_description',
			copy_text: ogDesc
		});
	}

	// 4) H1/H2/H3
	$('h1, h2, h3').each((_, el) => {
		const tag = $(el).get(0).tagName.toLowerCase();
		const text = $(el).text().trim();
		if (!text) return;
		rows.push({
			page_url: url,
			page_type,
			section_id: 'content',
			element_type: tag,
			copy_text: text
		});
	});

	// 5) Body paragraphs inside <main>
	$('main p').each((_, el) => {
		const text = $(el).text().trim();
		if (!text) return;
		rows.push({
			page_url: url,
			page_type,
			section_id: 'body',
			element_type: 'body_paragraph',
			copy_text: text
		});
	});

	// 6) CTA-like buttons / links
	$('a, button').each((_, el) => {
		const text = $(el).text().trim();
		if (!text) return;
		const href = $(el).attr('href') || '';
		const role = $(el).attr('role') || '';
		const type = role === 'button' || $(el).is('button') ? 'cta_button' : 'link';

		rows.push({
			page_url: url,
			page_type,
			section_id: 'cta',
			element_type: type,
			copy_text: text,
			href
		});
	});
}

function inferPageType(url) {
	if (url.endsWith('/')) return 'home';
	if (url.includes('/pricing')) return 'pricing';
	if (url.includes('/blogs/')) return 'blog_post';
	if (url.includes('/blogs')) return 'blog_index';
	if (url.includes('/help')) return 'help';
	if (url.includes('/docs')) return 'docs';
	if (url.includes('/about')) return 'about';
	if (url.includes('/investors')) return 'investors';
	if (url.includes('/beta')) return 'beta';
	if (url.includes('/privacy') || url.includes('/terms')) return 'legal';
	return 'other';
}

(async () => {
	for (const url of urls) {
		console.log('Scraping', url);
		await scrapeUrl(url);
	}

	const csv = parse(rows);
	fs.writeFileSync(path.join(process.cwd(), 'buildos-copy-phonebook.csv'), csv);
	console.log('Done. Rows:', rows.length);
})();
```

Once you’ve run that, import `buildos-copy-phonebook.csv` into your preferred tool and add the higher-level columns (`intent`, `persona`, `value_pillar`, etc.) as you analyze.

#### Option C: Manual pass (only if you want a super-curated first version)

You can also manually walk through each page and:

- Copy hero headings, subheads, CTAs, key body sections, FAQs, etc.
- Paste them row-by-row into the phonebook.

This is slower but forces you to _read_ every word — useful if your site is still small.

---

## 3. What to analyze in your copy (beyond “core value props”)

Here’s a structured checklist to run on your phonebook once it’s filled.

### A. Positioning & category language

- **Core promise** – Is there _one_ clear promise repeated across pages?
    - e.g. On your homepage: “Project organization built for the AI era” and “Your thoughts, organized. Your next step, clear.” ([BuildOS][1])

- **Category framing** – Are you a “project OS”, “AI assistant”, “second brain”, “calendar-first planner”, etc.? Is it consistent?
- **Who you are _for_** – e.g. “ADHD minds,” “overwhelmed professionals,” “students & creators.” Are those same personas echoed on pricing, docs, blog intros, etc.? ([BuildOS][1])

Questions:

- Would a stranger be able to describe what BuildOS is in one sentence that matches your intended pitch?
- Are you using the same category language across all pages, or jumping between metaphors?

### B. ICP & persona clarity

For each snippet, ask:

- Who is this talking to?
- What assumptions about them are baked into the language? (ADHD, founder, corporate worker, student, investor, etc.)
- Is that persona appropriate to the **page type**?
    - e.g. `/investors` vs `/help` vs `/pricing` should sound like they talk to different people.

Tag each row with `persona` and you’ll instantly see if:

- ADHD language is bleeding into investor pages (maybe good, maybe bad).
- Certain personas aren’t getting enough attention.

### C. Problem → Outcome → Mechanism chain

Every core bit of copy should ideally trace:

> **Problem** (chaos, scattered brain)
> → **Outcome** (clarity, shipped projects)
> → **Mechanism** (AI + brain dumps + calendar integration)

For each major section (hero, key value blocks, pricing blurbs, blog intros):

- Mark:
    - `problem_statement`
    - `desired_outcome`
    - `mechanism/explainer`

If a section is missing one, mark that as a gap.

### D. Differentiation vs alternatives

Check if you explicitly or implicitly differentiate from:

- **Notion, ClickUp, Asana, Motion, Sunsama, Akiflow, etc.**
- Generic “AI assistant” tools.

Questions:

- Where do you _explicitly_ say what you do differently?
- Is it consistent? (e.g. “build for ADHD brains,” “context-first,” “voice-first,” “daily briefs,” etc.)
- Do you repeat your key differentiators across Home, Pricing, and Beta pages, or do they shift?

### E. Feature → benefit mapping

For each feature-related snippet (pricing table, feature bullets, docs pages):

- Identify the **feature** and label the **benefit**.
    - e.g. `calendar integrations` → “AI finds perfect time slots in your calendar… Wake up to your personalized action plan.” ([BuildOS][1])

- If copy lists a feature with no explicit benefit, tag that as a “benefit-missing” row.

You can then systematically clean those up.

### F. Funnel stage & CTA coherence

For each page, decide its **job**:

- Home: clarify what BuildOS is + emotional hook + get a trial signup.
- Pricing: reduce friction + handle objections + social proof + “Start free”.
- Blog posts: top/mid-funnel education that should point to features.
- Docs/help: activation and retention (not raw acquisition).

Check:

- Does the **CTA** match the job? (e.g. does a blog post end with a relevant CTA to try a feature you just taught?)
- Are you accidentally pushing too hard/too soft for the stage?

Tag every CTA row with:

- `funnel_stage`
- `cta_goal` – `start_trial`, `join_beta`, `book_call`, `read_docs`, etc.

### G. Objection handling & risk reversal

Look for text that addresses:

- “Will this be too complex?”
- “What if I cancel?”
- “Will I lose my data?”
- “Is this worth $20/month?”

Your pricing page already has some of this in the FAQ (trial grace period, data export, cancel anytime). ([BuildOS][2])

Questions:

- Does the home page handle emotional objections (shame, previous failed systems)?
- Does pricing handle rational objections (risk, cost, trial)?
- Does any page handle social proof (“500+ scattered minds…”) consistently and credibly? ([BuildOS][1])

### H. Brand voice, emotion, and “vibes”

You’ve already got distinct tone notes like:

- “Your brain isn’t broken. Your tools are.” (empathetic, no-shame) ([BuildOS][1])
- “No complex setup. No maintenance guilt.”
- “From brain dump to organized projects in literally one minute.” ([BuildOS][1])

For each major section, quickly tag tone:

- `no_shame`, `coach`, `technical`, `salesy`, `inspirational`, `clinical`, etc.

Then ask:

- Is the voice consistent enough that someone could recognize it out of context?
- Are investor pages tonally aligned but slightly more formal?
- Do blog posts sound like the same person as the homepage?

### I. SEO & on-page structure

From an SEO perspective, check:

- One clear **H1** per page, aligned with main keyword.
- Title tags unique and within ~50–60 chars.
- Meta descriptions unique and compelling.
- Keyword alignment:
    - `project organization`, `AI project management`, `ADHD productivity`, `brain dump`, `action plan`, etc.

- Internal links from blog posts back to:
    - key features,
    - `/pricing`,
    - `/beta`,
    - `/help`/`/docs` for activation.

Your phonebook already has the raw material—just add a `primary_keyword` column per page and a `secondary_keywords` column if you want.

### J. Structure & readability

Quick stats to note (can be manual or with tools):

- Sentence length; any walls of text?
- Use of bullets vs paragraphs.
- Above-the-fold clarity:
    - In 3 seconds, do I know:
        - what BuildOS is,
        - who it’s for,
        - what I should do next?

You can tag problem sections as `low_scannability`.

---

## 4. Using this to update & flex your copy later

Once the phonebook is filled and tagged, you can turn this into a **messaging system** instead of a one-off audit.

### A. Define a canonical messaging spine

Create a single “Messaging Bible” doc (or table):

- **One-line category**: e.g. “AI-first project operating system for scattered minds.”
- **Elevator pitch (2–3 sentences).**
- **3–5 value pillars**:
    - e.g. `Chaos → Clarity`, `Brain dump → Project system`, `Calendar → Action`, `ADHD-friendly design`, `Context builds over time`.

- **Key proof points**:
    - numbers, testimonials, usage stats (even small ones).

- **Persona-specific one-liners**:
    - ADHD founder version
    - Overwhelmed professional version
    - Student/creator version
    - Investor version

Then, in your phonebook, tie every piece of copy back to one of those pillars / persona variants where possible.

### B. Build a persona × value-pillar matrix

Make a small grid:

- Rows: value pillars.
- Columns: personas (ADHD founder, overwhelmed pro, student/creator, investor…).
- Each cell: a **short version** of the pillar expressed in that persona’s language.

When you want to refocus the site on a different ICP, you’re not rewriting from scratch — you’re just:

- Swapping which persona columns you pull for each page.
- Making sure each page mostly sticks to 1–2 personas instead of 4 at once.

### C. Wire this into your codebase (optional but powerful)

Because you’re SvelteKit/Supabase:

- Create a `copy_snippets` table with keys like:
    - `slug` (e.g. `home.hero.heading`)
    - `variant` (e.g. `default`, `adhd_founder`, `investor`, `student_creator`)
    - `copy_text`

- Load the appropriate variant based on:
    - route (e.g. `/investors` -> `investor`),
    - query parameter, or
    - later: user persona selection.

Your “phonebook” then becomes both:

- the **inventory**,
- and a **builder artifact** for how your app pulls text.

### D. Review & iteration loop

Once a quarter (or when you pivot ICP):

1. Export phonebook.
2. Filter by:
    - `priority = core`
    - key pages: `/`, `/pricing`, `/beta`, `/investors`, top blog posts.

3. Re-check:
    - Are core value props the same?
    - Does persona focus match current strategy?

4. Update the canonical Messaging Bible.
5. Propagate edits through the phonebook → codebase.

---

If you want next, I can:

- Turn this into a **concrete Notion / Airtable template** structure.
- Or help you define your **value pillars + persona grid** using the copy you already have (we’d mine your homepage + pricing + a blog or two and codify it).

[1]: https://build-os.com/ 'BuildOS - Your Home Base for Scattered Minds | Brain Dump to Action'
[2]: https://build-os.com/pricing 'Pricing - BuildOS | AI-Powered Productivity Plans'
