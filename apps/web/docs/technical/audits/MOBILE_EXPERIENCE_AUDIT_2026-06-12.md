<!-- apps/web/docs/technical/audits/MOBILE_EXPERIENCE_AUDIT_2026-06-12.md -->

# Mobile Experience Audit — 2026-06-12

Full-system audit of BuildOS web on mobile/iPhone: modals, inputs, responsive layout, iOS-specific behavior. Scope: all 56 `*Modal*` components, form primitives, main routes at 390px, global CSS/JS infrastructure.

**Verdict:** The foundation is excellent (base `Modal.svelte`, `keyboard-avoiding.ts`, `body-scroll-lock.ts`, global input CSS). Bugs live in the places that forked or bypassed that foundation — `BriefChatModal`, hand-rolled page-level bottom bars, and one CSS specificity hole.

**Owner priorities:** high information density (compact = good), iPhone cleanliness, real bugs. Touch-target size dogma explicitly NOT a concern.

---

## Fix tracker

### Tier 1 — highest-traffic bugs (FIXED 2026-06-12)

- [x] **T1.1** Dead "Calendar" toggle — `src/routes/time-blocks/+page.svelte:262` — `onclick={() => displayMode === 'calendar'}` is a comparison, not assignment. Once in List view, no way back without clearing localStorage.
- [x] **T1.2** BriefChatModal keyboard — `src/lib/components/briefs/BriefChatModal.svelte:393` — container height is `calc(100dvh - safe-areas)` but never consumes `--keyboard-height` (set by embedded AgentChatModal). iOS keyboard covers the composer in the Chat tab. Fix: subtract `var(--keyboard-height, 0px)`.
- [x] **T1.3** BriefChatModal dead backdrop — `:219-228` — backdrop click handler at `z-[9998]` sits under a full-screen `z-[9999]` sibling with no handler; tap-outside-to-close never fires.
- [x] **T1.4** BriefChatModal double-close — `:222-223` — binds both `onclick` and `ontouchend` to the backdrop handler; on iOS touchend + synthetic click → `onClose` fires twice. Base Modal documents removing this exact pattern (`Modal.svelte:568-573`).
- [x] **T1.5** BriefChatModal Escape not stack-aware — `:87-93` — `svelte:window` Escape listener independent of base Modal's stack; a confirmation modal on top + one Escape closes both. Same flaw: `scheduling/CalendarItemDrawer.svelte:12-23`.

### Tier 2 — iOS zoom hole (FIXED 2026-06-12 — global mobile rule in app.css + Select.svelte sm size + ProjectGraphSection !important offender + CodeMirror theme media query)

- [x] **T2.1** `src/app.css:43-44` — the `input:not(...)` selector (0,5,1) beats `.text-sm` but bare `textarea`/`select` (0,0,1) LOSE to it. Every textarea/select with `text-sm`/`text-xs` renders 14px/12px → Safari zoom-on-focus. ~20 user-facing offenders incl. `Select.svelte:147` (every size="sm"), `PublicPageComments.svelte:324`, `ProjectGraphSection.svelte:153` (`!text-[10px]`, worst). Fix: raise textarea/select selector specificity to match input rule.
- [x] **T2.2** CodeMirror zooms — `src/lib/components/ui/codemirror/inkprint-theme.ts:23` — hardcoded `fontSize: '14px'` on contenteditable `.cm-content`, uncovered by the app.css rule. Document editor zooms on focus. Fix: 16px floor on mobile.

### Tier 3 — felt every session (FIXED 2026-06-12)

- [x] **T3.1** Task save bar in home-indicator zone — `src/routes/projects/[id]/tasks/[task_id]/+page.svelte:1370` — `fixed bottom-0 py-2.5` without `env(safe-area-inset-bottom)`. Spacer at `:1396` (`h-16`) also inset-unaware.
- [x] **T3.2** Document save bar — same pattern, `src/routes/projects/[id]/documents/[document_id]/+page.svelte:586`.
- [x] **T3.3** Smooth-scroll jank on modal close — `src/lib/utils/body-scroll-lock.ts:34,86` — `window.scrollTo(0, y)` honors `html { scroll-behavior: smooth }` (`app.css:15`), animating the restoration. Fix: `behavior: 'instant'`.

### Tier 4 — structural (FIXED 2026-06-12)

