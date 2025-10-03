# Onboarding Assets

This directory contains visual assets for the onboarding v2 flow including screenshots, videos, and demos.

## 📸 Screenshots Needed

### 1. Brain Dump Example (`screenshots/brain_dump_example.png`)

**Dimensions:** 1200x800px (landscape)
**Description:** Screenshot showing an example brain dump with highlighted sections:

- Input area with example text
- AI processing indicator
- Extracted projects/tasks highlighted
- Visual callouts showing structure extraction

**Example Content:**

```
"Building a fitness app. Need to track workouts, meal plans, and progress.
Launch by end of Q2. Main features: workout library, nutrition tracker,
progress charts. Target audience: busy professionals."
```

### 2. Calendar Analysis Before (`screenshots/calendar_analysis_before.png`)

**Dimensions:** 1200x800px (landscape)
**Description:** Google Calendar view showing typical work calendar:

- Multiple recurring meetings
- Various project-related events
- Mix of one-off and recurring items
- Visual emphasis on patterns (circles/highlights)

### 3. Calendar Analysis After (`screenshots/calendar_analysis_after.png`)

**Dimensions:** 1200x800px (landscape)
**Description:** BuildOS showing projects created from calendar:

- List of suggested projects
- Confidence scores visible
- Link between calendar events and projects
- Clear before/after visual comparison

### 4. SMS Notification Example (`screenshots/sms_notification_example.png`)

**Dimensions:** 800x1200px (portrait - phone screenshot)
**Description:** Phone screenshot showing BuildOS SMS notifications:

- Morning kickoff message
- Task reminder
- Event notification
- Clean, professional messaging format

**Example Messages:**

- "Good morning! 🌅 You have 3 tasks today. Top priority: Finish client proposal by 2pm."
- "Reminder: Team standup in 15 minutes"
- "Evening recap: 5 tasks completed today! 🎉 Great progress on Product Launch project."

## 🎥 Videos Needed

### 1. Calendar Analysis Demo (`videos/calendar_analysis_demo.mp4`)

**Duration:** 15-30 seconds
**Format:** 1080p (1920x1080), MP4, H.264 codec
**Content:**

1. User clicks "Analyze My Calendar"
2. Loading animation (10s)
3. Project suggestions appear with animations
4. User selects projects to create
5. Success confirmation

**Key Moments:**

- Clear CTA button click
- Satisfying loading/processing animation
- Smooth reveal of suggestions
- Quick selection interaction
- Celebration on completion

### 2. SMS Notification Demo (`videos/sms_notification_demo.mp4`)

**Duration:** 10-15 seconds
**Format:** 1080p (1920x1080), MP4, H.264 codec
**Content:**

1. Phone screen (lock screen or home)
2. SMS notification arrives with sound
3. Preview of message content
4. User opens message
5. Shows full BuildOS SMS with logo/branding

**Key Moments:**

- Notification arrival with haptic/sound
- Clear message preview
- Professional messaging format
- BuildOS branding visible

### 3. Guided Brain Dump Demo (`videos/brain_dump_guided_demo.mp4`)

**Duration:** 20-30 seconds
**Format:** 1080p (1920x1080), MP4, H.264 codec
**Content:**

1. User typing in brain dump field
2. AI processing animation
3. Projects and tasks being created in real-time
4. Success state with created items
5. Clear visual of structure from chaos

**Key Moments:**

- Natural typing (not too fast)
- Satisfying AI processing visual
- Smooth creation animations
- Clear "before chaos → after structure" narrative

## 📐 Technical Specifications

### Screenshots

- **Format:** PNG (preferred) or JPG
- **Landscape:** 1200x800px
- **Portrait (phone):** 800x1200px or 750x1334px (iPhone standard)
- **DPI:** 72 (web) or 144 (retina)
- **Color:** RGB, sRGB color space
- **Compression:** Moderate (balance quality/file size)

### Videos

