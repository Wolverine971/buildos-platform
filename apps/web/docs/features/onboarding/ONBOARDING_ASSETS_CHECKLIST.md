<!-- apps/web/docs/features/onboarding/ONBOARDING_ASSETS_CHECKLIST.md -->
<!-- todo: priority 2 -->

# BuildOS Onboarding Assets Checklist

**Last Updated**: 2025-10-04
**Status**: Asset gathering phase
**Owner**: DJ

## Overview

This document provides a detailed checklist for gathering and creating visual assets (screenshots, videos, demos) for the BuildOS onboarding revamp. Assets are organized by onboarding step and include specifications, placement details, and priority levels.

**Asset Directory**: `/apps/web/static/onboarding-assets/`

---

## 📐 General Specifications

### Screenshot Requirements

- **Desktop screenshots**: 1200x800px (landscape)
- **Mobile/phone screenshots**: 800x1200px (portrait)
- **Format**: PNG or WebP (for better compression)
- **Quality**: High resolution, clean UI, no personal data
- **Device frames**: Optional but recommended for phone screenshots

### Video Requirements

- **Resolution**: 1080p (1920x1080) minimum
- **Format**: MP4, H.264 codec
- **Duration**: 10-30 seconds max (keep it short!)
- **Audio**: Optional (consider background music or silence)
- **Subtitles**: Recommended for accessibility
- **File size**: Optimize for web (compress to <5MB if possible)

### Design Guidelines

- Use BuildOS brand colors (purple-blue gradient theme)
- Ensure UI is in light mode (or provide both light/dark versions)
- Remove any real user data (use placeholder/demo data)
- Show successful/happy path flows
- Keep UI clean and uncluttered

---

## 📋 Assets by Onboarding Section

## 1. Welcome & Orientation

**Component**: `WelcomeStep.svelte`
**Priority**: Medium

### Assets Needed

#### 🎬 Hero Animation/Graphic (Optional)

- **Type**: Animated SVG or short video loop
- **Purpose**: Eye-catching visual at the top of welcome screen
- **Specs**: 400x400px, subtle animation (brain graphic with pulse/glow)
- **Location**: `/apps/web/static/onboarding-assets/animations/`
- **File name**: `welcome-hero-animation.svg` or `.mp4`
- **Status**: ⬜ in progress
- **Notes**: Currently using CSS gradient + Brain icon. Animation would enhance it.

**Action Items**:

- [ ] Design or source brain/productivity themed animation
- [ ] Export as SVG with animation or MP4 loop
- [ ] Optimize for web (small file size)
- [ ] Test on both light and dark modes

---

## 2. Capture Current Projects (Guided Brain Dump)

**Component**: `ProjectsCaptureStep.svelte`
**Priority**: HIGH (critical for understanding the feature)

### Assets Needed

#### 📸 Screenshot: Brain Dump Example with Highlighted Sections

- **Type**: Screenshot
- **Purpose**: Show users what a good brain dump looks like
- **Specs**: 1200x800px, PNG
- **Location**: `/apps/web/static/onboarding-assets/screenshots/`
- **File name**: `brain_dump_example.png`
- **Status**: ⬜ Not started

<!-- need notifications -->

**Action Items**:

- [ ] Create a demo brain dump with realistic example text (e.g., "Building a SaaS platform, need to track design mockups, user research interviews, and MVP development timeline...")
- [ ] Take screenshot of brain dump input with text highlighted or annotated
- [ ] Show annotations pointing to different sections (projects, tasks, context)
- [ ] Use visual markers (arrows, boxes, highlights) to demonstrate structure extraction
- [ ] Export as high-res PNG
- [ ] Place in `/apps/web/static/onboarding-assets/screenshots/`

**Content Ideas**:

- Highlight different colors for "projects" vs "tasks" vs "goals"
- Show mixed types: fitness project, side project, learning goal
- Include messy/stream-of-consciousness formatting to show AI handles it

---

#### 📸 Screenshot: Calendar Analysis Before

