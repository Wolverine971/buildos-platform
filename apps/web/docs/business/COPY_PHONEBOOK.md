<!-- apps/web/docs/business/COPY_PHONEBOOK.md -->

<!-- copy todo -->

# BuildOS Copy Phonebook

> **Last Updated:** 2025-12-08
> **Status:** In Progress
> **Purpose:** Index and analyze all copy across BuildOS for messaging alignment

---

## Schema Definition

Each copy snippet is tracked with the following metadata:

| Column           | Description            | Example Values                                                                         |
| ---------------- | ---------------------- | -------------------------------------------------------------------------------------- |
| `page_url`       | Page path              | `/`, `/pricing`, `/beta`                                                               |
| `page_type`      | Page category          | `home`, `pricing`, `beta`, `about`, `blog_post`, `legal`, `docs`, `help`               |
| `section_id`     | Section within page    | `hero`, `value-pillars`, `personas`, `features`, `faq`, `footer`, `nav`                |
| `element_type`   | Specific element       | `h1`, `h2`, `tagline`, `body_paragraph`, `cta_primary`, `bullet`, `meta_description`   |
| `copy_text`      | The actual text        | -                                                                                      |
| `intent`         | What it's trying to do | `explain`, `differentiate`, `social_proof`, `handle_objection`, `inspire`, `convert`   |
| `persona`        | Target audience        | `adhd_founder`, `overwhelmed_professional`, `student_creator`, `investor`, `general`   |
| `funnel_stage`   | Where in funnel        | `TOFU`, `MOFU`, `BOFU`, `onboarding`, `retention`                                      |
| `value_pillar`   | Core value prop        | `brain_dump_to_structure`, `calendar_execution`, `adhd_friendly`, `context_over_chaos` |
| `feature_anchor` | Related feature        | `daily_brief`, `brain_dump`, `calendar_sync`, `goals_alignment`, `phase_generation`    |
| `tone`           | Voice/style            | `empathetic`, `no_shame`, `direct`, `technical`, `playful`                             |
| `priority`       | Importance             | `core`, `supporting`, `low-stakes`                                                     |
| `needs_review`   | Flag for attention     | `yes`, `no`                                                                            |
| `notes`          | Issues or ideas        | -                                                                                      |

---

## Copy Sources Inventory

### Marketing Pages (Public)

| Page            | Path         | Source File                         | Status     |
| --------------- | ------------ | ----------------------------------- | ---------- |
| **Homepage**    | `/`          | `src/routes/+page.svelte`           | ✅ Indexed |
| **Pricing**     | `/pricing`   | `src/routes/pricing/+page.svelte`   | ✅ Indexed |
| **Beta Signup** | `/beta`      | `src/routes/beta/+page.svelte`      | ✅ Indexed |
| **About**       | `/about`     | `src/routes/about/+page.svelte`     | ✅ Indexed |
| **Investors**   | `/investors` | `src/routes/investors/+page.svelte` | ✅ Indexed |
| **Contact**     | `/contact`   | `src/routes/contact/+page.svelte`   | ✅ Indexed |
| **Roadmap**     | `/road-map`  | `src/routes/road-map/+page.svelte`  | ✅ Indexed |

### Legal Pages

| Page                 | Path       | Source File                       | Status     |
| -------------------- | ---------- | --------------------------------- | ---------- |
| **Privacy Policy**   | `/privacy` | `src/routes/privacy/+page.svelte` | ✅ Indexed |
| **Terms of Service** | `/terms`   | `src/routes/terms/+page.svelte`   | ✅ Indexed |

### Blog Content

| Category              | Posts Count | Source Directory                       | Status                    |
| --------------------- | ----------- | -------------------------------------- | ------------------------- |
| **Getting Started**   | 4           | `src/content/blogs/getting-started/`   | ✅ Complete               |
| **Productivity Tips** | 6           | `src/content/blogs/productivity-tips/` | Partial                   |
| **Philosophy**        | 6           | `src/content/blogs/philosophy/`        | Partial                   |
| **Advanced Guides**   | 5           | `src/content/blogs/advanced-guides/`   | Partial                   |
| **Case Studies**      | 4           | `src/content/blogs/case-studies/`      | Pending                   |
| **Product Updates**   | 4           | `src/content/blogs/product-updates/`   | Pending                   |
| **Comparison Posts**  | 4           | `src/content/blogs/` (root)            | ✅ Priority Posts Indexed |

**Note:** Key comparison posts and headlines have been indexed. See Section 13 (Blog Content Index) for details. Full blog strategy documented in `src/content/BLOG_CONTENT_STRATEGY.md`.

### Shared Components

| Component      | Source File                                   | Copy Elements                               |
| -------------- | --------------------------------------------- | ------------------------------------------- |
| **Navigation** | `src/lib/components/layout/Navigation.svelte` | Logo, nav labels, CTAs, menu items          |
| **Footer**     | `src/lib/components/layout/Footer.svelte`     | Tagline, CTAs, section headers, link labels |

### Resource Pages

| Page           | Path        | Source File                              | Status     |
| -------------- | ----------- | ---------------------------------------- | ---------- |
| **Blog Index** | `/blogs`    | `src/routes/(public)/blogs/+page.svelte` | To Index   |
| **Docs**       | `/docs`     | `src/routes/docs/+page.svelte`           | ✅ Indexed |
| **Help**       | `/help`     | `src/routes/help/+page.svelte`           | ✅ Indexed |
| **Feedback**   | `/feedback` | `src/routes/feedback/+page.svelte`       | ✅ Indexed |

### Authentication Pages

| Page                | Path                    | Source File                                    | Status     |
| ------------------- | ----------------------- | ---------------------------------------------- | ---------- |
| **Login**           | `/auth/login`           | `src/routes/auth/login/+page.svelte`           | ✅ Indexed |
| **Register**        | `/auth/register`        | `src/routes/auth/register/+page.svelte`        | ✅ Indexed |
| **Forgot Password** | `/auth/forgot-password` | `src/routes/auth/forgot-password/+page.svelte` | ✅ Indexed |

---

## Copy Index

### 1. Navigation Component

**Source:** `src/lib/components/layout/Navigation.svelte`

| Element    | Copy                               | Intent   | Persona     | Notes                    |
| ---------- | ---------------------------------- | -------- | ----------- | ------------------------ |
| Logo       | "BuildOS"                          | brand    | all         | -                        |
| Nav Item   | "Dashboard"                        | navigate | user        | -                        |
| Nav Item   | "Projects"                         | navigate | user        | -                        |
| CTA Button | "Brain Dump & Chat"                | engage   | user        | Core feature entry point |
| CTA Button | "Complete Setup"                   | convert  | new_user    | Urgent onboarding        |
| CTA Button | "Personalize (X%)"                 | convert  | new_user    | Progress indicator       |
| Menu Item  | "Profile & Settings"               | navigate | user        | -                        |
| Menu Item  | "Billing"                          | navigate | paying_user | -                        |
| Menu Item  | "Upgrade to Pro"                   | convert  | free_user   | -                        |
| Menu Item  | "Admin Dashboard"                  | navigate | admin       | -                        |
| Menu Item  | "Light Mode" / "Dark Mode"         | utility  | all         | Theme toggle             |
| Menu Item  | "Sign out"                         | utility  | user        | -                        |
| Auth Link  | "Sign In"                          | convert  | guest       | -                        |
| Auth Link  | "Sign Up"                          | convert  | guest       | Primary conversion       |
| Toast      | "Signing out..."                   | feedback | user        | -                        |
| Toast      | "Network error during sign out..." | error    | user        | -                        |
| Toast      | "Sign out timed out..."            | error    | user        | -                        |

