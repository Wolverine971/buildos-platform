<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/ui_ux_quality_review/evals.md -->

# Evals — ui_ux_quality_review

Golden tasks per `../../EVALS_GUIDE.md`. Run with/without the skill (shell + all three references for Run B), judge blind against the markers.

---

## Task 1 — AI-generated dashboard review (smoke-test path)

### Task prompt

> I generated this analytics dashboard with v0 and want a UI review before I ship it. The user's job on this screen is to check this week's signup numbers and export a report. Here's the markup (Tailwind):
>
> ```html
> <div class="min-h-screen bg-indigo-600 p-4">
> 	<header class="flex items-center justify-between p-[13px]">
> 		<h1 class="text-[22px] font-bold text-white">Acme Analytics</h1>
> 		<span class="text-gray-400 text-sm">Last synced 2 min ago</span>
> 	</header>
>
> 	<div class="grid grid-cols-3 gap-4 mt-4">
> 		<div class="rounded-2xl shadow-md border border-gray-200 bg-white p-4">
> 			<p class="text-gray-400 text-xs">Signups</p>
> 			<p class="text-2xl font-bold">1,284</p>
> 			<button
> 				class="mt-2 h-6 px-2 text-xs bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-2xl hover:opacity-90"
> 			>
> 				Export
> 			</button>
> 		</div>
> 		<div class="rounded-2xl shadow-md border border-gray-200 bg-white p-4">
> 			<p class="text-gray-400 text-xs">Revenue</p>
> 			<p class="text-2xl font-bold">$8,902</p>
> 			<button
> 				class="mt-2 h-6 px-2 text-xs bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg hover:opacity-90"
> 			>
> 				Export
> 			</button>
> 		</div>
> 		<div class="rounded-2xl shadow-md border border-gray-200 bg-white p-4">
> 			<p class="text-gray-400 text-xs">Churn</p>
> 			<p class="text-2xl font-bold">2.1%</p>
> 			<button
> 				class="mt-2 h-6 px-2 text-xs bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg hover:opacity-90"
> 			>
> 				Export
> 			</button>
> 		</div>
> 	</div>
>
> 	<!-- Signups this week (7 days) -->
> 	<div class="rounded-2xl shadow-md border border-gray-200 bg-white p-4 mt-4">
> 		<h2 class="text-[15px] font-bold uppercase">Signups This Week</h2>
> 		<div class="flex items-end gap-1 h-32 mt-3">
> 			<!-- 16 bars rendered for the 7-day range -->
> 			<div
> 				class="w-3 h-10 rounded-t-full bg-gradient-to-t from-blue-500 to-purple-400"
> 			></div>
> 			<div
> 				class="w-3 h-14 rounded-t-full bg-gradient-to-t from-blue-500 to-purple-400"
> 			></div>
> 			<div
> 				class="w-3 h-8  rounded-t-full bg-gradient-to-t from-blue-500 to-purple-400"
> 			></div>
> 			<!-- ...13 more identical bars, 16 total, no y-axis labels... -->
> 		</div>
> 	</div>
>
> 	<div class="rounded-2xl shadow-md border border-gray-200 bg-white p-4 mt-4">
> 		<h2 class="text-[15px] font-bold">Recent Signups</h2>
> 		<!-- list renders nothing at all when the array is empty -->
> 		<ul id="signup-list" class="mt-2 space-y-[7px]"></ul>
> 		<div class="hidden text-red-500" id="error">Something went wrong</div>
> 	</div>
> </div>
> ```
>
> The export button calls an API that takes ~3 seconds. Give me your findings.

### Delta markers

