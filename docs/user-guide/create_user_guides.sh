# apps/web/docs/user-guide/create_user_guides.sh

# User Guide placeholders
echo "# Getting Started with BuildOS
PLACEHOLDER - User onboarding guide" > docs/user-guide/getting-started.md

echo "# Frequently Asked Questions
PLACEHOLDER - Common questions and answers" > docs/user-guide/faq.md

echo "# Troubleshooting Guide
PLACEHOLDER - Common issues and solutions" > docs/user-guide/troubleshooting.md

# Feature guides
mkdir -p docs/user-guide/features

echo "# How to Use Brain Dump
PLACEHOLDER - Complete brain dump user guide" > docs/user-guide/features/brain-dump.md

echo "# Managing Projects
PLACEHOLDER - Project management guide" > docs/user-guide/features/projects.md

echo "# Calendar Sync Setup
PLACEHOLDER - Setting up Google Calendar integration" > docs/user-guide/features/calendar-sync.md

echo "# Daily Briefs Configuration
PLACEHOLDER - Configuring daily brief emails" > docs/user-guide/features/daily-briefs.md

echo "Created all user guide placeholders"