---

### 2. Footer Component

**Source:** `src/lib/components/layout/Footer.svelte`

| Element          | Copy                                                                            | Intent   | Persona  | Notes             |
| ---------------- | ------------------------------------------------------------------------------- | -------- | -------- | ----------------- |
| Tagline          | "Transform thoughts into structured productivity with AI-powered organization." | explain  | guest    | Core value prop   |
| Tagline Extended | "Capture ideas, manage projects, and stay organized effortlessly."              | explain  | guest    | Desktop extension |
| CTA Primary      | "Start Free"                                                                    | convert  | guest    | -                 |
| CTA Secondary    | "Join Beta"                                                                     | convert  | guest    | -                 |
| Section Header   | "Product"                                                                       | organize | guest    | -                 |
| Section Header   | "Resources"                                                                     | organize | guest    | -                 |
| Section Header   | "Company"                                                                       | organize | guest    | -                 |
| Link Label       | "About"                                                                         | navigate | guest    | -                 |
| Link Label       | "Pricing"                                                                       | navigate | guest    | -                 |
| Link Label       | "Join Beta"                                                                     | navigate | guest    | -                 |
| Link Label       | "Blog"                                                                          | navigate | guest    | -                 |
| Link Label       | "Help"                                                                          | navigate | all      | -                 |
| Link Label       | "Docs"                                                                          | navigate | all      | -                 |
| Link Label       | "Contact"                                                                       | navigate | guest    | -                 |
| Link Label       | "Investors"                                                                     | navigate | investor | -                 |
| Link Label       | "Feedback"                                                                      | navigate | all      | -                 |
| Link Label       | "Privacy"                                                                       | legal    | all      | -                 |
| Link Label       | "Terms"                                                                         | legal    | all      | -                 |
| Link Label       | "Projects"                                                                      | navigate | user     | Auth footer       |
| Link Label       | "History"                                                                       | navigate | user     | Auth footer       |
| Copyright        | "© 2025 BuildOS"                                                               | legal    | all      | -                 |
| Tagline          | "Made with ♥ for productivity"                                                 | inspire  | all      | Brand personality |

---

### 3. Homepage (`/`)

**Source:** `src/routes/+page.svelte`
**Status:** ✅ EXTRACTED

#### SEO/Meta Copy

| Element             | Copy                                                                                                                                                                                                | Notes            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Title Tag           | "BuildOS - Your Home Base for Scattered Minds \| Brain Dump to Action"                                                                                                                              | Core positioning |
| Meta Description    | "Built for disorganized minds who need to get organized. Transform scattered thoughts into organized action. Brain dump, get AI organization, execute. 14-day free trial."                          | -                |
| OG Title            | "BuildOS - Your Home Base for Scattered Minds"                                                                                                                                                      | -                |
| OG Description      | "Finally, a productivity tool that gets how your brain works. BuildOS: where scattered thoughts become organized action. Built by someone who struggled with organization and needed a better way." | Personal touch   |
| Twitter Description | "Finally, a productivity tool that gets how your brain works. Transform scattered thoughts into organized action. 14-day free trial."                                                               | -                |
| JSON-LD Description | "AI-first project organization platform that transforms brain dumps into structured projects. Perfect for disorganized minds, founders, and creators who need clarity."                             | -                |

#### Hero Section

| Element      | Copy                                                           | Intent           | Priority   |
| ------------ | -------------------------------------------------------------- | ---------------- | ---------- |
| H1           | "Project organization built for the AI era."                   | position         | **core**   |
| Tagline      | "Your thoughts, organized. Your next step, clear."             | inspire          | **core**   |
| CTA Question | "Ready for BuildOS to help you organize your projects?"        | engage           | supporting |
| CTA Primary  | "Start Brain Dumping →"                                        | convert          | **core**   |
| Trust Signal | "14-day free trial • No credit card • Actually built for ADHD" | handle_objection | **core**   |

#### "Who It's For" Section (Persona Cards)

| Persona                   | Headline                    | Bold Statement                             | Description                                                                                                  | Bullets                                                                                         |
| ------------------------- | --------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| ADHD Minds                | "ADHD Minds"                | "Your brain isn't broken. Your tools are." | "Traditional productivity tools demand linear thinking. Your brain doesn't work that way. BuildOS gets it."  | • Dump thoughts in any order • AI finds the structure • Tiny next steps, not overwhelming lists |
| Overwhelmed Professionals | "Overwhelmed Professionals" | "From drowning to directing."              | "When everything feels urgent, nothing is clear. BuildOS turns your mental chaos into a command center."     | • Post-meeting brain dumps • All projects in one place • Know exactly what to tackle next       |
| Students & Creators       | "Students & Creators"       | "Chaos to dean's list (or ship list)."     | "Stop losing brilliant ideas to the void. Capture everything, organize instantly, actually finish projects." | • Semester panic → study plan • Creative sparks → content calendar • Ideas → execution          |

#### "Trust & Objections" Section

| Card Title                    | Copy                                                                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| "🧠 No Shame Zone"            | "We know you've abandoned Notion 6 times. BuildOS works even on your worst days. No complex setup. No maintenance guilt."           |
| "⚡ 60-Second Clarity"        | "From brain dump to organized projects in literally one minute. Voice, text, paste—however your thoughts come out."                 |
| "📍 Your Home Base"           | "Not another app to manage. This is where all your scattered thoughts finally come together. Users call it their 'external brain.'" |
| "🎯 Progress, Not Perfection" | "Celebrate tiny wins. One task done > perfect system abandoned. BuildOS keeps you moving forward, not organizing forever."          |

#### "Three Pillars" Section

| Pillar | Title                 | Bold Statement                | Description                                                                                                                                               |
| ------ | --------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | "Talk It Out"         | "Your thoughts, any format."  | "Voice ramble at 2am? Frantic typing after a meeting? Copy-paste from everywhere? BuildOS handles it all. No formatting. No structure needed. Just dump." |
| 2      | "AI Organization"     | "Instant clarity from chaos." | "Watch your word vomit transform into clear projects with phases. Every task extracted. Ideas parked for later. Context that builds over time."           |
| 3      | "One-Click Execution" | "From 'I should' to 'I did'." | "See your next step. Click to schedule. Get daily briefs that actually help. Stop planning. Start doing."                                                 |

#### Final CTA Section

| Element      | Copy                                                                                      |
| ------------ | ----------------------------------------------------------------------------------------- |
| H2           | "Your scattered thoughts are not the problem. They're potential waiting to be organized." |
| Body 1       | "You've tried the complex systems. You've abandoned the perfect planners."                |
| Body 2       | "What if the tools were wrong, not you?"                                                  |
| Body 3       | "BuildOS is your home base. The one place where your chaos becomes clarity."              |
| CTA Primary  | "Find Your Home Base →"                                                                   |
| Social Proof | "Join 500+ scattered minds who finally stick with their system"                           |
| Trust Signal | "14 days free • Cancel anytime"                                                           |

