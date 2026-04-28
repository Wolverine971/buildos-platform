---
title: "Notion Recurring Tasks in 60 Seconds"
source_type: youtube_transcript
video_id: yYNbf__-gx4
url: "https://www.youtube.com/watch?v=yYNbf__-gx4"
channel: Thomas Frank Explains
channel_url: "https://www.youtube.com/@ThomasFrankExplains"
upload_date: 2024-12-04
duration: "00:58"
views: 53093
library_category: marketing-and-content
library_status: "transcript, blog-reference"
transcript_status: available
analysis_status: missing
processing_status: archive_reference_only
processed: true
skill_candidate: false
skill_priority: none
skill_draft: ""
public_article: "apps/web/src/content/blogs/notion-recurring-tasks-complexity.md"
indexed_date: "2026-04-28"
last_reviewed: "2026-04-28"
tags:
  - notion
  - notionhq
  - notion app
  - notion tips
  - how to use notion
  - notion productivity
  - notion templates
  - notion recurring tasks
  - repeating tasks
  - habit tracking
description: |
  Notion finally supports native recurring tasks. Here's how to set them up.
  
  Full tutorial here: https://www.youtube.com/watch?v=xYu4bFcC9v4
transcribed_date: "2026-04-28"
---

# Notion Recurring Tasks in 60 Seconds

## Metadata
- **Channel**: [Thomas Frank Explains](https://www.youtube.com/@ThomasFrankExplains)
- **Video**: [Watch on YouTube](https://www.youtube.com/watch?v=yYNbf__-gx4)
- **Duration**: 00:58
- **Upload Date**: 2024-12-04
- **Views**: 53,093

## Transcript

here's how to set up native recurring tasks and notion in under 60 seconds first create a database with a due date property a status property a number property called recur interval and a Select Property called recur unit and that property add options for days weeks months and years next create a filtered view of this database called recurring tasks and add a filter where recur interval is greater than or equal to one and the due date is not empty finally create a new Automation and filter that automation to the view you just created trigger this automation by the status property being set to done and first in the due area set the status property back to not start to reset it set the do property to a custom formula value and in the editor Target the trigger page. do property and send it into the date ad function which modifies an initial date with a number and a unit for the number we're going to Target the trigger page. recur interval property and for the unit we're going to Target trigger page. recur unit so for example if we had two in days this will be an every other day recurring task click save and you're done now on any recurring task when you set the status two done the automation will kick off and process the task like you'd expect
