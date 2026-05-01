<!-- docs/founder/resumes/David_Wayne_Resume_2page.md -->
<!-- David_Wayne_Resume_2page.md, light-touch trim of David_Wayne_Resume.md, targeting 2 pages -->

# David Wayne

**Senior Full-Stack Engineer | React, TypeScript, AI Systems & Integrations**

djwayne35@gmail.com · (202) 869-5478 · [github.com/Wolverine971](https://github.com/Wolverine971) · [linkedin.com/in/djwayne](https://linkedin.com/in/djwayne)

---

## Summary

Senior full-stack engineer with 8+ years shipping production web applications. Deep React and TypeScript work in complex codebases, plus heavy experience in enterprise integrations and AI systems. Founder of **BuildOS**, an AI-native productivity platform built on a multi-LLM routing layer, agentic Calendar/MCP integration, and a custom Supabase-native job queue. At Curri rebuilt the React-based live operations console and owned the integration layer that connected Curri's delivery network to Lyft, Uber, DoorDash, and four regional partners. Former US Marine Corps Scout Sniper Team Leader.

---

## Technical Skills

- **Frontend:** React, Next.js, TypeScript, Redux-pattern state management (VueX, NgRx, Svelte stores), Vue, Angular / AngularJS, Svelte / SvelteKit, Tailwind, real-time UIs (SSE, WebSockets), map UIs (Mapbox)
- **Backend:** Node.js, Express, C#, Java, REST, webhooks, OAuth / credential exchange, async job queues
- **AI / LLM:** OpenRouter, multi-provider model routing with fallback (OpenAI / Anthropic / Moonshot), prompt caching, tool calling, streaming, JSON mode, MCP-style agent integration, context engineering, agent harness design
- **Data:** PostgreSQL, Supabase (RLS, RPC), Elasticsearch, SPARQL / knowledge graphs
- **Infrastructure:** Vercel, Railway, Turborepo + pnpm workspaces, Twilio, Google OAuth, GitHub Actions

---

## Experience

### BuildOS | Founder & Engineer · Mar 2025 – Present

_AI-native productivity platform · [build-os.com](https://build-os.com) · 80+ beta users_

- Designed and shipped the full platform solo: SvelteKit on Vercel, Node worker on Railway, Turborepo monorepo, Supabase Postgres with row-level security.
- **Shipped the full user-facing surface to 80+ beta users**: brain-dump capture (text + voice), project and task views, a real-time streaming chat UI, daily-brief email composition, and SSE-driven progress for long-running LLM jobs.
- Built a **multi-LLM routing layer** that scores requests by task complexity, latency, and cost, routing across OpenRouter (primary) with OpenAI / Anthropic / Moonshot as direct fallbacks. Supports streaming, tool calling, and JSON mode.
- Built an **agentic chat** that reads and writes the user's Google Calendar and runs project actions via tool use. The same surface lets external agents (e.g. Claude Code, MCP-style harnesses) drive BuildOS on a user's behalf.
- Designed a **Redis-free job queue** on Supabase using `FOR UPDATE SKIP LOCKED` for atomic job claims. Powers daily briefs, brain-dump processing, voice transcription, OCR, ontology classification, and SMS workflows.
- Heavy work in **context engineering and agent harness design**: picking the right tools, schemas, and context so LLM tool calls behave reliably in production.

### Curri (YC S19) | Software Engineer · Jan 2022 – Feb 2025

_B2B same-day construction-materials delivery platform. React + TypeScript codebase with three web frontends (Next.js admin + customer booking app, plus marketing site), a React Native driver app, and a Node worker service running the driver-search algorithm and async delivery jobs._

- **Rebuilt Curri's service-ops console into a real-time, event-driven triage system.** Replaced a static delivery dashboard with a prioritized alert queue that surfaced exceptions (driver-search timeout, assigned-driver cancellation, driver stalled at pickup, ETA overrun) and exposed the resolving action inline. Designed the upstream signal model and coordinated cross-system changes in the worker service and integration layer to emit the events the console consumed. Partnered closely with PM and design.
- **Built and owned Curri's third-party delivery integration layer.** Connected seven providers (**Lyft, Uber, DoorDash, Dispatch, Pronto, Material Drop, Superior**) into Curri's driver-search algorithm so deliveries could fail over to an external network when no in-network driver was available.
    - **Reverse-engineered every partner's delivery API.** Public docs were typically incomplete or missing; pieced together the contracts by hand for all seven partners.
    - Designed a hybrid **webhook + polling reconciliation pattern** to maintain ground-truth delivery state between partners with inconsistent or partial event coverage.
    - Built **OAuth / credential-exchange flows** and partner-specific API contracts; pre-fetched pricing quotes so deliveries could be dispatched to Uber / Lyft / DoorDash on demand.
    - At scale, routed ~100–200+ deliveries per day per partner, including high-margin specialty equipment (box trucks, stake beds, flatbeds) the in-network fleet couldn't service.
- **Built an interactive sales / leadership map** showing geographic delivery activity, regional metrics, and customer-specific patterns. Gave sales reps account-level visibility and leadership a territory-level view.

### C4 Planning Solutions | Software Engineer · Mar 2021 – Dec 2021

_Military Justice Case Management System (DoD client) used by military lawyers to look up case and trial information across the DoD military justice system._

- Performed substantial **data migrations of legacy case data** into the production system; built reusable migration tooling to format and load incoming data.
- Tackled bug fixes and new feature work in an Agile environment. Stack: Vue, jQuery, SharePoint.

### Webworld Technologies | Software Engineer · Aug 2019 – Mar 2021

_Dewey Knowledge Portal, a proof-of-concept knowledge platform for US Air Force intelligence analysts. Ingested intel reports and exposed them through a graph data model so analysts could traverse connections across people, places, events, and source documents._

- Designed and built the **nested AND/OR query-builder UI** that compiled visual queries to **SPARQL** and ran them against the underlying knowledge graph. Analysts could express complex connection-driven searches without writing graph queries by hand.
- Built supporting analyst tooling: classification/citation documentation flows, change-management dashboards, and a templating system that returned custom "Wikipedia-style" result pages.
- **Improved frontend performance** in the Angular + NgRx app by adding memoization to store effects and caching at the data layer, reducing redundant API calls and re-renders.

### MetroStar Systems | Software Engineer · Apr 2018 – Aug 2019

_US Census Bureau, Center for Enterprise Dissemination Services and Consumer Innovation (CEDSCI)_

- Re-architected an aging **AngularJS application into Vue** as part of a joint contract team (~5 frontend / 5 backend, plus data engineers and SMEs) delivering a single-search-bar interface over the Census Bureau's multidimensional public datasets.
- Built the **central search-bar component** (the product's primary interface), engineered for responsiveness, keyboard navigation, and **Section 508 / WCAG accessibility** including JAWS screen-reader support.
- Owned heavy **frontend state management in VueX** for multi-dimension faceted search and filtering.
- Led demos in agile ceremonies with 100–200 government stakeholders and SMEs in attendance.

### Sabio | Full Stack Developer · Apr 2017 – Jan 2018

_Hired by the Sabio bootcamp upon graduation to build internal tools and client work._

- Built a real-time **student-management application** (AngularJS + C# + SQL + SignalR) that managed an instructor/student help queue with one-on-one routing.
- Led an "Intro to Web Development" community meetup walking attendees through building a working blog.

---

## Military Service

### US Marine Corps · 2012 – 2017 · Scout Sniper Team Leader, Infantry

- Deployed to **Afghanistan (2013)** with an infantry line platoon supporting the retrograde of US forces from the country.
- Graduated **Marine Scout Sniper School (2015)**, qualifying for the elite reconnaissance and precision-marksmanship community.
- Deployed to **Kuwait (2016) as a Scout Sniper Team Leader**, serving as the Quick Reaction Force for operations in the surrounding area of responsibility.
- **Honor Graduate, Corporal / Non-Commissioned Officer Course**. Top of class in the Marine Corps' professional NCO leadership program.

---

## Education

- **Web Development Certificate**, Sabio Coding Bootcamp (partnered with Antioch University), 2017
- **Two years of community college coursework**

---

## Personal Projects

- **[9takes.com](https://9takes.com)**: Reddit-style discussion site organized around the Enneagram personality framework. Built solo on Vue + Nuxt + GraphQL + Elasticsearch + MongoDB. 15K+ monthly uniques, 1,500+ weekly, 100+ registered users.
- **[thecadretraining.com](https://thecadretraining.com)**: Live booking site for a long-range precision rifle training company. Drives course signups for active classes.