---

### 4. Pricing Page (`/pricing`)

**Source:** `src/routes/pricing/+page.svelte`
**Status:** ✅ EXTRACTED

#### SEO/Meta Copy

| Element          | Copy                                                                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Title Tag        | "Pricing - BuildOS \| AI-Powered Productivity Plans"                                                                                                 |
| Meta Description | "Choose the perfect BuildOS plan. Start free or unlock unlimited AI-powered organization for $12/month. 14-day free trial, no credit card required." |

#### Hero Section

| Element  | Copy                                                                       |
| -------- | -------------------------------------------------------------------------- |
| H1       | "Simple, Transparent Pricing"                                              |
| Subtitle | "Start with a 14-day free trial. No credit card required, cancel anytime." |

#### Plan Card (BuildOS Pro)

| Element     | Copy                                          |
| ----------- | --------------------------------------------- |
| Plan Name   | "BuildOS Pro"                                 |
| Tagline     | "Your personal productivity operating system" |
| Price       | "$20/month"                                   |
| Price Note  | "Billed monthly • 14-day free trial"          |
| Trial Badge | "X Days Left in Trial" (dynamic)              |

#### Feature List

1. "Unlimited projects"
2. "AI-powered brain dump parsing"
3. "Advanced task automation"
4. "Daily AI insights & briefs"
5. "Goal-task alignment tracking"
6. "Priority email support"
7. "Calendar integrations"
8. "Data export"

#### CTA Buttons

| State      | Copy                                  |
| ---------- | ------------------------------------- |
| Guest      | "Start 14-Day Free Trial"             |
| Trial User | "Subscribe Now" or "Start Free Trial" |
| Subscriber | "Manage Subscription"                 |
| Disabled   | "Coming Soon"                         |

#### FAQ Section

| Question                               | Answer                                                                                                                                                                                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "What happens after my 14-day trial?"  | "After your trial ends, you'll have a 7-day grace period to subscribe. During this time, your account will be in read-only mode - you can view all your data but cannot create or edit content. Subscribe anytime to regain full access." |
| "Do I need a credit card to start?"    | "No! You can start your 14-day trial without entering any payment information. You'll only need to add a payment method when you're ready to subscribe."                                                                                  |
| "What happens to my data if I cancel?" | "You can export all your data at any time. After cancellation, your data remains accessible for 30 days before being permanently deleted."                                                                                                |
| "Can I cancel anytime?"                | "Absolutely! You can cancel your subscription at any time from your profile settings. You'll continue to have access until the end of your billing period, then your account will switch to read-only mode."                              |

#### Final CTA Section

| Element  | Copy                                                           |
| -------- | -------------------------------------------------------------- |
| H2       | "Ready to Transform Your Productivity?"                        |
| Subtitle | "Start your 14-day free trial today. No credit card required." |
| CTA      | "Start Free Trial"                                             |

---

### 5. Beta Signup Page (`/beta`)

**Source:** `src/routes/beta/+page.svelte`
**Status:** ✅ EXTRACTED

#### SEO/Meta Copy

| Element          | Copy                                                                                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Title Tag        | "Join Beta Program - BuildOS \| Early Access to AI Productivity"                                                                                                                   |
| Meta Description | "Join the BuildOS beta program. Get early access to AI-powered brain dump organization, weekly founder calls, and help shape the future of productivity. Limited spots available." |

#### Hero Section

| Element       | Copy                                                                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Badge         | "BETA"                                                                                                                       |
| H1            | "Join the BuildOS Beta"                                                                                                      |
| Subtitle      | "Get early access to BuildOS and help shape how it develops. Work directly with me to build better AI-powered productivity." |
| CTA Primary   | "Join Beta"                                                                                                                  |
| CTA Secondary | "Learn More"                                                                                                                 |
| Trust Signal  | "Free during beta • Work directly with the founder"                                                                          |

#### Application Status Messages

| Status   | Title                      | Message                                                      |
| -------- | -------------------------- | ------------------------------------------------------------ |
| pending  | "Application Under Review" | "I'll review your application within 48 hours."              |
| approved | "You're In! 🎉"            | "Check your email for beta access instructions!"             |
| waitlist | "You're on the Waitlist"   | "You're on the waitlist. I'll reach out when spots open up." |

#### Form Labels & Placeholders

| Field                | Label                                              | Placeholder                                                                   |
| -------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------- |
| email                | "Email Address"                                    | "your@email.com"                                                              |
| fullName             | "Full Name"                                        | "Your full name"                                                              |
| jobTitle             | "Current Role"                                     | "e.g., Startup Founder, Product Manager"                                      |
| companyName          | "Company (Optional)"                               | "Your company name"                                                           |
| whyInterested        | "Why are you interested in BuildOS?"               | "Tell me what excites you about BuildOS and how you hope to use it..."        |
| biggestChallenge     | "What's your biggest productivity challenge?"      | "Describe what frustrates you most about staying organized and productive..." |
| referralSource       | "How did you hear about us?"                       | -                                                                             |
| wantsWeeklyCalls     | "I'm interested in joining calls with the founder" | -                                                                             |
| wantsCommunityAccess | "I'd like to connect with other beta users"        | -                                                                             |

#### "What You Get" Benefits

| Benefit | Title                     | Description                                                                              |
| ------- | ------------------------- | ---------------------------------------------------------------------------------------- |
| 1       | "Early Access"            | "Get BuildOS before public launch and help shape how it develops."                       |
| 2       | "Direct Collaboration"    | "Work directly with me. If you have product-minded feedback, it will be directly heard." |
| 3       | "Lock-in Special Pricing" | "Beta members get to lock in special pricing when BuildOS launches."                     |
| 4       | "Priority Feedback"       | "Your requests and feedback go to the top of the development queue."                     |
| 5       | "Free Premium Access"     | "Use all BuildOS features completely free during the beta period."                       |
| 6       | "Connect with Others"     | "Chance to connect with fellow productivity enthusiasts in the beta community."          |

#### Final CTA Section

| Element       | Copy                                                                               |
| ------------- | ---------------------------------------------------------------------------------- |
| H2            | "Ready to Help Build BuildOS?"                                                     |
| Subtitle      | "Join the beta program and work with me to create better AI-powered productivity." |
| CTA Primary   | "Join Beta Program"                                                                |
| CTA Secondary | "Questions?"                                                                       |
| Note          | "Beta spots are limited to maintain quality feedback."                             |

---

### 6. About Page (`/about`)

**Source:** `src/routes/about/+page.svelte`
**Status:** ✅ EXTRACTED

#### SEO/Meta Copy

| Element          | Copy                                                                                                                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Title Tag        | "About BuildOS - AI-Powered Brain Dump Organization \| DJ Wayne"                                                                                                                                                                     |
| Meta Description | "BuildOS transforms scattered thoughts into organized action with AI. Founded by DJ Wayne, a former USMC Scout Sniper turned software engineer. Brain dump your ideas, get daily briefs, and build context for better productivity." |

