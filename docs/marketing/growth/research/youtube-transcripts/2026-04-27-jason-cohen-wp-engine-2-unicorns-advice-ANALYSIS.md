---
title: "ANALYSIS — Jason Cohen on Stalled Growth (Lenny's Podcast)"
source_video: "https://www.youtube.com/watch?v=8xLquwfx6p0"
source_transcript: "2026-04-27-jason-cohen-wp-engine-2-unicorns-advice.md"
guest: Jason Cohen (WP Engine, Smart Bear, A Smart Bear blog, "Hidden Multipliers")
host: Lenny Rachitsky
duration: "01:46:04"
upload_date: 2026-01-25
analyzed_date: 2026-04-27
tags:
  - growth
  - retention
  - pricing
  - positioning
  - nrr
  - marketing-channels
  - saas
  - buildos-relevant
---

# Jason Cohen — Why Your Product Stopped Growing

A diagnostic framework from a 4-time founder (2 unicorns incl. WP Engine) and 60+ startup investor. The framework is **strictly ordered** — you must fix issues in step N before anything in step N+1 will matter.

## The 5 Questions (in order)

1. **Are customers leaving?** (logo churn)
2. **Is pricing/positioning correct?**
3. **Are existing customers growing?** (NRR)
4. **Are acquisition channels saturated?** (the elephant curve)
5. **Do you actually need to grow?** (existential)

---

## Step 1 — Logo Churn (Customer Cancellations)

### Why it's #1
- Once they're gone, there's nothing you can do — you can't sell them more, can't expand them, nothing.
- Cancellations correlate with negative reviews + bad word of mouth → double whammy.
- **The visceral argument:** Think about the gauntlet a customer survived to get to you (saw an ad → didn't bounce → wasn't scared off by pricing → had budget → bought → onboarded). If after all that they say "no, bye" — something is fundamentally broken in your promise or product.

### The math (the most important growth ceiling almost no one calculates)
> **Max company size = New customers per month ÷ Cancellation rate**

Example: 100 new customers/mo at 5% churn = **2,000 customer hard cap**.

