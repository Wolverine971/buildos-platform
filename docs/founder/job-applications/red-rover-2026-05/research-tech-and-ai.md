<!-- docs/founder/job-applications/red-rover-2026-05/research-tech-and-ai.md -->

# Red Rover K-12 — Tech & AI Research

**For:** DJ's CTO conversation, 2026-05-27
**Researched:** 2026-05-26
**Sources:** Paylocity job posting, redroverk12.com, RocketReach stack profile, Globe Newswire press releases, LinkedIn company page, Mike Sheldon's career history (Frontline → Propel → Red Rover).

---

## 1. Job Posting Summary

**Title:** Senior Software Engineer
**Comp:** $160,000 – $185,000
**Location:** Fully remote, US. Flexible PTO + 11 holidays.
**Posting URL:** https://recruiting.paylocity.com/Recruiting/Jobs/Details/4121721

**Responsibilities (paraphrased from posting):**

- "Imagine, spec, and build product features that are easy to use, consistent, fast, and earn the trust of our customers."
- Full-stack work across backend and frontend.
- "Partner with subject matter experts to understand the needs of potential users."
- Mentor junior engineers.

**Required:**

- **4+ years developing C# web APIs with modern tools and processes.**
- Self-starter, collaborative, ethics, mentorship orientation.

**Nice-to-haves:** None stated.

**Stack named in posting:**

- **Backend:** Azure, SQL, C#
- **Frontend:** GraphQL, TypeScript, React

**Team structure:** "Small and incredibly talent-rich" product engineering team — engineers, designers, and customer experts. Per CTO Mike Sheldon: **no product managers, no separate product team. UX and engineering live under the CTO.** That's an unusual and load-bearing detail for DJ — it means whoever owns "product" is engineering, which lines up with how BuildOS is run.

**No AI/ML mentions in the posting.** That's notable in 2026.

---

## 2. Confirmed Tech Stack

**Confirmed (from job posting + RocketReach + integrations page):**

- **Backend:** C# / ASP.NET (RocketReach lists ASP.NET; job posting confirms C# web APIs). .NET version unstated — given 2020 founding and "modern tools," safe bet is .NET 6/7/8 (LTS).
- **Database:** SQL on Azure. Almost certainly **Azure SQL** or **SQL Server on Azure**. Postgres is not indicated anywhere.
- **Cloud:** **Microsoft Azure** (confirmed: Azure DNS, Microsoft IIS, Exchange Online, Entra ID auth, "Azure, SQL, C#" in the JD). Not AWS, not GCP.
- **Frontend:** **React + TypeScript + GraphQL** (likely Apollo Client given the combination). Mobile apps exist on both iOS App Store and Google Play under "Red Rover K12" — unclear if React Native or native; not confirmed from public sources.
- **Auth:** SAML v2, OpenID Connect (Microsoft Entra ID, Google Workspace, DUO, HelloID).
- **CDN/Edge:** Cloudflare.
- **Comms / Ops:** Zendesk, HubSpot, Vidyard, Zoom.

**Integration surface (this is the actual product reality):**

- **SIS / ERP / payroll:** PowerSchool, Skyward (SMS 2.0 + Qmlativ), Tyler (Enterprise + New World), Oracle, Workday, ADP, Paychex, Paycor, UKG Ready, NetChex, plus ~15 more. Mostly **CSV/text-file imports**, with some API connections. The Skyward Qmlativ integration is explicitly moving toward "real-time API transactions" — meaning batch CSV is still the norm and real-time is the roadmap.
- **Job boards:** LinkedIn, Indeed (coming soon per Hiring page), Google Jobs.
- **Verification:** Verifent (announced Feb 2026 as "industry first" partnership).

**Engineering culture signal:** From the Beyond the Code blog post — Sheldon explicitly calls out "we have to hire great talent. We talk about being a talent-dense team." Servant-leadership framing, peer-to-peer problem solving, no PM layer. Sheldon was **Software Architect at Frontline Education** when it scaled to $1B+ valuation — he literally built the competitor DJ would now be displacing.

---

## 3. AI Strategy — What's Shipped, What's Hinted, What's Missing

### What's actually shipped (publicly visible)

1. **Smart resume parsing** in Red Rover Hiring. Verbatim from the hiring page: _"With smart resume parsing, Red Rover does the hard work—automatically pulling the right information from your resume and into the correct fields."_ This is the only product feature publicly branded as AI-adjacent. Resume parsing has been commodity tech for a decade.
2. **In-platform AI job description generator** in Red Rover Hiring. Mentioned in their March 2025 blog post: _"Red Rover Hiring offers an in-platform AI tool designed just for this purpose"_ (drafting job descriptions). This is almost certainly an OpenAI/Azure OpenAI wrapper.
3. **Schedule optimization for sub-matching.** Called "proprietary schedule optimization technology" — instantly texts qualified subs based on availability. **Not described as AI/ML in their own marketing.** Likely rules-based + heuristics rather than a learned model.

### What's hinted

- **The March 2025 blog "AI and Workforce Management: Strategies To Operationalize Your Day-to-Day"** is the closest thing to a public AI position. Three endorsed use cases: content generation (with human review), chatbots for routine inquiries (avoiding sensitive topics), and data analysis on survey/research data. **The tone is cautious-curious thought leadership, not a product roadmap.** No timeline, no shipped features beyond the hiring tool.
- Sheldon mentions AI in interviews only as part of a list of "modern things to consider" alongside blockchain. Reads like awareness, not conviction.

### What's missing (the gaps)