#### Hero Section

| Element | Copy                                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| H1      | "About BuildOS"                                                                                                                       |
| Tagline | "Let AI organize your thoughts. Transform brain dumps into structured action with daily briefs and intelligent calendar integration." |
| Badge   | "Built by someone who believes humans are nowhere near as productive as we could be"                                                  |

#### "The Problem" Section

| Element  | Copy                                                                                                                                                |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| H2       | "The Problem"                                                                                                                                       |
| Subtitle | "You're drowning in scattered thoughts across multiple tools, and you keep repeating yourself to AI assistants because you can't maintain context." |

| Problem Category          | Bullets                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Productivity Tool Chaos" | • Notion for docs, Obsidian for notes, Google Docs for sharing • Moleskines, Apple Notes, random text files everywhere • Brilliant ideas lost in the chaos of daily tasks |
| "LLM Context Loss"        | • Repeating the same project context to Claude and ChatGPT • No way to build on previous AI conversations • Losing momentum because you can't iterate efficiently         |

#### "How BuildOS Works" Section

| Step | Title              | Description                                                            |
| ---- | ------------------ | ---------------------------------------------------------------------- |
| 1    | "Brain Dump"       | "Capture all your scattered thoughts without worrying about structure" |
| 2    | "AI Organization"  | "AI processes your thoughts into projects, tasks, and context"         |
| 3    | "Daily Briefs"     | "Get personalized updates on your projects and priorities"             |
| 4    | "Smart Scheduling" | "Tasks automatically find optimal time slots in your calendar"         |

| Feature Card     | Title                              | Description                                                                                                                                                                                      |
| ---------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Context Building | "The Real Power: Context Building" | "BuildOS creates rich project context that you can copy and share with LLMs. No more repeating yourself - just paste your project context and say 'iterate on this' or 'what should I do next?'" |

#### Founder Story Section

| Element      | Copy                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| H2           | "Meet the Founder"                                                                                                             |
| Subtitle     | "A veteran on a mission to solve productivity chaos through AI-powered organization."                                          |
| Founder Name | "DJ Wayne"                                                                                                                     |
| Credentials  | "Former USMC Scout Sniper • 8 years building software • YC-backed startup experience (Curri) • Power user of Claude & ChatGPT" |

| Story Section | Title                | Copy                                                                                                                                                                                                                                               |
| ------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1             | "The Breaking Point" | "I was juggling multiple projects - BuildOS, 9takes.com, client work, family life. My thoughts were scattered across Notion, Obsidian, Google Docs, Moleskines, Apple Notes, and random text files. I was drowning in my own productivity system." |
| 2             | "The LLM Problem"    | "As a power user of Claude and ChatGPT, I was constantly repeating the same project context just to get them to iterate on my ideas. I needed a way to build and maintain context that I could share with LLMs for better collaboration."          |
| 3             | "The Solution"       | "BuildOS was born from this frustration. I'm now using BuildOS to build BuildOS - the ultimate dogfooding. It's helped me organize my chaos and iterate faster with AI assistance."                                                                |

| Quote | "I believe humans are nowhere near as productive as we could be. We have incredible tools, but we're still stuck in organizational chaos. Build OS is my attempt to fix that." — DJ Wayne, Founder |

#### "Where We Are Now" Section

| Metric   | Value  | Label            | Description                                               |
| -------- | ------ | ---------------- | --------------------------------------------------------- |
| Phase    | "MVP"  | "Building Phase" | "Core brain dump processing and AI organization features" |
| Timeline | "July" | "Beta Launch"    | "Early access for users who want to shape the product"    |
| Team     | "1"    | "Solo Founder"   | "Bootstrapped and focused on solving real problems"       |

#### CTA Section

| Element  | Copy                                                                  |
| -------- | --------------------------------------------------------------------- |
| H2       | "Ready to Organize Your Chaos?"                                       |
| Subtitle | "Join the beta and help build the future of AI-powered productivity." |

| CTA Card  | Title       | Subtitle           |
| --------- | ----------- | ------------------ |
| Join Beta | "Join Beta" | "Get early access" |
| Invest    | "Invest"    | "Partner with us"  |
| Connect   | "Connect"   | "Let's chat"       |

---

### 7. Investors Page (`/investors`)

**Source:** `src/routes/investors/+page.svelte`
**Status:** ✅ EXTRACTED

#### SEO/Meta Copy

| Element          | Copy                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Title Tag        | "Investors - BuildOS \| AI-Native Productivity Platform for the Agent Economy"                                                                         |
| Meta Description | "The first AI-native productivity platform built for the agent economy. Founded by DJ Wayne. Follow BuildOS development and investment opportunities." |

#### Hero Section

| Element       | Copy                                                                                                                                       | Intent        | Priority   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------- | ---------- |
| H1            | "The AI-First Productivity Platform"                                                                                                       | position      | **core**   |
| Subtitle      | "While others retrofit AI into old systems, BuildOS is being built from the ground up to using AI but focusing on understanding the user." | differentiate | **core**   |
| CTA Primary   | "Get Updates"                                                                                                                              | convert       | supporting |
| CTA Secondary | "Connect"                                                                                                                                  | convert       | supporting |

#### "Building for the AI Era" Section

| Card Title     | Description                                                                                                         | Key Stats/Points                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| "Large Market" | "Productivity software market ($75B+) converging with AI tools market ($800B+ projected by 2030)."                  | • Notion ($10B valuation, 2021) • Linear ($1.25B valuation, 2025) • ChatGPT (800M weekly users, Jan 2025) |
| "Right Timing" | "The convergence of voice AI, context management needs, and the emerging agent economy creates the perfect timing." | • Voice AI adoption exploding • Context/memory becoming critical • Agents need clear context              |
| "First Mover"  | "Only productivity platform built AI-first from day one. Competitors are retrofitting AI into existing systems."    | • Competitors retrofitting AI • We started with an AI framework • Early MCP adoption                      |

#### Technical Advantages Section

| Advantage | Title                        | Description                                                                                                                                                                                                                                                                                              | Takeaway                                                                               |
| --------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1         | "AI-Native Architecture"     | "While Notion, Linear, and others bolt AI onto existing systems, BuildOS was designed with AI at the core. As Andrej Karpathy noted, neural networks are 'eating through' traditional code - BuildOS embodies this shift by letting AI dynamically structure your projects and context."                 | "This architectural advantage compounds over time and becomes impossible to replicate" |
| 2         | "Voice-First Design"         | "Users get more value from AI through voice interaction because it has less friction than writing. BuildOS is designed for natural conversation - once users start talking to it, they don't stop."                                                                                                      | "Voice AI adoption is accelerating, and BuildOS is positioned to capture this shift"   |
| 3         | "Transparent Context Engine" | "Unlike ChatGPT's hidden memory, BuildOS shows users exactly what AI remembers. Users edit, build upon, and control their context - creating compound knowledge that improves over time. BuildOS serves as the persistent checkpoint where external agents return to sync context and coordinate tasks." | "This becomes the control center for multi-agent workflows"                            |

#### Development Roadmap Section