- **Format:** MP4 (H.264 codec, AAC audio)
- **Resolution:** 1920x1080 (1080p)
- **Frame Rate:** 30fps or 60fps
- **Bitrate:** 5-8 Mbps (good quality, reasonable file size)
- **Audio:** Optional (background music or sound effects)
- **Max File Size:** 10MB per video (for fast loading)
- **Encoding:** Web-optimized (fast start, streamable)

### Naming Convention

- Use descriptive names with underscores
- Include dimensions in filename if variant exists
- Example: `brain_dump_example_1200x800.png`
- Keep names lowercase with underscores

## 🎨 Design Guidelines

### Visual Style

- **Modern & Clean:** Minimalist design, plenty of white space
- **Professional:** Polished, production-quality visuals
- **Friendly:** Approachable, not intimidating
- **Brand Colors:**
    - Primary: Purple (#7C3AED, #9333EA)
    - Secondary: Blue (#3B82F6, #2563EB)
    - Accent: Green (#10B981 for success)
    - Neutrals: Gray scale (#F3F4F6 to #1F2937)

### Screenshot Guidelines

- Use realistic data (not "lorem ipsum")
- Show genuine use cases
- Highlight key features with subtle annotations
- Keep UI clean (hide personal info)
- Use light mode primarily (dark mode variants optional)

### Video Guidelines

- Smooth animations (60fps preferred)
- Clear call-to-actions
- Concise (under 30 seconds)
- Subtitles/captions optional but helpful
- Background music subtle (if used)
- Show actual app functionality (no mockups)

## 🚀 Implementation

### Using Placeholders

Until real assets are created, the config file (`/src/lib/config/onboarding.config.ts`) references placeholder paths:

```typescript
assets: {
  screenshots: {
    brainDumpExample: '/onboarding-assets/screenshots/PLACEHOLDER_brain_dump_example.png',
    // ...
  },
  videos: {
    calendarAnalysisDemo: '/onboarding-assets/videos/PLACEHOLDER_calendar_analysis_demo.mp4',
    // ...
  }
}
```

### Replacing Placeholders

1. Create the actual asset following specifications above
2. Save to appropriate folder:
    - Screenshots → `/static/onboarding-assets/screenshots/`
    - Videos → `/static/onboarding-assets/videos/`
3. Remove `PLACEHOLDER_` prefix from filename
4. Asset will automatically load in onboarding flow

### Testing Assets

```bash
# Check asset exists and size
ls -lh /Users/annawayne/buildos-platform/apps/web/static/onboarding-assets/screenshots/

# Test in browser
# Navigate to: http://localhost:5173/onboarding-assets/screenshots/brain_dump_example.png
```

## 📝 Asset Checklist

### Screenshots

- [ ] `brain_dump_example.png` - Brain dump with structure extraction
- [ ] `calendar_analysis_before.png` - Calendar view before analysis
- [ ] `calendar_analysis_after.png` - Projects created from calendar
- [ ] `sms_notification_example.png` - Phone with SMS notifications

### Videos

- [ ] `calendar_analysis_demo.mp4` - Calendar analysis workflow (15-30s)
- [ ] `sms_notification_demo.mp4` - SMS notification example (10-15s)
- [ ] `brain_dump_guided_demo.mp4` - Guided brain dump process (20-30s)

### Optional Enhancements

- [ ] Dark mode screenshot variants
- [ ] Mobile app screenshots (if applicable)
- [ ] GIF versions of videos (for email/docs)
- [ ] High-resolution variants for print/presentations

## 🔗 Resources

### Design Tools

- **Figma:** For mockups and screenshots
- **ScreenFlow/Camtasia:** For screen recordings
- **After Effects:** For motion graphics
- **Photoshop/Sketch:** For image editing

### Stock Assets (if needed)

- **Unsplash:** Free stock photos
- **Pexels:** Free stock videos
- **Undraw:** Free illustrations
- **Lottie Files:** Free animations

### Video Capture

- **macOS:** QuickTime Player (built-in screen recording)
- **Windows:** Xbox Game Bar or OBS
- **iOS:** Built-in screen recording (Settings → Control Center)
- **Android:** Built-in screen recorder or AZ Screen Recorder

---

**Note:** This is a living document. Update as asset requirements change or new assets are added.