- **Type**: Screenshot
- **Purpose**: Show Google Calendar before analysis
- **Specs**: 1200x800px, PNG
- **Location**: `/apps/web/static/onboarding-assets/screenshots/`
- **File name**: `calendar_analysis_before.png`
- **Status**: ⬜ Not started

**Action Items**:

- [ ] Create demo Google Calendar with realistic events (meetings, project work, deadlines)
- [ ] Take clean screenshot showing calendar week view
- [ ] Ensure events have descriptive names (e.g., "Sprint Planning Meeting", "Design Review", "Client Presentation")
- [ ] Remove any personal information
- [ ] Export as PNG
- [ ] Place in `/apps/web/static/onboarding-assets/screenshots/`

---

#### 📸 Screenshot: Calendar Analysis After (Projects Created)

- **Type**: Screenshot
- **Purpose**: Show projects extracted from calendar
- **Specs**: 1200x800px, PNG
- **Location**: `/apps/web/static/onboarding-assets/screenshots/`
- **File name**: `calendar_analysis_after.png`
- **Status**: ⬜ Not started

**Action Items**:

- [ ] Take screenshot of BuildOS project list showing projects created from calendar
- [ ] Show 2-3 projects with clear names matching calendar events
- [ ] Highlight or annotate to show connection to calendar events
- [ ] Export as PNG
- [ ] Place in `/apps/web/static/onboarding-assets/screenshots/`

---

#### 🎥 Video: Calendar Analysis Demo

- **Type**: Screen recording
- **Purpose**: Show end-to-end calendar analysis flow in action
- **Specs**: 1920x1080, MP4, 15-30 seconds
- **Location**: `/apps/web/static/onboarding-assets/videos/`
- **File name**: `calendar_analysis_demo.mp4`
- **Status**: ⬜ Not started

**Action Items**:

- [ ] Record screen showing:
    1. Click "Analyze My Calendar" button
    2. Google Calendar connection (if needed)
    3. AI processing animation
    4. Project suggestions appearing
    5. User clicks to create projects
    6. Success confirmation
- [ ] Keep video under 30 seconds
- [ ] Add subtle transitions/highlights for key moments
- [ ] Export as MP4 (H.264 codec)
- [ ] Compress to <5MB if possible
- [ ] Optional: Add background music or voiceover
- [ ] Optional: Add text overlays explaining each step
- [ ] Place in `/apps/web/static/onboarding-assets/videos/`

**Storyboard**:

1. (0-5s) Click "Analyze My Calendar" → Modal opens
2. (5-10s) Loading animation → Analysis in progress
3. (10-20s) Project suggestions appear in list
4. (20-25s) Click "Create Projects" → Success animation
5. (25-30s) Projects now visible in workspace

---

#### 🎥 Video: Brain Dump Guided Demo

- **Type**: Screen recording
- **Purpose**: Show typing brain dump → AI processing → projects/tasks created
- **Specs**: 1920x1080, MP4, 20-30 seconds
- **Location**: `/apps/web/static/onboarding-assets/videos/`
- **File name**: `brain_dump_guided_demo.mp4`
- **Status**: ⬜ Not started

**Action Items**:

- [ ] Record screen showing:
    1. User types in brain dump textarea (use typing animation)
    2. Click "Continue" or "Process"
    3. AI processing animation with status updates
    4. Projects and tasks created
    5. Summary of what was extracted
- [ ] Use realistic example text (like fitness or side project example)
- [ ] Show processing stages: "Extracting context..." → "Identifying tasks..." → "Creating project..."
- [ ] Keep video under 30 seconds
- [ ] Export as MP4 (H.264 codec)
- [ ] Compress to <5MB if possible
- [ ] Optional: Add text overlays or annotations
- [ ] Place in `/apps/web/static/onboarding-assets/videos/`

**Example Script**:

- Type: "Working on a fitness transformation project. Need to track workouts 3x/week, meal prep on Sundays, log progress photos, and schedule check-ins with trainer every 2 weeks."
- Processing: Shows extraction of project "Fitness Transformation"
- Result: Shows tasks created in phases (weekly workouts, meal prep, check-ins)

---

## 3. Accountability & Notifications Setup

**Component**: `NotificationsStep.svelte`
**Priority**: HIGH (demonstrates key feature)

### Assets Needed

#### 📸 Screenshot: SMS Notification Example (Phone)

- **Type**: Phone screenshot with device frame
- **Purpose**: Show what SMS notifications look like on phone
- **Specs**: 800x1200px (portrait), PNG
- **Location**: `/apps/web/static/onboarding-assets/screenshots/`
- **File name**: `sms_notification_example.png`
- **Status**: ⬜ Not started

**Action Items**:

- [ ] Create realistic SMS notification on iPhone or Android
- [ ] Use BuildOS branding in message sender name
- [ ] Write example notification text (e.g., "🌅 Good morning! Your daily kickoff: Today you have 3 tasks for the 'Website Redesign' project...")
- [ ] Take clean screenshot
- [ ] Optional: Add device frame (iPhone frame, etc.)
- [ ] Remove any personal information
- [ ] Export as PNG
- [ ] Place in `/apps/web/static/onboarding-assets/screenshots/`

**Example Notification Messages**:

- **Morning Kickoff**: "🌅 Good morning! Today's focus: Complete design mockups for homepage. You have 2 meetings scheduled."
- **Event Reminder**: "📅 Reminder: Sprint Planning in 30 minutes. Have you reviewed the backlog?"
- **Next Up**: "⏰ Next up: Finish blog post draft (2pm - 3pm)"
- **Evening Recap**: "🌙 Great job today! You completed 4 tasks. Tomorrow: Client presentation prep."

---

#### 🎥 Video: SMS Notification Demo

- **Type**: Phone screen recording or motion graphic
- **Purpose**: Show phone receiving SMS notification in real-time
- **Specs**: 1080x1920 (vertical video for phone), MP4, 10-15 seconds
- **Location**: `/apps/web/static/onboarding-assets/videos/`
- **File name**: `sms_notification_demo.mp4`
- **Status**: ⬜ Not started

**Action Items**:

- [ ] Record or animate phone receiving SMS notification
- [ ] Show notification banner sliding in at top of screen
- [ ] Optionally show phone vibration/haptic feedback
- [ ] Display example message text clearly
- [ ] Show 2-3 different notification types (Morning Kickoff, Task Reminder, Evening Recap)
- [ ] Keep video under 15 seconds
- [ ] Export as MP4 (H.264 codec)
- [ ] Optimize for vertical video (1080x1920 or 1080x1080)
- [ ] Place in `/apps/web/static/onboarding-assets/videos/`

**Storyboard**:

1. (0-3s) Phone screen with lock screen or home screen
2. (3-6s) Notification banner slides in from top with haptic feedback
3. (6-9s) Show full notification text clearly
4. (9-12s) Notification transitions to next example (optional)
5. (12-15s) Fade to BuildOS logo or end card

---

#### 📸 Screenshot: Email Daily Brief Example (Optional)

- **Type**: Screenshot
- **Purpose**: Show what email daily brief looks like
- **Specs**: 1200x800px, PNG
- **Location**: `/apps/web/static/onboarding-assets/screenshots/`
- **File name**: `email_daily_brief_example.png`
- **Status**: ⬜ Not started (Optional)

**Action Items** (if creating):

- [ ] Create realistic email daily brief in email client (Gmail, Outlook, etc.)
- [ ] Show example brief with projects, tasks, and priorities
- [ ] Include BuildOS branding (logo, colors)
- [ ] Take clean screenshot
- [ ] Export as PNG
- [ ] Place in `/apps/web/static/onboarding-assets/screenshots/`

---

## 4. BuildOS Usage Profile (User Archetypes)

**Component**: `ArchetypeStep.svelte`
**Priority**: Low (UI is clear, no placeholders in code)