| Phase | Timeline        | Title                    | Description                                                                                                                                                                       | Status Items                                                                   |
| ----- | --------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1     | "NOW - Q2 2025" | "Productivity Tool"      | "AI-powered organization for individuals. Brain dumps become structured projects with intelligent task management."                                                               | ✅ Voice-native interface, ✅ Context building engine, ✅ Calendar integration |
| 2     | "Q3 2025"       | "LLM Platform"           | "Become the context checkpoint for AI interactions. Users maintain their core context in BuildOS while external agents sync back to update progress and coordinate next steps."   | MCP server integration, Collaboration features                                 |
| 3     | "2026+"         | "Agent Operating System" | "The operating system for AI agents. BuildOS becomes the persistent memory and coordination layer where multiple specialized agents checkpoint their progress and share context." | 3rd party agent integrations, Increased tool usage                             |

#### Founder Section

| Element       | Copy                                                                                                                                                                                                       |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name          | "DJ Wayne"                                                                                                                                                                                                 |
| Credentials   | "• Former USMC Scout Sniper • 8 years software engineering • YC-backed startup experience (Curri) • Serial builder: 9takes.com, thecadretraining.com, tinytribeadventures.com"                             |
| Why Statement | "I built BuildOS because I needed it. As a power user of Claude and ChatGPT managing multiple projects, I wanted a home base to stay organized. The existing tools didn't work for me, so I built my own." |

#### Updates Section

| Element  | Copy                                                                                                                                            |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| H2       | "Follow BuildOS Development"                                                                                                                    |
| Subtitle | "Get updates on product development, user growth, and technical milestones. No spam, just progress updates from a founder building the future." |
| Contact  | "For business inquiries: dj@build-os.com"                                                                                                       |

#### Final CTA Section

| Element       | Copy                                                                                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H2            | "Building for the AI Era"                                                                                                                                                                   |
| Subtitle      | "Join us in building the coordination layer for AI agents. As specialized agents proliferate, they need a central checkpoint for context and memory - BuildOS is building that foundation." |
| CTA           | "Connect"                                                                                                                                                                                   |
| Bullet Points | "• Investor inquiries welcome • Strategic partnerships • AI/productivity expertise valued"                                                                                                  |

---

### 8. Contact Page (`/contact`)

**Source:** `src/routes/contact/+page.svelte`
**Status:** ✅ EXTRACTED

#### SEO/Meta Copy

| Element          | Copy                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Title Tag        | "Contact BuildOS - Founded by DJ Wayne \| AI Productivity Platform"                                                             |
| Meta Description | "Contact BuildOS founder DJ Wayne. Building AI that organizes brain dumps into projects. A veteran solving productivity chaos." |

#### Header Section

| Element           | Copy                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| H1                | "Building BuildOS"                                                                                                        |
| Subtitle          | "AI that organizes your brain dumps into structured projects and tasks. Never lose information, build context as you go." |
| Credential Badges | "Veteran Founder" • "YC-backed startup experience" • "USMC Veteran"                                                       |

#### Action Cards

| Card       | Title             | Description                                                    | Badge            |
| ---------- | ----------------- | -------------------------------------------------------------- | ---------------- |
| Join Beta  | "Join Beta"       | "Early access to BuildOS - AI that organizes your brain dumps" | "Limited Access" |
| Feedback   | "Give Feedback"   | "Help shape the future of AI-native productivity"              | "Valued"         |
| Investment | "Investment Info" | "$250K pre-seed - Building the LLM productivity platform"      | "Active"         |

#### "The Problem We're Solving" Section

| Problem                 | Description                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| "Scattered Information" | "Thoughts spread across Notion, Obsidian, Apple Notes, random text files. Brilliant ideas lost in daily chaos." |
| "LLM Context Loss"      | "Constantly repeating project context to Claude/ChatGPT instead of building on previous conversations."         |

| Solution           | Bullets                                                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "BuildOS Solution" | • Brain dump → AI organizes automatically • Build rich project context over time • Copy/paste context to any LLM • Smart scheduling bridges thoughts to action |

#### Founder Section

| Element | Copy                                                                                                                                                        |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name    | "DJ Wayne"                                                                                                                                                  |
| Bio     | "Dad, former USMC Scout Sniper, creator of 9takes, Tiny Tribe Adventures, The Cadre Training. Software engineer with YC-backed startup experience (Curri)." |
| Tagline | "Brings technical depth and product vision to BuildOS."                                                                                                     |

#### Contact Methods

| Method   | Title              | Description                                                    |
| -------- | ------------------ | -------------------------------------------------------------- |
| LinkedIn | "BuildOS LinkedIn" | "Company updates, product launches, and professional insights" |
| Twitter  | "@build_os"        | "Building in public, product updates, AI productivity tips"    |
| Email    | "Direct Email"     | "Partnerships, investment, strategic discussions"              |

| Footer          | Copy                       |
| --------------- | -------------------------- |
| Response Notice | "Response within 24 hours" |

---

### 9. Privacy Policy (`/privacy`)

**Source:** `src/routes/privacy/+page.svelte`
**Status:** ✅ EXTRACTED

#### SEO/Meta Copy

| Element          | Copy                                                                                                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Title Tag        | "Privacy Policy - BuildOS \| Data Protection & User Privacy"                                                                                                           |
| Meta Description | "BuildOS privacy policy: Learn how we protect your data, handle brain dumps securely, and respect your privacy. GDPR compliant, data encrypted, you own your content." |

#### Header Section

| Element  | Copy                                                                     |
| -------- | ------------------------------------------------------------------------ |
| H1       | "Privacy Policy"                                                         |
| Subtitle | "Your privacy matters to us. Here's how we handle your data in BuildOS." |

#### "Privacy at a Glance" Section

| Card     | Title              | Description                                                           |
| -------- | ------------------ | --------------------------------------------------------------------- |
| Access   | "Access Your Data" | "View and export all your projects, tasks, and notes through the app" |
| Delete   | "Delete Your Data" | "Delete projects, tasks, and profile data directly in the app"        |
| No Sales | "No Data Sales"    | "We never sell your data or use it for advertising"                   |

#### Key Sections (Headers Only)

| Section | H2 Title                         |
| ------- | -------------------------------- |
| 1       | "Data We Collect"                |
| 2       | "How We Use Your Data"           |
| 3       | "Data Sharing with AI Providers" |
| 4       | "Third-Party Services"           |
| 5       | "SMS Notifications"              |
| 6       | "Google API Data Use"            |
| 7       | "Your Data Rights"               |
| 8       | "Security"                       |
| 9       | "About BuildOS"                  |
| 10      | "Updates to This Policy"         |

#### Important Callout (AI Processing)

| Element | Copy                                                                                                                                                                                                                                            |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Title   | "Important: AI Processing"                                                                                                                                                                                                                      |
| Body    | "To provide AI-powered insights, we send your project data, task information, brain dumps, and onboarding responses to AI providers including OpenAI and Anthropic. This data is processed to organize and enhance your productivity workflow." |

#### CTA Section

| Element | Copy                                     |
| ------- | ---------------------------------------- |
| H3      | "Questions about your data?"             |
| Body    | "We're here to help. Reach out anytime." |
| CTA     | "Contact Us"                             |

