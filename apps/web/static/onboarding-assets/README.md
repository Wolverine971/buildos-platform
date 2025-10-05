# Onboarding Assets

This directory contains visual assets used in the BuildOS V2 onboarding flow to help users understand features and workflows.

## 📁 Directory Structure

```
onboarding-assets/
├── screenshots/       # Static images showing UI examples
└── videos/           # Short demo videos (10-30 seconds)
```

## 📸 Screenshots Needed

### Brain Dump Example

**File:** `brain_dump_example.png`

- **Dimensions:** 1200x800px (landscape)
- **Content:** Example of a brain dump with highlighted sections showing how AI extracts projects
- **Use:** Displayed in ProjectsCaptureStep to inspire users

### SMS Notification Example

**File:** `sms_notification_example.png`

- **Dimensions:** 800x1200px (portrait - phone screenshot)
- **Content:** iPhone/Android showing BuildOS SMS notifications

## 🎥 Videos Needed

### Calendar Analysis Demo

**File:** `calendar_analysis_demo.mp4`

- **Duration:** 15-30 seconds
- **Format:** 1080p (1920x1080), MP4, H.264

### SMS Notification Demo

**File:** `sms_notification_demo.mp4`

- **Duration:** 10-15 seconds

## 📝 Current Status

**Status:** Placeholders in use - see `onboarding.config.ts` for integration

All assets currently use `PLACEHOLDER_` prefixes. Real assets can be added by:

1. Creating files following specs above
2. Adding to appropriate directory
3. Updating `onboarding.config.ts`