1. **M1 (output contract):** Every finding uses the canonical shape — `Area / Finding / Evidence / Severity / Fix` — and Evidence cites a concrete class string or component from the fixture.
2. **M2 (smoke test, named patterns):** Identifies ≥3 AI-slop fingerprints **by pattern**: `rounded-2xl + shadow-md + border` stacking ("pick one"), the `from-blue-500 to-purple-500` AI gradient, and `text-gray-400` muted-everything.
3. **M3 (closed spacing scale):** Flags `p-[13px]` and `space-y-[7px]` as off the closed 4/8/12/16/24/32/48/64/96 scale — cited as a scale violation, not generic "inconsistent spacing".
4. **M4 (closed type scale):** Flags `text-[22px]` and `text-[15px]` against the closed type scale (16, 20, 24, 28, 32, 40, 48, 64).
5. **M5 (color rule):** Flags `text-gray-400` on the `bg-indigo-600` header with the specific fix — lighter same-hue S/B variant via hue rotation, not lightness/grey.
6. **M6 (chart rules):** Flags 16 bars for 7 days (one bar per data point), rounded bar tops, missing y-axis labels, and gradient-filled data series — at least 3 of these 4, as chart-specific rules.
7. **M7 (feedback threshold):** Flags the ~3s export with the ≥200ms async-loading rule (spinner/skeleton required) and the missing focus/active/disabled states (only `hover:` present).
8. **M8 (empty state + error copy):** Flags the empty `#signup-list` (empty state needs icon/CTA/helper text, not nothing) AND "Something went wrong" as an error message that names neither cause nor next step.
9. **M9 (touch target):** Flags `h-6` (24px) export buttons against the ≥44px touch-target floor.
10. **M10 (consistency):** Flags `rounded-2xl` vs `rounded-lg` drift across the three same-type stat-card buttons (same-type components share every value).
11. **M11 (severity rubric):** Every finding carries a severity, and at least one high-severity is justified by the rubric (task-blocking or contrast < 4.5:1) — not assigned by feel.
12. **M12 (stop condition):** Output ends with a ranked top-3 fixes list, and at least one out-of-scope concern is tagged `Delegated:` to a named sibling (e.g. `visual_craft_fundamentals`) rather than dropped.

### Expected load path

- `skill_load(ui_ux_quality_review, full)` — the `## Output` contract and severity rubric are outside the short-format parsed sections.
- References: `ai_ui_smoke_test` (AI-generated UI declared — workflow step 2 runs it first), then `foundation_checks` (areas 1–6), then `polish_and_fit_checks` (chart + feedback + responsive present).
- Should NOT load: any sibling skill (`visual_craft_fundamentals`, `accessibility_inclusive_ui_review`) — escalations are tags, not loads.

### Discovery probe

"I built this dashboard with v0 — can you review the UI before I ship it?" → catalog description matches on "screen and flow review … includes an AI-generated-UI smoke test."

---

## Task 2 — "Fix my typography" (single-reference path)

### Task prompt

> My settings page typography feels off but I can't say why. The job here is updating profile info. Don't redesign the page — just tell me what's wrong with the type and how to fix it. Markup:
>
> ```html
> <main class="max-w-2xl mx-auto bg-white p-8">
> 	<h1 class="font-serif text-[44px] leading-relaxed tracking-wide font-bold">
> 		Account Settings
> 	</h1>
> 	<p class="text-[15px] text-gray-400 leading-none mt-1">
> 		Manage your profile, billing, and notification preferences for your account.
> 	</p>
>
> 	<section class="mt-8">
> 		<h2 class="font-serif text-[26px] font-bold">Profile</h2>
> 		<h3 class="text-[19px] font-semibold mt-4">Display Name</h3>
> 		<input class="mt-1 border rounded px-3 py-2 text-base w-full" value="DJ" />
> 		<h3 class="text-[17px] font-medium mt-4">Bio</h3>
> 		<textarea class="mt-1 border rounded px-3 py-2 text-base w-full">
> Building things.</textarea
> 		>
> 	</section>
>
> 	<section class="mt-8">
> 		<h2 class="font-serif text-[26px] font-bold">Billing History</h2>
> 		<table class="w-full mt-2 text-base">
> 			<thead>
> 				<tr>
> 					<th class="text-[24px] font-bold text-left">Date</th>
> 					<th class="text-[24px] font-bold text-left">Amount</th>
> 				</tr>
> 			</thead>
> 			<tbody>
> 				<tr>
> 					<td>May 1</td>
> 					<td>$20</td>
> 				</tr>
> 			</tbody>
> 		</table>
> 	</section>
>
> 	<button class="mt-8 bg-blue-600 text-white px-4 py-2 rounded font-bold uppercase">
> 		Save changes
> 	</button>
> 	<!-- Save calls a ~2s API; the button gives no feedback and stays clickable -->
> </main>
> ```

### Delta markers