---

### 10. Terms of Service (`/terms`)

**Source:** `src/routes/terms/+page.svelte`
**Status:** ✅ EXTRACTED

#### SEO/Meta Copy

| Element          | Copy                                                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Title Tag        | "Terms of Service - BuildOS \| Legal Terms & Conditions"                                                                                                                                   |
| Meta Description | "BuildOS Terms of Service: Simple, fair legal terms for using our AI-powered productivity platform. Last updated December 2024. User agreements, content ownership, and usage guidelines." |

#### Header Section

| Element  | Copy                                                                                       |
| -------- | ------------------------------------------------------------------------------------------ |
| H1       | "Terms of Service"                                                                         |
| Subtitle | "The legal terms that govern your use of BuildOS. We've tried to keep it simple and fair." |

#### "Key Points" Section

| Point | Title           | Description                                       |
| ----- | --------------- | ------------------------------------------------- |
| 1     | "Fair Use"      | "Use BuildOS responsibly and legally"             |
| 2     | "Your Content"  | "You own your data, we just help you organize it" |
| 3     | "AI Processing" | "Content sent to AI providers for insights"       |
| 4     | "Subscription"  | "Free now, subscription model coming soon"        |

#### Key Callouts

| Callout | Title                            | Copy                                                                                                                                                                                                                                                       |
| ------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pricing | "Current Status: Free Access"    | "BuildOS is currently free to use. We plan to introduce a subscription model in the near future, processed through Stripe. Free tier users will be limited to 3 projects when the subscription model launches."                                            |
| Content | "Your Content Belongs to You"    | "You retain all rights to the content you create in BuildOS. We claim no ownership over your brain dumps, projects, goals, or any other content you input into the service."                                                                               |
| AI      | "AI Processing Notice"           | "To provide AI-powered insights, your project data, tasks, brain dumps, and onboarding responses are sent to third-party AI providers including OpenAI and Anthropic. Only content necessary for organizing and enhancing your productivity is processed." |
| SMS     | "SMS Notifications Are Optional" | "BuildOS offers optional SMS notifications to help you stay on track with your tasks and schedule. You are never required to provide your phone number or enable SMS notifications to use BuildOS."                                                        |

#### CTA Section

| Element | Copy                                                     |
| ------- | -------------------------------------------------------- |
| H3      | "Ready to start building?"                               |
| Body    | "Join BuildOS and transform how you organize your life." |
| CTA     | "Get Started"                                            |

---

### 11. Roadmap Page (`/road-map`)

**Source:** `src/routes/road-map/+page.svelte`
**Status:** ✅ EXTRACTED

#### SEO/Meta Copy

| Element          | Copy                                                                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Title Tag        | "Roadmap - BuildOS \| AI-Powered Project Management Development Timeline"                                                                 |
| Meta Description | "Detailed BuildOS development roadmap with monthly milestones. Track our progress building the AI co-pilot for chaotic, idea-rich minds." |

#### Header Section

| Element      | Copy                                                                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| H1           | "BuildOS Roadmap"                                                                                                                              |
| Last Updated | "August 10, 2025"                                                                                                                              |
| Mission Box  | "Build the AI co-pilot for your chaotic, idea-rich mind. Users brain dump → AI organizes everything → Users execute → Projects get completed." |

#### Status Legend

| Status | Label           |
| ------ | --------------- |
| ✓      | "Live"          |
| 🔧     | "In Progress"   |
| 📅     | "Planned"       |
| ✨     | "Future Vision" |

#### Timeline Sections

| Month          | Status           | Key Features                                                                                             |
| -------------- | ---------------- | -------------------------------------------------------------------------------------------------------- |
| July 2025      | Live             | Core Brain Dump & Project System, Smart Task & Calendar Management, User Experience & Infrastructure     |
| August 2025    | In Progress      | Phase-to-Calendar Scheduling, Smart Time Blocking, Feedback Portal, Adjustable Briefs, Task Workbench    |
| September 2025 | Planned          | Tagging & Search, Project Brief interaction, Recurring Tasks, Pricing gate activation, Discord Community |
| October 2025   | Next Phase       | Project Intelligence Engine (Beta) - Completion Scoring, Proactive Prompts, Smart Synthesis              |
| November 2025  | Advanced         | Predictive Project Management, Unified Interface Evolution                                               |
| December 2025  | Premium Launch   | Premium Synthesis Features, Complete Life Integration                                                    |
| 2026+          | Long-term Vision | AI Operating System for Projects - Graph Mapping, Mobile App, Agent Integration                          |

#### Footer CTA

| Element       | Copy                                                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| H2            | "Help Shape the Future"                                                                                                 |
| Body          | "Join our beta community and work directly with us to influence this roadmap. Your feedback drives what we build next." |
| CTA Primary   | "Join Beta Program"                                                                                                     |
| CTA Secondary | "Share Feedback"                                                                                                        |
| Trust Signal  | "Free during beta • Direct founder access • Shape product direction"                                                    |

---

### 12. Authentication Pages

#### Login Page (`/auth/login`)

**Source:** `src/routes/auth/login/+page.svelte`
**Status:** ✅ EXTRACTED

| Element          | Copy                                                                                                                                               | Notes   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Title Tag        | "Sign In - BuildOS \| AI-First Project Organization"                                                                                               | noindex |
| Meta Description | "Sign in to BuildOS to access your projects, brain dumps, and AI-powered productivity tools. Transform scattered thoughts into structured action." |         |
| H2               | "Welcome back"                                                                                                                                     |         |
| Subtitle         | "Sign in to your BuildOS account"                                                                                                                  |         |
| Google CTA       | "Continue with Google"                                                                                                                             |         |
| Divider          | "Or continue with email"                                                                                                                           |         |
| Form Labels      | "Email address _", "Password _"                                                                                                                    |         |
| Link             | "Forgot your password?"                                                                                                                            |         |
| Submit CTA       | "Sign in"                                                                                                                                          |         |
| Footer Link      | "Don't have an account? Create one now"                                                                                                            |         |

#### Register Page (`/auth/register`)

**Source:** `src/routes/auth/register/+page.svelte`
**Status:** ✅ EXTRACTED

| Element          | Copy                                                                                                                                                                               | Notes   |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Title Tag        | "Sign Up - BuildOS \| Start Your 14-Day Free Trial"                                                                                                                                | noindex |
| Meta Description | "Create your BuildOS account and transform brain dumps into structured projects. AI-powered project organization for ADHD minds, founders, and creators. No credit card required." |         |
| H2               | "Join BuildOS"                                                                                                                                                                     |         |
| Subtitle         | "Create your personal operating system"                                                                                                                                            |         |
| Google CTA       | "Continue with Google"                                                                                                                                                             |         |
| Divider          | "Or create account with email"                                                                                                                                                     |         |
| Form Labels      | "Full name (Optional)", "Email address _", "Password _", "Confirm password \*"                                                                                                     |         |
| Submit CTA       | "Create account"                                                                                                                                                                   |         |
| Legal            | "By signing up, you agree to our terms of service and privacy policy."                                                                                                             |         |
| Footer Link      | "Already have an account? Sign in here"                                                                                                                                            |         |
| Success Message  | "Check your email! Registration successful! Please check your email to confirm your account before signing in."                                                                    |         |
| Welcome Toast    | "Welcome to BuildOS! Your account has been created successfully."                                                                                                                  |         |