### Assets Needed

#### 🎨 Archetype Icons (Optional Enhancement)

- **Type**: Custom icons/illustrations
- **Purpose**: Replace Lucide icons with custom archetype illustrations
- **Specs**: SVG, 256x256px
- **Location**: `/apps/web/static/onboarding-assets/icons/`
- **File names**: `archetype-second-brain.svg`, `archetype-ai-task-manager.svg`, `archetype-project-todo.svg`
- **Status**: ⬜ Not started (Optional)

**Action Items** (if creating):

- [ ] Design custom icon for "Second Brain" archetype (brain with knowledge nodes)
- [ ] Design custom icon for "AI Task Manager" archetype (robot/AI assistant)
- [ ] Design custom icon for "Project To-Do List" archetype (checklist/tasks)
- [ ] Export as SVG
- [ ] Optimize SVGs for web
- [ ] Place in `/apps/web/static/onboarding-assets/icons/`
- [ ] Update `ArchetypeStep.svelte` to use custom icons

**Note**: Currently using Lucide icons (Brain, Bot, ListChecks), which look fine. Custom icons are optional enhancement.

---

## 5. Identify Productivity Challenges

**Component**: `ChallengesStep.svelte`
**Priority**: Low (uses emoji icons, clear UI)

### Assets Needed

**No critical assets needed for this section.**

The challenges step uses emoji icons (⏳, 🧩, 🔀, etc.) which are clear and require no custom assets.

**Optional Enhancement**: Custom illustrations for each challenge type (low priority).

---

## 6. Summary & First Win

**Component**: `SummaryStep.svelte`
**Priority**: Medium

### Assets Needed

#### 🎬 Success Animation (Optional)

- **Type**: Animated SVG or Lottie animation
- **Purpose**: Celebration animation when onboarding completes
- **Specs**: 400x400px, JSON (Lottie) or SVG
- **Location**: `/apps/web/static/onboarding-assets/animations/`
- **File name**: `success-celebration.json` or `.svg`
- **Status**: ⬜ Not started (Optional)

**Action Items** (if creating):

- [ ] Create or source celebration animation (confetti, checkmark, success icon)
- [ ] Export as Lottie JSON or animated SVG
- [ ] Optimize for web
- [ ] Test animation performance
- [ ] Place in `/apps/web/static/onboarding-assets/animations/`

**Note**: Currently using CSS pulse animation on checkmark icon, which works well. Custom animation is optional enhancement.

---

## 📊 Asset Priority Summary

### HIGH Priority (Critical for understanding features)

1. ✅ **Brain Dump Example Screenshot** - Shows what good input looks like
2. ✅ **Calendar Analysis Demo Video** - Demonstrates calendar integration flow
3. ✅ **Brain Dump Guided Demo Video** - Shows AI processing in action
4. ✅ **SMS Notification Example Screenshot** - Shows real notification on phone
5. ✅ **SMS Notification Demo Video** - Demonstrates notification delivery

### Medium Priority (Enhances experience)

6. ⬜ Calendar Analysis Before/After Screenshots
7. ⬜ Email Daily Brief Example Screenshot
8. ⬜ Success Celebration Animation

### Low Priority (Optional enhancements)

9. ⬜ Welcome Hero Animation
10. ⬜ Custom Archetype Icons
11. ⬜ Challenge Illustrations

---

## 🎬 Production Checklist

### Pre-Production

- [ ] Set up demo BuildOS account with clean data
- [ ] Prepare example brain dump text (3-5 realistic examples)
- [ ] Set up demo Google Calendar with realistic events
- [ ] Set up screen recording software (Loom, ScreenFlow, QuickTime)
- [ ] Set up phone for SMS screenshots (iOS or Android)
- [ ] Prepare demo phone numbers for Twilio testing
- [ ] Clear browser cache and set up clean UI state

### Recording Best Practices