- [x] **T4.1** FormModal action buttons inside scrollable content — `src/lib/components/ui/FormModal.svelte:638-719` — submit/cancel/delete in children snippet, scrolls out of view on long forms. Move to footer snippet. Also inert `flex-1 min-h-0`/`overflow-y-auto` declarations at `:403,419` (`.modal-content` is a block container). DONE: footer snippet + `form={formId}` submit buttons via `$props.id()`; inert declarations and the global `.modal-content` CSS leak removed.
- [x] **T4.2** PlanCreateModal fixed 420px slide pane traps actions — `ontology/PlanCreateModal.svelte:317,686-708` — Back/Create inside `absolute inset-0 overflow-y-auto` pane, exactly 420px regardless of viewport; inconsistent with TaskCreateModal's footer snippet. DONE: panes now stacked grid cells (`[grid-area:1/1]`) in normal flow; modal-content owns scroll, actions flow at content end.
- [x] **T4.3** TaskCreateModal fixed 400px content pane — `ontology/TaskCreateModal.svelte:306,311` — double-scroll feel; footer is correct here, only content pane affected.
- [x] **T4.4** Promote `--keyboard-height` consumption + a `fullscreen-mobile` variant into base Modal — AgentChatModal (`:3492-3523`) and DocumentModal (`:2300-2310`) both re-derive fullscreen via `!important` stacks; DocumentModal lacks keyboard handling despite being the markdown editor. DONE: base Modal now inits keyboard-avoiding on touch devices (CSS-property-only) and subtracts `var(--keyboard-height)` in all max-height calcs + mobile margin-bottom lift; DocumentModal fullscreen calcs subtract the var. DEFERRED: consolidating a `size="full"` variant (AgentChatModal/DocumentModal `!important` stacks still work; migrate when next touching them).
- [x] **T4.5** PWA splash screens broken — `lib/components/layout/IOSSplashScreens.svelte` — all `apple-touch-startup-image` point at `/brain-bolt.png`; iOS silently rejects size mismatches → blank launch screen. Generate real images or delete component.
- [x] **T4.6** Installed-PWA 44px rule fights Inkprint density — `src/lib/styles/pwa.css:26-31` — forces `min-height/min-width: 44px` on every button/a when installed. Delete (owner explicitly doesn't want touch-target inflation). Also dead `.bottom-nav/.tab-bar` rules at `:10-13` (no such elements).
- [x] **T4.7** Nav drawer raw body overflow — `lib/components/layout/Navigation.svelte:282-295` — uses `document.body.style.overflow = 'hidden'` (iOS-unreliable) instead of `lockBodyScroll()`.
- [x] **T4.8** Rogue overlays → base Modal: task-page context sheet (`tasks/[task_id]/+page.svelte:1938-1971`, `max-h-[75vh]`, no scroll lock/overscroll-contain → should be `variant="bottom-sheet"`), profile template editor (`routes/profile/+page.svelte:431-441`, no scroll lock/Escape, vh), `scheduling/CalendarItemDrawer.svelte` (Svelte 4 syntax, no lock, fixed header-height calc).
- [x] **T4.9** OTP field shows QWERTY — `settings/PhoneVerification.svelte:179-187` — missing `inputmode="numeric" pattern="[0-9]*"`. Onboarding twin does it right (`onboarding-v2/PhoneVerificationCard.svelte:320-329`). Also add `autocomplete="tel"` to `PhoneVerificationCard.svelte:254`.

### Tier 5 — density & consistency refits (FIXED 2026-06-12, except T5.9 partials below)

- [x] **T5.1** Briefs page generation-behind: `routes/briefs/+page.svelte` — `max-w-6xl px-4 sm:px-6 lg:px-8 py-8` vs canonical `px-2 sm:px-4 py-2`; undownscaled `text-3xl` header (~120px burn, `:705-707`); vertical 3-button mobile view switcher (`:864-881`) where desktop segmented control fits; "Next Brief" hidden behind hamburger (`:716-730`).
- [x] **T5.2** DailyBriefModal footer eats ~300px on mobile — `briefs/DailyBriefModal.svelte:504-577` — banner + up to 4 stacked full-width buttons; collapse secondary actions to icon row.
- [x] **T5.3** History mobile cards hide instead of compact — `routes/history/+page.svelte:667-672` — preview text `hidden sm:block` → use `line-clamp-1`. Raise `text-[8px]` badges (`:631,644,679,686`) to `text-[10px]`.
- [x] **T5.4** Hover-only actions invisible on touch: `ontology/MilestoneListItem.svelte:166`, `ontology/GoalMilestonesSidebarSection.svelte:295` (`hidden group-hover:flex` quick-complete — untappable); `opacity-0 group-hover:opacity-100` without mobile fallback: `voice-notes/VoiceNoteList.svelte:151`, `ontology/ImageAssetsPanel.svelte:298`, `ontology/linked-entities/LinkedEntitiesItem.svelte:86`, `ontology/doc-tree/UnlinkedDocuments.svelte:108`, `homework/WorkspaceTreeNode.svelte:161`. Standard to adopt: `sm:opacity-0 sm:group-hover:opacity-100` (see `AgentComposer.svelte:264`).
- [x] **T5.5** Padding-heavy modals vs ontology-family standard (`px-2 py-2 sm:px-4 sm:py-4`): `TimeBlockCreateModal.svelte:186,231` (p-6/p-5 + gradients off-Inkprint), `PhoneVerificationModal` content (`PhoneVerification.svelte` p-6 + icon block), `CalendarAnalysisModal.svelte:62-114` (very tall for yes/no).
- [x] **T5.6** vh stragglers: `project/ProjectCalendarSettingsModal.svelte:751` (`h-[72vh]` fights modal dvh strategy), task-page sheet `max-h-[75vh]`. Admin modals use raw 90vh widely (desktop surfaces, lower priority).
- [x] **T5.7** Notifications page zero base horizontal padding — `routes/notifications/+page.svelte:734` (`sm:px-6` only) — give it `px-3` at base.
- [x] **T5.8** Time-blocks Week view default on mobile renders 7 ~45px columns — `time-blocks/+page.svelte:39`, `TimePlayCalendar.svelte:1355-1358` — default to Day view on small screens.
- [~] **T5.9** Misc — PARTIAL. Done: ConfirmationModal snippet self-shadow renamed (childrenContent/footerContent); TimeBlockCreateModal global `.modal-content` z-index leak deleted; ToastContainer exit animation now direction-aware (slides down on mobile) + dead `--exit-y` vars removed. NOT done (needs DJ device testing or is churn): status-bar meta static value (`black-translucent` decision affects standalone visuals), theme-color stale on manual toggle (verify toggle calls updateThemeColors), component name collisions (rename churn), admin ErrorDetailsModal (admin/desktop surface). Original list: ConfirmationModal snippet self-shadowing SSR recursion tripwire (`ui/ConfirmationModal.svelte:89,110,129-131` — rename like `InfoModal.svelte:26-27`); global CSS leaks targeting `.modal-content` (`FormModal.svelte:731-737`, `TimeBlockCreateModal.svelte:300-302`); ToastContainer dead `--exit-y` vars + sideways exit on bottom-anchored mobile toasts (`ToastContainer.svelte:77-82`); status-bar meta runtime rewrite is a no-op (`pwa-enhancements.ts:74-89` — value read at add-to-home-screen time); theme-color can go stale on manual theme toggle (only listens to `prefers-color-scheme` + `storage`); name collisions (two `ImageUploadModal`s, two `ConfirmationModal`s); admin `ErrorDetailsModal.svelte:187-194` rogue (no portal/lock/Escape, z-50, 90vh).

---

## Patterns done well (keep doing these)

1. **Base `Modal.svelte` is best-in-class**: module-level modal stack routing Escape/backdrop to topmost only; background `inert` management; swipe-to-dismiss with nested-scroll-container detection; dvh + `env(safe-area-inset-*)` height strategy with landscape + iOS `@supports` refinements; footer home-indicator clearance; `$props.id()` hydration-stable a11y IDs; `will-change` cleanup post-animation.
2. **AgentChatModal is the gold-standard mobile surface**: fullscreen 100dvh, Dynamic Island padding, composer safe-area, `--keyboard-height`-driven shrink with scroll resync, inverse-responsive buttons (`h-10 w-10 sm:h-8 sm:w-8`).
3. **Replace-don't-hide forks**: MobileTaskBoard vs 7-col kanban, PulseStrip tabs, task sidebar → bottom sheet. Mobile gets purpose-built dense surfaces.
4. **Ontology edit-modal family** uniformly dense/consistent: `px-2 py-1.5` headers, h-8 footer buttons, label-hiding, `grid-cols-1 lg:grid-cols-3`, `inputmode="numeric"` on durations.
5. **Defensive text discipline**: `min-w-0` + `truncate` everywhere; chat markdown `break-words [overflow-wrap:anywhere]` + `overflow-x-auto`. Zero horizontal-overflow bugs found at 390px.
6. **Infrastructure choices**: native `<select>`; `hoverOnlyWhenSupported`; 16px input floor instead of `maximum-scale` hack; `TextInput` auto-derives `inputmode`/`enterkeyhint`; hide-on-scroll mobile nav; commented vh/dvh fallback pairs on auth pages; `body-scroll-lock` position:fixed technique with iOS keyboard focusin escape hatch; `keyboard-avoiding.ts` textbook visualViewport implementation.
7. **Breakpoint discipline**: strict mobile-first, zero `max-*:` desktop-first usages; canonical container `mx-auto max-w-7xl px-2 sm:px-4 lg:px-6 py-2 sm:py-4 lg:py-6` (dashboard/projects/history/profile).

## Conformance stats

- 56 modal components: 54 conformant (base Modal or wrappers), 2 rogue (`BriefChatModal` — deliberate fork that drifted; admin `ErrorDetailsModal`).
- Rogue non-modal overlays: task-page sheet, profile template editor, CalendarItemDrawer, TreeAgentContextSelector, homework run overlay (decent), 5 admin inline dialogs. `CalendarConnectionOverlay` is the best non-Modal citizen.
- Bottom-sheet variant used: AgentChatModal, RecentProjectChatsModal. Missed candidates: task-page sheet, NotificationModal/DailyBriefModal.
- Only 2 fixed bottom bars in app (task + document save bars) — both miss safe-area.
- iOS zoom: all raw `<input>`s accidentally safe via selector specificity; ~20 user-facing selects/textareas + entire CodeMirror surface zoom.