#### Forgot Password Page (`/auth/forgot-password`)

**Source:** `src/routes/auth/forgot-password/+page.svelte`
**Status:** ✅ EXTRACTED

| Element     | Copy                                                                         |
| ----------- | ---------------------------------------------------------------------------- |
| Title Tag   | "Forgot Password - BuildOS"                                                  |
| H2          | "Reset your password"                                                        |
| Subtitle    | "Enter your email address and we'll send you a link to reset your password." |
| Form Label  | "Email address \*"                                                           |
| Submit CTA  | "Send reset link"                                                            |
| Footer Link | "← Back to sign in"                                                          |

---

### 13. Blog Content Index

**Source:** `src/content/blogs/`
**Status:** ✅ KEY POSTS INDEXED

#### Blog Content Strategy

See `src/content/BLOG_CONTENT_STRATEGY.md` for full strategy, SEO keywords, and publishing schedule.

#### Key SEO/Conversion Blog Posts

| Post                                          | Title                                                   | Target Persona           | Core Message                                                                  |
| --------------------------------------------- | ------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------- |
| `buildos-vs-notion-adhd-minds.md`             | "The Hidden Cost of Notion's Complexity for ADHD Minds" | ADHD founder             | "ADHD minds lose 15 hours/month to complexity tax. BuildOS removes friction." |
| `buildos-vs-monday-thought-organization.md`   | "BuildOS vs Monday.com: Thought Organization Showdown"  | Overwhelmed professional | "Monday = rigid workflows, BuildOS = adaptive to your thinking"               |
| `buildos-vs-obsidian-knowledge-management.md` | "BuildOS vs Obsidian: Knowledge Management Face-Off"    | Power user               | "Obsidian = manual linking, BuildOS = AI-powered context extraction"          |
| `vision-deserves-better-operating-system.md`  | "Your Vision Deserves a Better Operating System"        | Empire builder/founder   | "BuildOS is the operating system for ambitious thought"                       |

#### Key Headlines from Blog Posts

| Source    | Headline                                                                                                                               | Intent                 |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| vs-notion | "The Hidden Cost of Notion's Complexity for ADHD Minds"                                                                                | position/differentiate |
| vs-notion | "ADHD minds spend 73% of their 'productivity' time learning, configuring, and maintaining their Notion workspaces"                     | social_proof/problem   |
| vs-notion | "The average ADHD professional loses 15 hours per month to... the 'complexity tax'"                                                    | quantify_problem       |
| vs-notion | "For ADHD minds, infinite flexibility equals infinite paralysis"                                                                       | explain_problem        |
| vs-notion | "Disorganized minds don't need better organization systems. They need zero friction."                                                  | core_insight           |
| vs-notion | "Your disorganization isn't a personal failure. It's a tool problem."                                                                  | no_shame               |
| vs-notion | "We didn't build BuildOS to compete with Notion. We built it because people struggling with organization were drowning in complexity"  | differentiate          |
| vs-notion | "Other tools require me to be at my best. BuildOS works when I'm at my worst."                                                         | testimonial            |
| vision    | "Your Vision Deserves a Better Operating System"                                                                                       | position               |
| vision    | "Not for people who need to 'get organized.' For people who are building something that exceeds the capacity of human working memory." | differentiate          |
| vision    | "The bottleneck isn't task management. It's context preservation."                                                                     | core_insight           |
| vision    | "We're not building a productivity app. We're building the operating system for ambitious thought."                                    | position               |
| vision    | "Where Notion gives you a canvas, BuildOS gives you continuity. Where Linear gives you tickets, BuildOS gives you rationale."          | differentiate          |
| vision    | "Your empire deserves better infrastructure."                                                                                          | inspire                |

#### Blog Categories

| Category              | Posts | Status      | Focus                                                |
| --------------------- | ----- | ----------- | ---------------------------------------------------- |
| **Getting Started**   | 4     | ✅ Complete | Onboarding, brain dump basics, first project         |
| **Philosophy**        | 6     | Partial     | Vision, anti-AI-assistant, PKM future                |
| **Productivity Tips** | 6     | Partial     | Context engineering, calendar workflow, focus        |
| **Advanced Guides**   | 5     | Partial     | Task dependencies, API workflows, power user         |
| **Case Studies**      | 4     | Pending     | Founder, creative, academic, remote team             |
| **Product Updates**   | 4     | Pending     | Beta launch, calendar, dynamic context, phases       |
| **Comparison Posts**  | 4     | ✅ Priority | vs Notion, vs Monday, vs Obsidian, Talking/Listening |

#### Key Taglines from Blogs

- "Your disorganization isn't a personal failure. It's a tool problem."
- "BuildOS: The operating system for ambitious thought."
- "Not another app to manage. The one place where your scattered thoughts finally come together."
- "Remove friction, unlock potential."
- "BuildOS doesn't try to 'fix' your brain. It amplifies what makes you brilliant."
- "You don't need to be organized to get organized."

---

### 14. Resource Pages (Docs, Help, Feedback)

#### Documentation Page (`/docs`)

**Source:** `src/routes/docs/+page.svelte`
**Status:** ✅ EXTRACTED

| Element          | Copy                                                                                                                                                                       | Notes |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Title Tag        | "Documentation - BuildOS \| Complete Guide to AI-Native Productivity"                                                                                                      |       |
| Meta Description | "Complete documentation for BuildOS. Learn how to transform brain dumps into organized projects with AI-powered context building, daily briefs, and calendar integration." |       |
| H1               | "BuildOS Documentation"                                                                                                                                                    |       |
| Subtitle         | "Learn how to transform scattered thoughts into organized action with AI-powered context building and smart project management."                                           |       |
| CTA Primary      | "Quick Start Guide"                                                                                                                                                        |       |
| CTA Secondary    | "How It Works"                                                                                                                                                             |       |
| Pro Tip          | "Think in Projects: Always frame your brain dumps as projects with clear goals, phases, current state, and blockers."                                                      |       |
| Footer H2        | "Ready to Start Building?"                                                                                                                                                 |       |
| Footer Body      | "Transform your scattered thoughts into organized action with BuildOS's AI-powered project management."                                                                    |       |

**Key Section Headers:**

- Getting Started
- Key Pages & Navigation
- How BuildOS Works
- Brain Dump: The Starting Point
- Project Context: Your AI Collaboration Engine
- Phases & Task Management
- Calendar Integration
- Daily Briefs
- LLM Integration: Your AI Collaboration Advantage

#### Help Center (`/help`)

**Source:** `src/routes/help/+page.svelte`
**Status:** ✅ EXTRACTED

| Element          | Copy                                                                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Title Tag        | "Help Center - BuildOS \| Guides, Tutorials & Support"                                                                                                    |
| Meta Description | "Get help with BuildOS. Comprehensive tutorials, guides, and answers to common questions about transforming brain dumps into organized projects with AI." |
| H1               | "How can we help you?"                                                                                                                                    |
| Subtitle         | "Get the most out of BuildOS with our guides, tutorials, and support resources."                                                                          |
| Quick Start H2   | "Quick Start Guide"                                                                                                                                       |
| Quick Start Body | "Get up and running with BuildOS in minutes"                                                                                                              |