- [ ] Use incognito/private browsing mode (clean state)
- [ ] Disable browser extensions that might appear in screenshots
- [ ] Set browser window to consistent size (1920x1080)
- [ ] Use demo data only (no personal information)
- [ ] Record in high resolution (4K if possible, downscale later)
- [ ] Use cursor highlighting/click animations for videos
- [ ] Keep recordings short and focused (10-30 seconds)
- [ ] Record multiple takes and choose best

### Post-Production

- [ ] Edit videos to remove dead time and mistakes
- [ ] Add text overlays or annotations where helpful
- [ ] Compress images (use ImageOptim, TinyPNG, or similar)
- [ ] Compress videos (use HandBrake or similar)
- [ ] Test assets on both light and dark modes
- [ ] Test assets on mobile and desktop
- [ ] Verify file sizes are web-optimized (<5MB for videos, <500KB for images)

---

## 📁 File Organization

```
/apps/web/static/onboarding-assets/
├── screenshots/
│   ├── brain_dump_example.png
│   ├── calendar_analysis_before.png
│   ├── calendar_analysis_after.png
│   ├── sms_notification_example.png
│   └── email_daily_brief_example.png
├── videos/
│   ├── calendar_analysis_demo.mp4
│   ├── sms_notification_demo.mp4
│   └── brain_dump_guided_demo.mp4
├── animations/ (optional)
│   ├── welcome-hero-animation.svg
│   └── success-celebration.json
└── icons/ (optional)
    ├── archetype-second-brain.svg
    ├── archetype-ai-task-manager.svg
    └── archetype-project-todo.svg
```

---

## 🔧 Implementation Notes

### How to Add Assets to Components

Once assets are created, update the component files to reference them:

#### Example: Brain Dump Screenshot

```svelte
<!-- In ProjectsCaptureStep.svelte -->
<div class="mt-4 bg-white dark:bg-gray-800 rounded-lg p-4 border-2 border-dashed border-gray-300">
	<img
		src="/onboarding-assets/screenshots/brain_dump_example.png"
		alt="Example brain dump with highlighted sections"
		class="w-full rounded-lg"
	/>
</div>
```

#### Example: Calendar Demo Video

```svelte
<!-- In ProjectsCaptureStep.svelte -->
<div class="mb-4 bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden">
	<video
		src="/onboarding-assets/videos/calendar_analysis_demo.mp4"
		autoplay
		loop
		muted
		playsinline
		class="w-full"
	>
		Your browser does not support the video tag.
	</video>
</div>
```

#### Example: SMS Demo Video

```svelte
<!-- In NotificationsStep.svelte -->
<div class="bg-white dark:bg-gray-800 rounded-lg p-8 text-center">
	<video
		src="/onboarding-assets/videos/sms_notification_demo.mp4"
		autoplay
		loop
		muted
		playsinline
		class="max-w-sm mx-auto rounded-lg shadow-xl"
	>
		Your browser does not support the video tag.
	</video>
</div>
```

---

## ✅ Next Steps

1. **Review this checklist** - Decide which assets are critical vs. optional
2. **Set up demo environment** - Prepare BuildOS account, Google Calendar, phone for screenshots
3. **Gather assets in priority order** - Start with HIGH priority items
4. **Create/record assets** - Follow specs and best practices above
5. **Optimize and compress** - Ensure web-friendly file sizes
6. **Place in correct directories** - Follow file organization structure
7. **Update component files** - Replace placeholders with actual asset paths
8. **Test on all devices** - Verify assets look good on mobile and desktop
9. **Test on light/dark modes** - Ensure assets work in both themes

---

## 📞 Questions or Issues?

If you need clarification on any asset specs or have questions about implementation:

- Check component files for placeholder comments
- Review implementation plan: `thoughts/shared/research/2025-10-03_14-45-00_onboarding-revamp-implementation-plan.md`
- Review original spec: `apps/web/docs/features/onboarding/build-os-onboarding-revamp.md`

---

**Document Version**: 1.0
**Last Updated**: 2025-10-04
**Next Review**: After HIGH priority assets are gathered