- **No public AI roadmap.** No press releases about an AI platform, AI assistant, or LLM-powered features.
- **No AI/ML/data engineering roles** in the posting DJ is interviewing for. No data scientist or ML engineer titles surfaced anywhere.
- **No mention of "agent," "copilot," "assistant," or "LLM"** anywhere on the marketing site.
- **No engineering blog** beyond the marketing blog. No GitHub presence found for the company.
- **Sub-matching is not described as ML.** This is the single most obvious place for AI in their product (a true matching problem with a labeled outcome — did the sub accept, did they show up, did the teacher rebook them). They have **18,000+ substitute survey responses** referenced in May 2026 — they have the data, the question is whether they're using it.

### Competitive context

- **Frontline (the giant Sheldon came from):** market-leading absence management, hundreds of matching algorithms but **not publicly branded as AI**. They're slow on AI messaging too.
- **HelloSubs:** ships an "AI teaching assistant" that generates lesson plans for subs. This is an actual AI product wedge.
- **CloudApper AI:** ships auto-placement engines branded as AI for the UKG ecosystem.
- **STEDI SubDesk:** markets "intelligent matching algorithms."
- **Big picture:** K-12 ops/HR is moving slowly on AI compared to instruction-side (where Khanmigo, MagicSchool, etc. dominate headlines). Red Rover is **not behind the K-12 HR pack, but they're not leading it either.** There is a real opening for whoever ships agentic workflows first in this space.

---

## 4. Sharp Questions DJ Can Ask the CTO

These are designed to find out _if Red Rover is investing in AI seriously or just talking_ — without sounding like a critic.

1. **"You've shipped resume parsing and the in-hiring AI job-description tool. What's the next AI bet — is it sub-matching, applicant ranking, or something on the records/PD side? And is that a 2026 roadmap item or further out?"**
   _Why it works: forces a roadmap answer. Their two shipped AI features are both in Hiring; sub-matching is the obvious next domain but they haven't claimed it publicly._

2. **"With 18,000 substitute survey responses and years of fill-rate data across 1,900 districts, you have a real training set for matching quality. How do you think about that data — is it being used for ML today, or is sub-matching still rules-based optimization?"**
   _Why it works: shows DJ did the homework, reveals whether they have an ML practice or just heuristics, opens the door for DJ to talk about how he thinks about evaluation in BuildOS._

3. **"You don't have a PM layer — UX and engineering live under you. How does AI feature scoping happen in that structure? Who owns the 'is this worth shipping' call versus the 'is this safe to ship in an HR product' call?"**
   _Why it works: respects Sheldon's stated org design, surfaces how AI risk gets evaluated in a no-PM world, and shows DJ thinks about AI product design — not just AI engineering._

4. **"Your integration surface is mostly CSV with Skyward Qmlativ moving to real-time APIs. As you go more real-time, do you see agent-style automations (e.g., 'when a leave request comes in, propose the sub, send the text, log to payroll') becoming the product — or is the platform vision still UI-centric?"**
   _Why it works: this is DJ's BuildOS thesis (agent-native) applied to their integration roadmap. Probes whether they're thinking about agents as users of the system._

5. **"Coming from Frontline's architecture seat, you've seen what doesn't get rebuilt in legacy K-12 systems. What's the one piece of Red Rover's stack you'd most want to bet on AI changing in the next 18 months — and what's the one piece you'd _not_ trust AI with?"**
   _Why it works: invites Sheldon to share his actual strategic conviction, references his Frontline history (respect), and gives DJ a read on whether AI is a top-3 priority or top-10._

---

## 5. What DJ Should Know Walking In

- **Stack fit is real.** C# is the gating skill (4+ years), but the JD lists GraphQL, TypeScript, React, Azure, SQL — DJ's TypeScript-heavy Curri background covers most of the surface area. The C# rust is the honest gap.
- **No PM layer = high product agency.** This is the BuildOS way. DJ should lean into that — he's been _operating_ without PMs at BuildOS.
- **AI maturity is "early and cautious," not "non-existent."** Two shipped features, one published position piece. There is real room to lead here, and Sheldon is the technical co-founder who would make that call.
- **The CTO came from Frontline.** Don't pitch "Frontline is old and slow" — he built it. Pitch "the next generation of this is agent-native and you have the data to do it first."
- **What we couldn't verify:** mobile app stack (native vs RN), specific .NET version, whether they use Azure OpenAI vs OpenAI direct, internal engineering blog (none public), engineering headcount precisely (LinkedIn shows ~200 total employees; engineering is "small" per Sheldon — likely 10–25).

---

## Source Index

- Job posting: https://recruiting.paylocity.com/Recruiting/Jobs/Details/4121721
- Beyond the Code (CTO interview): https://www.redroverk12.com/blog/beyond-the-code-how-red-rovers-values-redefine-k-12-workforce-technology
- AI position piece: https://www.redroverk12.com/blog/ai-and-workforce-management-strategies-to-operationalize-your-day-to-day
- Integrations: https://www.redroverk12.com/integrations
- Hiring product page: https://www.redroverk12.com/hiring
- Records launch (Mar 2026): https://www.globenewswire.com/news-release/2026/03/10/3252881/0/en/Red-Rover-Unveils-Records-A-Modern-K-12-HCM-Solution-for-Managing-HR-Data-Efficiently.html
- Verifent partnership (Feb 2026): https://www.globenewswire.com/news-release/2026/02/10/3235406/0/en/Red-Rover-and-Verifent-Partner-to-Deliver-Industry-First-Approach-to-New-Hire-Verification-Processes-for-K-12-Districts.html
- Tech stack (RocketReach): https://rocketreach.co/red-rover-technology-stack_b4283471c1fa37ea
- Skyward integration: https://www.skyward.com/blogs/skyward-insider/2021/march/new-integration-red-rover-staff-absence-management
- CTO career history (LinkedIn blocked WebFetch; pulled from search snippets and Wiza/TheOrg)