Why? Cancellations grow automatically as you grow (it's a percentage of base). Marketing does NOT — it grows linearly as you optimize. So cancellations *always* eventually overtake marketing. As you approach the cap, growth feels like running through mud.

### The "leaky bucket" twist most people miss
The leak grows automatically with the bucket size. Marketing in flow does not.

### Tip 1 — Reframe the cancellation survey question
- **Bad:** "Why did you cancel?" → 10% usable responses (Groove case study).
- **Good:** "What made you cancel?" → 20% usable responses. Same email, double the data.

### Tip 2 — Randomize cancellation reason dropdowns
Jason discovered Smart Bear's top cancellation reason was just "the first option in the list." After randomization, all options were picked equally — i.e. the data was noise. Multiple companies have replicated this. **Default to free-form text + open-ended questions.**

### Tip 3 — "Too expensive" is almost never the real reason
They already saw your pricing page and bought. Price was acceptable then. Something else broke the promise. Dig deeper:
- "Project ended" → Was your product successful enough to extend the project?
- "Too expensive" → Did they lose budget? Different problem than your price being wrong.
- Often it's an integration gap (e.g., works with Jira but not Linear).

Jason hates "root cause analysis" — complex systems have *many* interlocking causes, not one. Look for "rooter causes" — an array of fixable things, not a single root.

### Tip 4 — AI is bad at extracting actionable detail from surveys
LLMs are averaging machines. Good at: themes, summarization. Bad at: surprising/specific/actionable detail.

Jason's workaround prompt pattern:
> "Pick out themes. Then pick out every specific detail that fits a theme, with which customer said it and a link to the original response."

Always read the raw responses yourself for details — that's where the action triggers live.

### Tip 5 — Catch them BEFORE they cancel
Look at customers who:
- Never uploaded their data
- Are calling support too much (or not at all)
- Logged in once and never came back
- Stopped engaging

You can guess these signals without data. Even guessing + adjusting your theory beats waiting for the cancellation.

### Tip 6 — Find what good customers have in common THAT BAD CUSTOMERS DON'T
Conventional advice: "Look at what your good customers share." Wrong. Most of those traits are also shared by bad customers (because they're just things customers do). The signal is the **delta** between good and bad cohorts.

### Tip 7 — When in doubt, fix onboarding
- 90%+ of cancellations happen in the first 30/60/90 days.
- Small onboarding tweaks have outsized downstream effects (the YouTube viewer-retention curve analogy: a 5% lift in the first 30 seconds compounds to 20-30% more total watch time).
- Early churn is also the most unprofitable churn (you spent CAC and never recovered it).

---

## Step 2 — Pricing & Positioning

### Patrick Campbell's truth (4,200 startup data points)
> "Your prices are way too low because you just guessed and you haven't changed them."

### The 12x story
Jason told a founder selling to enterprise/govt at $300/year to switch to $300/month (a 12x raise). **Same number of signups per week.** Founder said "Now I have so much profit, I'll hire engineers!" Jason: "No. Raise prices again. You're not done."

### The textbook demand curve is wrong
Real-world demand isn't a downward sloping line — it's a **mesa** (plateau). Pricing too low *excludes* serious buyers because cheap prices signal "low quality / not mature / bad support / no governance." Raising prices doesn't lower demand at the bottom — it OPENS the door to a different (better) market that wouldn't touch your product before.

### Pricing IS positioning IS strategy
Pricing is not a knob you turn separately. Includes:
- The number on the page
- Per-seat vs per-usage vs per-site
- What you're priced ON
- What you're claiming the product DOES

### The "Double Down" 8x story (best frame in the episode)
Imagine a tool that halves AdWords spend. A customer spending $40k/mo on AdWords saves $20k. They'll pay maybe $5k for the tool (saves $15k net). Tool earns $5k.

**Same product, repositioned:** "Double the leads at the same CAC."
Customer was already happy spending $40k for X leads. Now they get 2X leads. They'll pay up to $40k. Tool earns **$40k = 8x revenue. Same product.**

The lesson: **Sell more of what the CEO already values (growth) instead of cost-cutting.** Cost-cutting caps your value capture. Growth doesn't.

### Repositioning rule for PMs
> "Sell more of what the company values (growth, market share, retention, competitive moat) — not 'saves time/money/effort.'"

### You can't just raise prices in isolation
A new price means a new market, which means new demands: SOC 2, governance, integrations you don't have, professional services you don't offer. Don't blindly "go upmarket." Sometimes the lower market is where your differentiation actually matters (Buffer's intentional choice to stay SMB).

---

## Step 3 — NRR (Net Revenue Retention)

### Why NRR matters
The only mechanical answer to cancellations growing as % of base is to have *expansion revenue* that also grows as % of base. Marketing (linear) can't keep up. Expansion can.

### NRR is asymmetric — beware
A 20% loss requires a 25% gain to break even (math: $100 → $80 → $96, not $100). NRR treats them as equal. **This is why N (logo churn) still matters even when NRR looks healthy.**

### Empirical benchmarks from public SaaS
- ~100+ public SaaS companies; **only ~2 have NRR < 100%** — and they have terrible valuations.
- **Median NRR at IPO: 119%.** That's the bar mechanically required for sustainable growth.

### Measuring CUSTOMER value (not your value)
The NRR question becomes: "Are we creating more value FOR THE CUSTOMER, then splitting it?"

- Pick a metric of value to the customer (ideally a number).
- If no number exists → use proxy metrics + qualitative interviews.
- Not all important things are numbers (e.g., differentiation isn't a number).

### Filter for every internal proposal
> **"Is this actually good for the customer, or only good for us?"**
> If it's not better for both, kill it. Investor pressure or internal incentives will distort this — write it on the wall.

### Land-and-expand caveat (from Jen Abel)
You can't 10x someone's contract from $10k → $100k easily. They'll question the value-jump. Reference points anchor. Plan for this from contract one.

### Other NRR levers (besides upselling)
- Refer-a-friend / customer-led acquisition (existing customers grow your top of funnel exponentially, not linearly)
- A second product to your existing customers (AG1 sleep supplement to AG1 daily greens buyers)

---

## Step 4 — Acquisition Channel Saturation (The Elephant Curve)

### The elephant curve (Jason's coined term)
The classic S-curve (slow start → rapid growth → plateau) is wrong. Real channel curves look like an elephant: a trunk (the rise), then a saggy butt (the decline). Every channel eventually decays.

### Why channels decay
- Audience saturation — they've already seen your ad 7+ times and don't want it.
- Channel itself decays (magazines/conferences claim growing audiences right up until they go out of business).
- Algorithm changes (SEO).
- AI is now disrupting everything; nobody knows the 2-year picture.

### The diagnostic question
> "Do you know right now which of your channels are saturated and which aren't?"

If "no" → assume all of them are. Stop adding features and asking marketing to flog AdWords harder. That doesn't work in this state.

### Direct vs. indirect channels (Jason's hypothesis)
Products that win via direct (ads) often DON'T win via indirect (SEO/social), and vice versa. Layering on a non-native channel typically yields tiny lift.

### Lenny's hot take
> "Usually one channel drives most growth. Everything else is a small layer on top."

Implication: Be honest about which is your one big channel and whether it's saturating. Don't fool yourself with the multi-channel-portfolio illusion.

### Tip — Get creative; new channels often look weird
- **Constant Contact:** Physically toured cities, ran in-person email-marketing workshops for SMBs (restaurants, dentists). Re-ignited growth despite seeming uneconomical.
- **HubSpot:** Started selling through agencies → 50% of revenue 4-5 years later.
- **WP Engine:** Lots of revenue via WordPress agencies, not direct.

### Adjacency framework for new products/markets
Jason's rule: **One foot planted in a strength/asset, the other foot moves into the risky bet.** Pure greenfield = high failure. Pure adjacent = low ceiling. Plant + step.

---

## Step 5 — Do You Actually Need to Grow?

### The investor pressure trap
"If you're not growing, you're dying" — is this true, or is it propaganda investors use on founders?

### Reframe options if you've exhausted 1-4
- Optimize for **profit** instead of revenue (37signals model, dividends to founders).
- Optimize for **a different metric** (mission, fulfillment, team learning).
- Build a **second product** in the same market.
- **Sunset / sell** the current product, start fresh.
- Decide growth has hit a natural ceiling and that's fine.

### The "you" interpretation
"If you're not growing, you're dying" might be true about *you the person* even when it's not true about *the business*. People who retire and lose purpose visibly decline. People who start companies usually don't actually want to do the same thing for 20 years. Check whether stagnation is killing you, not just your KPIs.

### When to quit
Probability + expected value DON'T work for these decisions because you don't know the probability and you only get one shot at YOUR life. Need different decision-making tools (Jason's next book topic).

---

## Recurring Meta-Lesson

> **The common thread across all five steps: the customer is actually getting value, in the way THEY define value, in their language.**

If that's true, everything else (pricing, retention, channels) tends to fall into place. If it's false, no tactic will save you.

---

## "AI Corner" Tip
Gemini is excellent at converting **chart images → tables you can paste into Google Sheets**. Lets you re-analyze data that's locked in screenshots/blog posts. (Jason uses this constantly for his book research.)

---

## Contrarian Corner — A/B Testing Doesn't Work for Most People

Jason's heretical take:
- A/B testing fails on the things that actually matter (strategy, vision, positioning, the *idea*).
- On the small-detail stuff where it "works," most positive results are **false positives**. You stack 12 winners over a year and nothing actually changed in the conversion rate.
- Why: Statistical tools aren't as accurate as people think + when the real lift is rare, false positives outnumber true positives even at "95% confidence."
- Shopify (huge team, very sophisticated) keeps holdout groups and finds **~1/3 of A/B test wins disappear** when re-checked.

> "If you don't know who the patsy at the poker table is, it's you."

If you're not running Shopify-level rigor, A/B testing is mostly theater.

---

## Lightning Round — Books & Tools
- **Books:** *On Writing Well* (William Zinsser); *Crossing the Chasm* (Geoffrey Moore — Jason notes most people only read the blog summary, not the book itself; the actual book is dense with practical guidance).
- **Recent product loves:** Whisper Flow (dictation), Anchor (charging hardware).
- **Life motto:** "Be yourself. Everyone else is taken." (Probably not actually Oscar Wilde, but attributed.)

---

## Implications for BuildOS

This framework maps directly onto BuildOS's growth diagnostics. Concrete leads to chase:

1. **Logo churn audit** — Compute BuildOS's max-customers-ever ceiling: monthly net new ÷ monthly cancellation rate. That's the number to put on the wall.
2. **Cancellation survey rewrite** — If we're using "Why did you cancel?" anywhere, switch to "What made you cancel?" + free-form. Randomize any dropdown options. Read responses raw before letting AI summarize.
3. **Onboarding-first investments** — Per Jason's "when in doubt, fix onboarding" rule, the highest-leverage retention work is the first 30 days, not month 12.
4. **NRR mechanics** — BuildOS is consumer-leaning, so traditional expansion is harder. The relevant lever is **referral / word-of-mouth growth** — that's our NRR-equivalent because it scales as % of installed base, not as % of marketing spend.
5. **Anti-feed positioning is correct under this framework** — We're picking the market via positioning. "Thinking environment for people making complex things" filters out cheap-tool-shoppers and selects for serious creators willing to pay. Don't apologize for the price.
6. **Channel saturation honesty** — Which channels do we KNOW are saturated vs. unsaturated? If answer is "we don't know," default assumption per Jason: all of them are. Plan creative-channel experiments accordingly (the Constant Contact / HubSpot-agency analogue for BuildOS = creator partnerships, podcast tours, in-person events with authors/YouTubers).
7. **"Is this good for the customer?" filter** — Add to internal pricing/feature decisions explicitly. Especially relevant for BuildOS's anti-AI marketing stance: the question naturally aligns with our brand discipline.
8. **A/B testing skepticism** — At our scale, treat A/B test wins with extreme suspicion unless we run holdout groups. Better signal: qualitative + cohort retention curves over months.

---

## One-Line Takeaways (for sharing / Twitter / LinkedIn)

- "Cancellations grow as a percentage of your base. Marketing grows linearly. That's why every SaaS company eventually stalls."
- "Your max customer ceiling = new customers per month ÷ cancellation rate. Calculate it. It's terrifying."
- "Change 'Why did you cancel?' to 'What made you cancel?' Same email, double the actionable responses."
- "Pricing isn't a knob — it's a market-selection tool. Cheap prices exclude serious buyers."
- "Sell more of what the CEO values (growth, share). Don't sell cost savings — it caps your value capture."
- "Median public SaaS company has 119% NRR at IPO. Below 100% means you're statistically locked out of scale."
- "Every marketing channel decays. The S-curve is actually an elephant curve. Plan for the sag."
- "If you don't know which of your channels are saturated, all of them probably are."
- "If you're not growing, you might not be dying — but check whether *you* are."