**Quick Start Steps:**
| Step | Title | Description |
|------|-------|-------------|
| 1 | "Brain Dump" | "Start by capturing all your thoughts and ideas" |
| 2 | "Organize" | "Let AI help structure your thoughts into projects" |
| 3 | "Set Goals" | "Define your life goals and connect them to tasks" |
| 4 | "Execute" | "Use daily briefs to stay on track" |

**Browse Categories:**

- Getting Started
- Productivity Tips
- Advanced Guides

**Still Need Help Section:**
| Element | Copy |
|---------|------|
| H2 | "Still need help?" |
| Body | "Can't find what you're looking for? We're here to help." |
| CTA | "Send Feedback" |

**Beta Notice:**
| Element | Copy |
|---------|------|
| H3 | "BuildOS is in Beta" |
| Body | "We're constantly improving and adding new features. If you encounter any issues or have suggestions, please let us know!" |

#### Feedback Page (`/feedback`)

**Source:** `src/routes/feedback/+page.svelte`
**Status:** ✅ EXTRACTED

| Element          | Copy                                                                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Title Tag        | "Feedback - BuildOS \| Share Your Thoughts & Ideas"                                                                                                                  |
| Meta Description | "Help us improve BuildOS. Share your feedback, report bugs, request new features, or ask questions. Your input directly shapes our AI-native productivity platform." |
| H1               | "Your Feedback is hella important"                                                                                                                                   |
| Subtitle         | "Help us build the best personal operating system by sharing your thoughts, ideas, and experiences."                                                                 |
| Trust Signal     | "Built with love by two founders who read every message"                                                                                                             |

**Feedback Categories:**

- Feature Request
- Bug Report
- Improvement
- General Feedback

**Why Feedback Matters Section:**
| Card | Title | Description |
|------|-------|-------------|
| 1 | "Direct Impact" | "Your suggestions often get implemented within days. Every piece of feedback is read by the founder personally." |
| 2 | "Community Building" | "Help us build a community of productive, goal-oriented individuals who support each other's growth." |
| 3 | "Rapid Iteration" | "We ship features fast. Your feedback helps us prioritize what matters most to our users." |

**Success Message:**
| Element | Copy |
|---------|------|
| H2 | "Thank You for Your Feedback!" |
| Body | "Your feedback has been submitted successfully. DJ will review it personally and may reach out if you provided your email address." |

---

## Value Pillars (Draft)

Based on existing copy patterns, here are the emerging value pillars:

| Pillar ID                 | Name                          | Description                                             |
| ------------------------- | ----------------------------- | ------------------------------------------------------- |
| `brain_dump_to_structure` | Brain Dump → Structure        | Transform unstructured thoughts into organized projects |
| `calendar_execution`      | Calendar-Integrated Execution | Schedule tasks directly into your calendar              |
| `adhd_friendly`           | ADHD-Friendly Design          | Built for scattered minds, no shame approach            |
| `context_over_chaos`      | Context Over Chaos            | AI maintains context across all your work               |
| `ai_native`               | AI-Native Architecture        | Built for the AI era, not retrofitted                   |

---

## Persona Definitions

| Persona ID                 | Name                      | Key Concerns                                           | Tone Preferences               |
| -------------------------- | ------------------------- | ------------------------------------------------------ | ------------------------------ |
| `adhd_founder`             | ADHD Founder/Entrepreneur | Executive function support, no shame, quick wins       | Empathetic, no shame, direct   |
| `overwhelmed_professional` | Overwhelmed Professional  | Too many tools, scattered information, time management | Professional, solution-focused |
| `student_creator`          | Student/Creator           | Budget, flexibility, creative workflow                 | Playful, aspirational          |
| `investor`                 | Investor                  | Market opportunity, team, technology, traction         | Professional, data-driven      |
| `power_user`               | Power User                | Advanced features, customization, integrations         | Technical, detailed            |

---

## Key Messaging Patterns

### Core Promise

> "Project organization built for the AI era"

### Taglines (in use)

- "Your thoughts, organized. Your next step, clear."
- "Transform thoughts into structured productivity with AI-powered organization."
- "Your brain isn't broken. Your tools are."
- "No complex setup. No maintenance guilt."
- "From brain dump to organized projects in literally one minute."

### Differentiation Claims

- AI-Native Architecture (not retrofitted)
- Voice-First Design
- Transparent Context Engine
- ADHD-friendly (built for scattered minds)

---

## Analysis Checklist

After extracting all copy, analyze:

### A. Positioning & Category Language

- [ ] Is there ONE clear promise repeated everywhere?
- [ ] Is category framing consistent? (AI productivity platform vs project OS vs second brain)
- [ ] Are target personas consistently referenced?

### B. Problem → Outcome → Mechanism Chain

- [ ] Each major section has problem statement?
- [ ] Desired outcome is clear?
- [ ] Mechanism (how it works) is explained?

### C. Feature → Benefit Mapping

- [ ] Every feature has an explicit benefit?
- [ ] Benefits align with persona concerns?

### D. CTA Coherence

- [ ] CTAs match page intent/funnel stage?
- [ ] Consistent CTA language across pages?

### E. Tone Consistency

- [ ] Voice recognizable across all pages?
- [ ] Investor pages appropriately formal?
- [ ] Blog tone matches homepage?

---

## Next Steps

### Completed ✅

1. ~~**Extract homepage copy**~~ - Full index of hero, pillars, personas, CTAs
2. ~~**Extract pricing copy**~~ - Plan details, FAQ, objection handling
3. ~~**Extract beta copy**~~ - Benefits, form labels, CTAs
4. ~~**Extract about/investors**~~ - Founder story, technical claims, roadmap
5. ~~**Extract contact page**~~ - Action cards, problem statement, contact methods
6. ~~**Extract legal pages**~~ - Privacy policy, terms of service
7. ~~**Extract roadmap page**~~ - Timeline, features, mission
8. ~~**Extract auth pages**~~ - Login, register, forgot password
9. ~~**Index blog post headlines**~~ - Key posts and messaging patterns captured
10. ~~**Extract Docs/Help/Feedback pages**~~ - Resource pages copy

### Remaining

1. **Index full blog post content** - Full content for all 30+ posts (key posts indexed, headlines captured)
2. **Index Blog Index page** - `/blogs` listing page copy
3. **Create analysis spreadsheet** - Move to structured format for filtering/sorting
4. **Run messaging consistency audit** - Apply analysis checklist across all indexed copy
5. **Identify gaps** - Missing personas, benefits without proof, inconsistent messaging
6. **Build persona × value-pillar matrix** - Map copy to personas and pillars

---

## Notes

- Blog content has a documented strategy in `src/content/BLOG_CONTENT_STRATEGY.md`
- Many blog posts are in various states of completion (see strategy doc for status)
- Comparison posts are high priority for SEO/conversion
- Some pages may have dynamic copy based on auth state (nav, footer)