1. **M1 (output contract):** Findings use the canonical `Area / Finding / Evidence / Severity / Fix` shape with class-string evidence.
2. **M2 (closed type scale):** Flags `text-[44px]`, `text-[26px]`, `text-[19px]`, `text-[17px]`, `text-[15px]` against the closed scale (16, 20, 24, 28, 32, 40, 48, 64) and prescribes on-scale replacements.
3. **M3 (heading levels):** Flags 4 heading sizes (44/26/19/17) against the 2–3 levels max rule.
4. **M4 (line-height inverse rule):** Flags `leading-relaxed` on the 44px headline (display ≈ 1.0×) and `leading-none` on body text (body ≈ 1.5×) — cites the inverse-proportion rule, not generic "fix line height".
5. **M5 (letter-spacing inverse rule):** Flags `tracking-wide` on the display headline — display sizes tighten (~−0.01em), they don't loosen.
6. **M6 (one font in product UI):** Flags the serif/sans pairing inside a product surface (pair with display only on marketing surfaces).
7. **M7 (contrast threshold):** Flags `text-gray-400` body text on white against the ≥4.5:1 floor, severity high per the rubric.
8. **M8 (table headings rule):** Flags the 24px-bold `<th>` cells — headings as labels in tables: small, bold, uppercase, softer color.
9. **M9 (blocking flow flag):** Despite the typography-only ask, flags the Save button's missing loading/disabled feedback (≥200ms async rule) — workflow step 5: targeted reviews still flag blocking flow issues.
10. **M10 (scope discipline):** Does NOT produce a full 11-area audit; non-typography cosmetic concerns are either omitted or tagged `Delegated:`, not expanded.

### Expected load path

- `skill_load(ui_ux_quality_review, full)`.
- References: `foundation_checks` ONLY (typography is area 4; the targeted-question rule in workflow step 5 says load just the covering reference).
- Should NOT load: `polish_and_fit_checks`, `ai_ui_smoke_test` — loading either is an over-load for this task.

### Discovery probe

"Something's off with the typography on my settings page — fix it." → description matches on "review across hierarchy, clarity, spacing, type, color…".

---

## Results log

<!-- Append per EVALS_GUIDE.md. Template: -->
<!--
### YYYY-MM-DD — Task N — performer: <model>, judge: <model>
| Marker | A (without) | B (with) |
| --- | --- | --- |
| M1 | miss | hit |
Verdict: STRONG/WEAK/NO DELTA. Load path: as expected / deviations. Discovery probe: pass/fail.
Notes:
-->

### 2026-06-10 — Task 1 — performer: Fable 5 (subagents), judge: Fable 5 (blind, X/Y labels)

| Marker                        | A (without) | B (with) |
| ----------------------------- | ----------- | -------- |
| M1 output contract            | miss        | hit      |
| M2 named AI-slop fingerprints | miss        | hit      |
| M3 closed spacing scale       | miss        | hit      |
| M4 closed type scale          | miss        | hit      |
| M5 hue-rotation color fix     | hit         | hit      |
| M6 chart rules (3 of 4)       | hit         | hit      |
| M7 200ms threshold + states   | miss        | hit      |
| M8 empty state + error copy   | hit         | hit      |
| M9 44px touch target          | hit         | hit      |
| M10 radius consistency drift  | hit         | hit      |
| M11 severity rubric           | hit         | hit      |
| M12 top-3 + Delegated tag     | miss        | hit      |

Verdict: **STRONG DELTA (6/12 → 12/12).** Load path: exactly as expected — SKILL.md → `ai_ui_smoke_test` (step 2, AI-generated UI declared) → `foundation_checks` → `polish_and_fit_checks`. No sibling over-loads. Discovery probe: not run this pass.
Notes: The 6/12 baseline shows the model is already a competent free-form UI reviewer — the skill's delta concentrated in named patterns, closed scales, explicit thresholds, the canonical output shape, and scope discipline (Delegated tags). Judge: the without-run was "richer in remediation artifacts and engineering nuance" (revised markup, `aria-live`, double-submit guard); the with-run "more systematic, more auditable, more consistently evidence-anchored." Possible v2 improvement: an output-contract field for an optional remediation sketch.

2026-06-11 — Task 1 with-skill output trimmed and embedded as ## Worked Example in SKILL.md.
