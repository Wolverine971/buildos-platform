# API Routes Documentation

_Auto-generated on 2025-09-27T04:23:00.929Z_

This documentation is automatically generated from the SvelteKit route structure.

## Overview

Total endpoints: 134

- [PUT /api/account/password](#apiaccountpassword)
- [PUT, DELETE /api/account/settings](#apiaccountsettings)
- [GET /api/admin/analytics/brief-stats](#apiadminanalyticsbriefstats)
- [GET /api/admin/analytics/comprehensive](#apiadminanalyticscomprehensive)
- [GET /api/admin/analytics/daily-signups](#apiadminanalyticsdailysignups)
- [GET /api/admin/analytics/daily-users](#apiadminanalyticsdailyusers)
- [GET /api/admin/analytics/daily-visitors](#apiadminanalyticsdailyvisitors)
- [GET /api/admin/analytics/export](#apiadminanalyticsexport)
- [GET /api/admin/analytics/overview](#apiadminanalyticsoverview)
- [GET /api/admin/analytics/recent-activity](#apiadminanalyticsrecentactivity)
- [GET /api/admin/analytics/system-metrics](#apiadminanalyticssystemmetrics)
- [GET /api/admin/analytics/template-usage](#apiadminanalyticstemplateusage)
- [GET /api/admin/analytics/visitor-overview](#apiadminanalyticsvisitoroverview)
- [GET, PATCH /api/admin/beta/feedback](#apiadminbetafeedback)
- [GET, PATCH /api/admin/beta/members](#apiadminbetamembers)
- [GET /api/admin/beta/overview](#apiadminbetaoverview)
- [GET, PATCH /api/admin/beta/signups](#apiadminbetasignups)
- [GET /api/admin/calendar-errors](#apiadmincalendarerrors)
- [GET, POST /api/admin/emails](#apiadminemails)
- [GET, PATCH, DELETE /api/admin/emails/{id}](#apiadminemailsid)
- [POST /api/admin/emails/{id}/send](#apiadminemailsidsend)
- [GET, POST, DELETE /api/admin/emails/attachments](#apiadminemailsattachments)
- [POST /api/admin/emails/generate](#apiadminemailsgenerate)
- [GET, POST /api/admin/emails/recipients](#apiadminemailsrecipients)
- [POST /api/admin/emails/send](#apiadminemailssend)
- [GET /api/admin/errors](#apiadminerrors)
- [POST /api/admin/errors/{id}/resolve](#apiadminerrorsidresolve)
- [GET, PATCH /api/admin/feedback](#apiadminfeedback)
- [GET /api/admin/feedback/overview](#apiadminfeedbackoverview)
- [GET /api/admin/revenue](#apiadminrevenue)
- [GET /api/admin/revenue/export](#apiadminrevenueexport)
- [GET /api/admin/subscriptions/overview](#apiadminsubscriptionsoverview)
- [GET, POST /api/admin/subscriptions/users](#apiadminsubscriptionsusers)
- [GET, PATCH /api/admin/users](#apiadminusers)
- [GET /api/admin/users/{id}/context](#apiadminusersidcontext)
- [GET /api/admin/users/{userId}/activity](#apiadminusersuseridactivity)
- [POST, GET /api/agent/google-calendar](#apiagentgooglecalendar)
- [GET /api/analytics/briefs](#apianalyticsbriefs)
- [POST /api/auth/login](#apiauthlogin)
- [POST /api/auth/register](#apiauthregister)
- [GET /api/auth/user](#apiauthuser)
- [POST, GET /api/beta/signup](#apibetasignup)
- [GET /api/braindumps](#apibraindumps)
- [GET, PUT, DELETE /api/braindumps/{id}](#apibraindumpsid)
- [PATCH, DELETE /api/braindumps/{id}/link](#apibraindumpsidlink)
- [GET /api/braindumps/contribution-data](#apibraindumpscontributiondata)
- [GET, POST, PATCH /api/braindumps/draft](#apibraindumpsdraft)
- [PATCH /api/braindumps/draft/status](#apibraindumpsdraftstatus)
- [POST /api/braindumps/generate](#apibraindumpsgenerate)
- [GET /api/braindumps/init](#apibraindumpsinit)
- [POST /api/braindumps/stream](#apibraindumpsstream)
- [POST /api/braindumps/stream-short](#apibraindumpsstreamshort)
- [GET /api/brief-jobs](#apibriefjobs)
- [GET /api/brief-jobs/{id}](#apibriefjobsid)
- [POST /api/brief-jobs/cancel](#apibriefjobscancel)
- [GET /api/brief-jobs/next-scheduled](#apibriefjobsnextscheduled)
- [GET, POST, PUT /api/brief-preferences](#apibriefpreferences)
- [GET, POST /api/brief-templates/project](#apibrieftemplatesproject)
- [GET, PUT, DELETE /api/brief-templates/project/{id}](#apibrieftemplatesprojectid)
- [POST, GET /api/calendar](#apicalendar)
- [POST, GET /api/calendar/process](#apicalendarprocess)
- [GET /api/calendar/projects](#apicalendarprojects)
- [POST /api/calendar/remove-task](#apicalendarremovetask)
- [GET /api/calendar/retry-failed](#apicalendarretryfailed)
- [POST, DELETE /api/calendar/webhook](#apicalendarwebhook)
- [GET /api/cron/dunning](#apicrondunning)
- [POST /api/cron/renew-webhooks](#apicronrenewwebhooks)
- [GET /api/cron/trial-reminders](#apicrontrialreminders)
- [GET /api/daily-briefs](#apidailybriefs)
- [GET, PUT, DELETE /api/daily-briefs/{id}](#apidailybriefsid)
- [POST /api/daily-briefs/cancel](#apidailybriefscancel)
- [POST, GET /api/daily-briefs/generate](#apidailybriefsgenerate)
- [GET /api/daily-briefs/history](#apidailybriefshistory)
- [GET /api/daily-briefs/progress](#apidailybriefsprogress)
- [GET /api/daily-briefs/search](#apidailybriefssearch)
- [GET /api/daily-briefs/stats](#apidailybriefsstats)
- [GET /api/daily-briefs/status](#apidailybriefsstatus)
- [GET /api/dashboard](#apidashboard)
- [GET /api/dashboard/bottom-sections](#apidashboardbottomsections)
- [GET /api/email-tracking/{tracking_id}](#apiemailtrackingtrackingid)
- [POST /api/feedback](#apifeedback)
- [GET /api/health](#apihealth)
- [POST, GET /api/notes](#apinotes)
- [PUT, DELETE, GET /api/notes/{id}](#apinotesid)
- [PATCH, DELETE /api/notes/{id}/link](#apinotesidlink)
- [POST /api/onboarding](#apionboarding)
- [GET, POST /api/phases-jobs](#apiphasesjobs)
- [GET /api/project-briefs](#apiprojectbriefs)
- [GET, DELETE /api/project-briefs/{id}](#apiprojectbriefsid)
- [GET, POST /api/projects](#apiprojects)
- [GET, PUT, DELETE /api/projects/{id}](#apiprojectsid)
- [GET /api/projects/{id}/briefs](#apiprojectsidbriefs)
- [GET /api/projects/{id}/briefs/latest](#apiprojectsidbriefslatest)
- [GET, POST, PUT, DELETE /api/projects/{id}/calendar](#apiprojectsidcalendar)
- [GET /api/projects/{id}/calendar-status](#apiprojectsidcalendarstatus)
- [POST /api/projects/{id}/calendar/share](#apiprojectsidcalendarshare)
- [POST /api/projects/{id}/calendar/sync](#apiprojectsidcalendarsync)
- [DELETE /api/projects/{id}/delete](#apiprojectsiddelete)
- [GET /api/projects/{id}/details](#apiprojectsiddetails)
- [POST, PUT, GET /api/projects/{id}/generate-brief-template](#apiprojectsidgeneratebrieftemplate)
- [GET /api/projects/{id}/history](#apiprojectsidhistory)
- [GET /api/projects/{id}/notes](#apiprojectsidnotes)
- [GET, POST, PUT, PATCH, DELETE /api/projects/{id}/phases](#apiprojectsidphases)
- [PATCH, DELETE /api/projects/{id}/phases/{phaseId}](#apiprojectsidphasesphaseid)
- [POST, DELETE /api/projects/{id}/phases/{phaseId}/schedule](#apiprojectsidphasesphaseidschedule)
- [POST /api/projects/{id}/phases/generate](#apiprojectsidphasesgenerate)
- [POST /api/projects/{id}/phases/preview](#apiprojectsidphasespreview)
- [POST /api/projects/{id}/phases/tasks](#apiprojectsidphasestasks)
- [GET /api/projects/{id}/questions/random](#apiprojectsidquestionsrandom)
- [GET /api/projects/{id}/stats](#apiprojectsidstats)
- [POST, GET, PUT, DELETE /api/projects/{id}/synthesize](#apiprojectsidsynthesize)
- [POST /api/projects/{id}/synthesize/apply](#apiprojectsidsynthesizeapply)
- [POST, GET /api/projects/{id}/tasks](#apiprojectsidtasks)
- [PATCH, DELETE /api/projects/{id}/tasks/{taskId}](#apiprojectsidtaskstaskid)
- [GET /api/projects/{id}/tasks/{taskId}/calendar-status](#apiprojectsidtaskstaskidcalendarstatus)
- [POST /api/projects/{id}/tasks/assign-backlog](#apiprojectsidtasksassignbacklog)
- [PATCH, GET /api/projects/{id}/tasks/batch](#apiprojectsidtasksbatch)
- [POST /api/projects/{id}/tasks/reschedule-overdue](#apiprojectsidtasksrescheduleoverdue)
- [POST /api/projects/{id}/tasks/unschedule-all](#apiprojectsidtasksunscheduleall)
- [GET /api/projects/briefs-count](#apiprojectsbriefscount)
- [GET /api/projects/list](#apiprojectslist)
- [GET /api/projects/search](#apiprojectssearch)
- [GET, DELETE /api/queue-jobs/{id}](#apiqueuejobsid)
- [POST /api/search](#apisearch)
- [POST /api/search/more](#apisearchmore)
- [POST /api/stripe/checkout](#apistripecheckout)
- [GET /api/stripe/invoice/{id}/download](#apistripeinvoiceiddownload)
- [POST /api/stripe/portal](#apistripeportal)
- [POST /api/stripe/webhook](#apistripewebhook)
- [GET, PATCH, DELETE /api/tasks/{id}/recurrence](#apitasksidrecurrence)
- [GET, POST, PUT, DELETE /api/templates](#apitemplates)
- [POST /api/transcribe](#apitranscribe)
- [GET, PUT /api/users/calendar-preferences](#apiuserscalendarpreferences)
- [POST /api/visitors](#apivisitors)

---

## PUT /api/account/password

**File:** `src/routes/api/account/password/+server.ts`

🔒 **Authentication Required**

### Parameters

No parameters

### Responses

| Status | Description      | Content Type     |
| ------ | ---------------- | ---------------- |
| 200    | Success response | application/json |
| 401    | Unauthorized     | application/json |
| 400    | Bad request      | application/json |

---

## PUT, DELETE /api/account/settings

**File:** `src/routes/api/account/settings/+server.ts`

🔒 **Authentication Required**

### Parameters

No parameters

### Responses

| Status | Description      | Content Type     |
| ------ | ---------------- | ---------------- |
| 200    | Success response | application/json |
| 401    | Unauthorized     | application/json |
| 400    | Bad request      | application/json |

---

## GET /api/admin/analytics/brief-stats

**File:** `src/routes/api/admin/analytics/brief-stats/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name      | Type   | Location | Required | Description                |
| --------- | ------ | -------- | -------- | -------------------------- |
| timeframe | string | query    | No       | Query parameter: timeframe |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 500    | Database error        | application/json |
| 500    | Internal server error | application/json |

---

## GET /api/admin/analytics/comprehensive

**File:** `src/routes/api/admin/analytics/comprehensive/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name      | Type   | Location | Required | Description                |
| --------- | ------ | -------- | -------- | -------------------------- |
| timeframe | string | query    | No       | Query parameter: timeframe |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 500    | Internal server error | application/json |

---

## GET /api/admin/analytics/daily-signups

**File:** `src/routes/api/admin/analytics/daily-signups/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name      | Type   | Location | Required | Description                |
| --------- | ------ | -------- | -------- | -------------------------- |
| timeframe | string | query    | No       | Query parameter: timeframe |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 500    | Database error        | application/json |
| 500    | Internal server error | application/json |

---

## GET /api/admin/analytics/daily-users

**File:** `src/routes/api/admin/analytics/daily-users/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name      | Type   | Location | Required | Description                |
| --------- | ------ | -------- | -------- | -------------------------- |
| timeframe | string | query    | No       | Query parameter: timeframe |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 500    | Database error        | application/json |
| 500    | Internal server error | application/json |

---

## GET /api/admin/analytics/daily-visitors

**File:** `src/routes/api/admin/analytics/daily-visitors/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name      | Type   | Location | Required | Description                |
| --------- | ------ | -------- | -------- | -------------------------- |
| timeframe | string | query    | No       | Query parameter: timeframe |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 500    | Database error        | application/json |
| 500    | Internal server error | application/json |

---

## GET /api/admin/analytics/export

**File:** `src/routes/api/admin/analytics/export/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name      | Type   | Location | Required | Description                |
| --------- | ------ | -------- | -------- | -------------------------- |
| timeframe | string | query    | No       | Query parameter: timeframe |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 401    | Unauthorized          | application/json |
| 500    | Internal server error | application/json |

---

## GET /api/admin/analytics/overview

**File:** `src/routes/api/admin/analytics/overview/+server.ts`

🔒 **Authentication Required**

### Parameters

No parameters

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 500    | Database error        | application/json |
| 500    | Internal server error | application/json |

---

## GET /api/admin/analytics/recent-activity

**File:** `src/routes/api/admin/analytics/recent-activity/+server.ts`

🔒 **Authentication Required**

### Parameters

No parameters

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 500    | Database error        | application/json |
| 500    | Internal server error | application/json |

---

## GET /api/admin/analytics/system-metrics

**File:** `src/routes/api/admin/analytics/system-metrics/+server.ts`

🔒 **Authentication Required**

### Parameters

No parameters

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 500    | Database error        | application/json |
| 500    | Internal server error | application/json |

---

## GET /api/admin/analytics/template-usage

**File:** `src/routes/api/admin/analytics/template-usage/+server.ts`

🔒 **Authentication Required**

### Parameters

No parameters

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 500    | Database error        | application/json |
| 500    | Internal server error | application/json |

---

## GET /api/admin/analytics/visitor-overview

**File:** `src/routes/api/admin/analytics/visitor-overview/+server.ts`

🔒 **Authentication Required**

### Parameters

No parameters

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 500    | Database error        | application/json |
| 500    | Internal server error | application/json |

---

## GET, PATCH /api/admin/beta/feedback

**File:** `src/routes/api/admin/beta/feedback/+server.ts`

### Parameters

| Name       | Type   | Location | Required | Description                 |
| ---------- | ------ | -------- | -------- | --------------------------- |
| page       | string | query    | No       | Query parameter: page       |
| limit      | string | query    | No       | Query parameter: limit      |
| type       | string | query    | No       | Query parameter: type       |
| status     | string | query    | No       | Query parameter: status     |
| search     | string | query    | No       | Query parameter: search     |
| sort_by    | string | query    | No       | Query parameter: sort_by    |
| sort_order | string | query    | No       | Query parameter: sort_order |

### Responses

No documented responses

---

## GET, PATCH /api/admin/beta/members

**File:** `src/routes/api/admin/beta/members/+server.ts`

### Parameters

| Name        | Type   | Location | Required | Description                  |
| ----------- | ------ | -------- | -------- | ---------------------------- |
| page        | string | query    | No       | Query parameter: page        |
| limit       | string | query    | No       | Query parameter: limit       |
| tier        | string | query    | No       | Query parameter: tier        |
| active_only | string | query    | No       | Query parameter: active_only |
| search      | string | query    | No       | Query parameter: search      |
| sort_by     | string | query    | No       | Query parameter: sort_by     |
| sort_order  | string | query    | No       | Query parameter: sort_order  |

### Responses

No documented responses

---

## GET /api/admin/beta/overview

**File:** `src/routes/api/admin/beta/overview/+server.ts`

🔒 **Authentication Required**

### Parameters

No parameters

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 500    | Database error        | application/json |
| 500    | Internal server error | application/json |

---

## GET, PATCH /api/admin/beta/signups

**File:** `src/routes/api/admin/beta/signups/+server.ts`

### Parameters

| Name       | Type   | Location | Required | Description                 |
| ---------- | ------ | -------- | -------- | --------------------------- |
| page       | string | query    | No       | Query parameter: page       |
| limit      | string | query    | No       | Query parameter: limit      |
| status     | string | query    | No       | Query parameter: status     |
| search     | string | query    | No       | Query parameter: search     |
| sort_by    | string | query    | No       | Query parameter: sort_by    |
| sort_order | string | query    | No       | Query parameter: sort_order |

### Responses

No documented responses

---

## GET /api/admin/calendar-errors

**File:** `src/routes/api/admin/calendar-errors/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name      | Type   | Location | Required | Description                |
| --------- | ------ | -------- | -------- | -------------------------- |
| timeRange | string | query    | No       | Query parameter: timeRange |
| taskId    | string | query    | No       | Query parameter: taskId    |
| userId    | string | query    | No       | Query parameter: userId    |
| action    | string | query    | No       | Query parameter: action    |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 500    | Internal server error | application/json |
| 400    | Bad request           | application/json |

---

## GET, POST /api/admin/emails

**File:** `src/routes/api/admin/emails/+server.ts`

### Parameters

| Name       | Type   | Location | Required | Description                 |
| ---------- | ------ | -------- | -------- | --------------------------- |
| page       | string | query    | No       | Query parameter: page       |
| limit      | string | query    | No       | Query parameter: limit      |
| status     | string | query    | No       | Query parameter: status     |
| category   | string | query    | No       | Query parameter: category   |
| search     | string | query    | No       | Query parameter: search     |
| sort_by    | string | query    | No       | Query parameter: sort_by    |
| sort_order | string | query    | No       | Query parameter: sort_order |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 500    | Internal server error | application/json |
| 400    | Bad request           | application/json |

---

## GET, PATCH, DELETE /api/admin/emails/{id}

**File:** `src/routes/api/admin/emails/[id]/+server.ts`

### Parameters

| Name | Type   | Location | Required | Description        |
| ---- | ------ | -------- | -------- | ------------------ |
| id   | string | path     | Yes      | Path parameter: id |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 500    | Database error        | application/json |
| 500    | Internal server error | application/json |
| 400    | Bad request           | application/json |

---

## POST /api/admin/emails/{id}/send

**File:** `src/routes/api/admin/emails/[id]/send/+server.ts`

### Parameters

| Name | Type   | Location | Required | Description        |
| ---- | ------ | -------- | -------- | ------------------ |
| id   | string | path     | Yes      | Path parameter: id |

### Responses

No documented responses

---

## GET, POST, DELETE /api/admin/emails/attachments

**File:** `src/routes/api/admin/emails/attachments/+server.ts`

### Parameters

| Name        | Type   | Location | Required | Description                  |
| ----------- | ------ | -------- | -------- | ---------------------------- |
| email_id    | string | query    | No       | Query parameter: email_id    |
| shared_only | string | query    | No       | Query parameter: shared_only |
| images_only | string | query    | No       | Query parameter: images_only |
| id          | string | query    | No       | Query parameter: id          |

### Responses

No documented responses

---

## POST /api/admin/emails/generate

**File:** `src/routes/api/admin/emails/generate/+server.ts`

### Parameters

No parameters

### Responses

| Status | Description      | Content Type     |
| ------ | ---------------- | ---------------- |
| 200    | Success response | application/json |

---

## GET, POST /api/admin/emails/recipients

**File:** `src/routes/api/admin/emails/recipients/+server.ts`

### Parameters

| Name   | Type   | Location | Required | Description             |
| ------ | ------ | -------- | -------- | ----------------------- |
| source | string | query    | No       | Query parameter: source |
| search | string | query    | No       | Query parameter: search |
| limit  | string | query    | No       | Query parameter: limit  |

### Responses

No documented responses

---

## POST /api/admin/emails/send

**File:** `src/routes/api/admin/emails/send/+server.ts`

### Parameters

No parameters

### Responses

| Status | Description      | Content Type     |
| ------ | ---------------- | ---------------- |
| 200    | Success response | application/json |

---

## GET /api/admin/errors

**File:** `src/routes/api/admin/errors/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name      | Type   | Location | Required | Description                |
| --------- | ------ | -------- | -------- | -------------------------- |
| severity  | string | query    | No       | Query parameter: severity  |
| type      | string | query    | No       | Query parameter: type      |
| resolved  | string | query    | No       | Query parameter: resolved  |
| userId    | string | query    | No       | Query parameter: userId    |
| projectId | string | query    | No       | Query parameter: projectId |
| page      | string | query    | No       | Query parameter: page      |
| limit     | string | query    | No       | Query parameter: limit     |

### Responses

| Status | Description      | Content Type     |
| ------ | ---------------- | ---------------- |
| 200    | Success response | application/json |
| 401    | Unauthorized     | application/json |

---

## POST /api/admin/errors/{id}/resolve

**File:** `src/routes/api/admin/errors/[id]/resolve/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name | Type   | Location | Required | Description        |
| ---- | ------ | -------- | -------- | ------------------ |
| id   | string | path     | Yes      | Path parameter: id |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 500    | Internal server error | application/json |

---

## GET, PATCH /api/admin/feedback

**File:** `src/routes/api/admin/feedback/+server.ts`

### Parameters

| Name       | Type   | Location | Required | Description                 |
| ---------- | ------ | -------- | -------- | --------------------------- |
| page       | string | query    | No       | Query parameter: page       |
| limit      | string | query    | No       | Query parameter: limit      |
| status     | string | query    | No       | Query parameter: status     |
| category   | string | query    | No       | Query parameter: category   |
| search     | string | query    | No       | Query parameter: search     |
| sort_by    | string | query    | No       | Query parameter: sort_by    |
| sort_order | string | query    | No       | Query parameter: sort_order |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 500    | Internal server error | application/json |
| 400    | Bad request           | application/json |

---

## GET /api/admin/feedback/overview

**File:** `src/routes/api/admin/feedback/overview/+server.ts`

### Parameters

No parameters

### Responses

No documented responses

---

## GET /api/admin/revenue

**File:** `src/routes/api/admin/revenue/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name   | Type   | Location | Required | Description             |
| ------ | ------ | -------- | -------- | ----------------------- |
| period | string | query    | No       | Query parameter: period |
| year   | string | query    | No       | Query parameter: year   |
| month  | string | query    | No       | Query parameter: month  |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 500    | Internal server error | application/json |

---

## GET /api/admin/revenue/export

**File:** `src/routes/api/admin/revenue/export/+server.ts`

### Parameters

| Name   | Type   | Location | Required | Description             |
| ------ | ------ | -------- | -------- | ----------------------- |
| period | string | query    | No       | Query parameter: period |
| year   | string | query    | No       | Query parameter: year   |
| month  | string | query    | No       | Query parameter: month  |

### Responses

No documented responses

---

## GET /api/admin/subscriptions/overview

**File:** `src/routes/api/admin/subscriptions/overview/+server.ts`

🔒 **Authentication Required**

### Parameters

No parameters

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 500    | Internal server error | application/json |

---

## GET, POST /api/admin/subscriptions/users

**File:** `src/routes/api/admin/subscriptions/users/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name   | Type   | Location | Required | Description             |
| ------ | ------ | -------- | -------- | ----------------------- |
| page   | string | query    | No       | Query parameter: page   |
| limit  | string | query    | No       | Query parameter: limit  |
| status | string | query    | No       | Query parameter: status |
| search | string | query    | No       | Query parameter: search |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 500    | Internal server error | application/json |
| 400    | Bad request           | application/json |

---

## GET, PATCH /api/admin/users

**File:** `src/routes/api/admin/users/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name              | Type   | Location | Required | Description                        |
| ----------------- | ------ | -------- | -------- | ---------------------------------- |
| page              | string | query    | No       | Query parameter: page              |
| limit             | string | query    | No       | Query parameter: limit             |
| search            | string | query    | No       | Query parameter: search            |
| admin_filter      | string | query    | No       | Query parameter: admin_filter      |
| onboarding_filter | string | query    | No       | Query parameter: onboarding_filter |
| sort_by           | string | query    | No       | Query parameter: sort_by           |
| sort_order        | string | query    | No       | Query parameter: sort_order        |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 500    | Internal server error | application/json |
| 400    | Bad request           | application/json |

---

## GET /api/admin/users/{id}/context

**File:** `src/routes/api/admin/users/[id]/context/+server.ts`

### Parameters

| Name  | Type   | Location | Required | Description            |
| ----- | ------ | -------- | -------- | ---------------------- |
| id    | string | path     | Yes      | Path parameter: id     |
| beta  | string | query    | No       | Query parameter: beta  |
| email | string | query    | No       | Query parameter: email |
| name  | string | query    | No       | Query parameter: name  |

### Responses

| Status | Description      | Content Type     |
| ------ | ---------------- | ---------------- |
| 200    | Success response | application/json |

---

## GET /api/admin/users/{userId}/activity

**File:** `src/routes/api/admin/users/[userId]/activity/+server.ts`

🔒 **Authentication Required** (Admin only)

**Purpose:** Retrieve comprehensive user activity including projects, tasks, notes, brain dumps, daily briefs, and recent activity timeline.

**Performance:** Optimized query pattern using in-memory aggregation. Constant query count (9 queries) regardless of user's project count. See [N+1 Query Fix (2025-10-21)](/docs/audits/BUGFIX_CHANGELOG.md#2025-10-21-fixed-n1-query-pattern-in-admin-user-activity-endpoint-high-severity-performance-fix) for details.

### Parameters

| Name   | Type   | Location | Required | Description            |
| ------ | ------ | -------- | -------- | ---------------------- |
| userId | string | path     | Yes      | Path parameter: userId |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 403    | Forbidden (not admin) | application/json |
| 500    | Internal server error | application/json |

### Response Schema

Returns comprehensive user data including:
- User profile and context
- All projects with task/note counts (aggregated efficiently)
- All brain dumps
- All daily briefs
- All tasks with project names
- All notes with project names
- Recent activity timeline (sorted by date, last 50 items)
- Activity statistics summary

---

## POST, GET /api/agent/google-calendar

**File:** `src/routes/api/agent/google-calendar/+server.ts`

### Parameters

No parameters

### Responses

No documented responses

### Types

```typescript
interface MCPToolCallRequest {
	method: 'tools/call';
	params: {
		name: string;
		arguments?: Record<string, any>;
	}

interface MCPListToolsRequest {
	method: 'tools/list';
}

type MCPRequest = MCPToolCallRequest | MCPListToolsRequest;

interface MCPToolsListResponse {
	tools: Array<{
		name: string;
		description: string;
		inputSchema: Record<string, any>;
	}

interface MCPToolCallResponse {
	content: Array<{
		type: string;
		text: string;
	}

interface MCPErrorResponse {
	error: {
		code: number;
		message: string;
		data?: any;
	}
```

---

## GET /api/analytics/briefs

**File:** `src/routes/api/analytics/briefs/+server.ts`

### Parameters

| Name      | Type   | Location | Required | Description                |
| --------- | ------ | -------- | -------- | -------------------------- |
| timeframe | string | query    | No       | Query parameter: timeframe |

### Responses

No documented responses

---

## POST /api/auth/login

**File:** `src/routes/api/auth/login/+server.ts`

### Parameters

No parameters

### Responses

No documented responses

---

## POST /api/auth/register

**File:** `src/routes/api/auth/register/+server.ts`

### Parameters

No parameters

### Responses

No documented responses

---

## GET /api/auth/user

**File:** `src/routes/api/auth/user/+server.ts`

🔒 **Authentication Required**

### Parameters

No parameters

### Responses

| Status | Description      | Content Type     |
| ------ | ---------------- | ---------------- |
| 200    | Success response | application/json |
| 401    | Unauthorized     | application/json |

---

## POST, GET /api/beta/signup

**File:** `src/routes/api/beta/signup/+server.ts`

### Parameters

| Name  | Type   | Location | Required | Description            |
| ----- | ------ | -------- | -------- | ---------------------- |
| email | string | query    | No       | Query parameter: email |

### Responses

No documented responses

### Types

```typescript
interface BetaSignupRequest {
	email: string;
	full_name: string;
	job_title?: string;
	company_name?: string;
	why_interested: string;
	productivity_tools: string[];
	biggest_challenge: string;
	referral_source?: string;
	wants_weekly_calls: boolean;
	wants_community_access: boolean;
	user_timezone?: string;
	honeypot?: string;
}
```

---

## GET /api/braindumps

**File:** `src/routes/api/braindumps/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name   | Type   | Location | Required | Description             |
| ------ | ------ | -------- | -------- | ----------------------- |
| search | string | query    | No       | Query parameter: search |
| year   | string | query    | No       | Query parameter: year   |
| day    | string | query    | No       | Query parameter: day    |
| limit  | string | query    | No       | Query parameter: limit  |
| offset | string | query    | No       | Query parameter: offset |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 500    | Database error        | application/json |
| 500    | Internal server error | application/json |

---

## GET, PUT, DELETE /api/braindumps/{id}

**File:** `src/routes/api/braindumps/[id]/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name | Type   | Location | Required | Description        |
| ---- | ------ | -------- | -------- | ------------------ |
| id   | string | path     | Yes      | Path parameter: id |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 404    | Resource not found    | application/json |
| 500    | Internal server error | application/json |
| 400    | Bad request           | application/json |

---

## PATCH, DELETE /api/braindumps/{id}/link

**File:** `src/routes/api/braindumps/[id]/link/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name | Type   | Location | Required | Description        |
| ---- | ------ | -------- | -------- | ------------------ |
| id   | string | path     | Yes      | Path parameter: id |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 404    | Resource not found    | application/json |
| 500    | Database error        | application/json |
| 500    | Internal server error | application/json |
| 400    | Bad request           | application/json |

---

## GET /api/braindumps/contribution-data

**File:** `src/routes/api/braindumps/contribution-data/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name   | Type   | Location | Required | Description             |
| ------ | ------ | -------- | -------- | ----------------------- |
| year   | string | query    | No       | Query parameter: year   |
| search | string | query    | No       | Query parameter: search |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 500    | Internal server error | application/json |

---

## GET, POST, PATCH /api/braindumps/draft

**File:** `src/routes/api/braindumps/draft/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name      | Type   | Location | Required | Description                |
| --------- | ------ | -------- | -------- | -------------------------- |
| projectId | string | query    | No       | Query parameter: projectId |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 500    | Internal server error | application/json |
| 400    | Bad request           | application/json |

---

## PATCH /api/braindumps/draft/status

**File:** `src/routes/api/braindumps/draft/status/+server.ts`

🔒 **Authentication Required**

### Parameters

No parameters

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 404    | Resource not found    | application/json |
| 500    | Internal server error | application/json |
| 400    | Bad request           | application/json |

---

## POST /api/braindumps/generate

**File:** `src/routes/api/braindumps/generate/+server.ts`

🔒 **Authentication Required**

### Parameters

No parameters

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 404    | Resource not found    | application/json |
| 500    | Internal server error | application/json |
| 400    | Bad request           | application/json |

### Types

```typescript
interface CacheEntry {
	processorRef: WeakRef<BrainDumpProcessor>;
	timestamp: number;
	lastAccess: number;
}
```

---

## GET /api/braindumps/init

**File:** `src/routes/api/braindumps/init/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name      | Type   | Location | Required | Description                |
| --------- | ------ | -------- | -------- | -------------------------- |
| projectId | string | query    | No       | Query parameter: projectId |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 500    | Internal server error | application/json |

---

## POST /api/braindumps/stream

**File:** `src/routes/api/braindumps/stream/+server.ts`

### Parameters

No parameters

### Responses

No documented responses

---

## POST /api/braindumps/stream-short

**File:** `src/routes/api/braindumps/stream-short/+server.ts`

### Parameters

No parameters

### Responses

No documented responses

---

## GET /api/brief-jobs

**File:** `src/routes/api/brief-jobs/+server.ts`

### Parameters

| Name     | Type   | Location | Required | Description               |
| -------- | ------ | -------- | -------- | ------------------------- |
| job_type | string | query    | No       | Query parameter: job_type |
| status   | string | query    | No       | Query parameter: status   |
| limit    | string | query    | No       | Query parameter: limit    |
| offset   | string | query    | No       | Query parameter: offset   |

### Responses

No documented responses

---

## GET /api/brief-jobs/{id}

**File:** `src/routes/api/brief-jobs/[id]/+server.ts`

### Parameters

| Name | Type   | Location | Required | Description        |
| ---- | ------ | -------- | -------- | ------------------ |
| id   | string | path     | Yes      | Path parameter: id |

### Responses

No documented responses

---

## POST /api/brief-jobs/cancel

**File:** `src/routes/api/brief-jobs/cancel/+server.ts`

### Parameters

No parameters

### Responses

No documented responses

---

## GET /api/brief-jobs/next-scheduled

**File:** `src/routes/api/brief-jobs/next-scheduled/+server.ts`

### Parameters

No parameters

### Responses

No documented responses

---

## GET, POST, PUT /api/brief-preferences

**File:** `src/routes/api/brief-preferences/+server.ts`

### Parameters

No parameters

### Responses

No documented responses

---

## GET, POST /api/brief-templates/project

**File:** `src/routes/api/brief-templates/project/+server.ts`

### Parameters

No parameters

### Responses

No documented responses

---

## GET, PUT, DELETE /api/brief-templates/project/{id}

**File:** `src/routes/api/brief-templates/project/[id]/+server.ts`

### Parameters

| Name | Type   | Location | Required | Description        |
| ---- | ------ | -------- | -------- | ------------------ |
| id   | string | path     | Yes      | Path parameter: id |

### Responses

No documented responses

---

## POST, GET /api/calendar

**File:** `src/routes/api/calendar/+server.ts`

🔒 **Authentication Required**

### Parameters

No parameters

### Responses

| Status | Description  | Content Type     |
| ------ | ------------ | ---------------- |
| 401    | Unauthorized | application/json |
| 400    | Bad request  | application/json |

### Types

```typescript
interface CalendarRequest {
	method: string;
	params?: any;
}
```

---

## POST, GET /api/calendar/process

**File:** `src/routes/api/calendar/process/+server.ts`

🔒 **Authentication Required**

### Parameters

No parameters

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 404    | Resource not found    | application/json |
| 500    | Internal server error | application/json |
| 400    | Bad request           | application/json |

### Types

```typescript
interface CalendarRequest {
	method: string;
	params?: any;
}
```

---

## GET /api/calendar/projects

**File:** `src/routes/api/calendar/projects/+server.ts`

**Description:** GET /api/calendar/projects

### Parameters

No parameters

### Responses

| Status | Description      | Content Type     |
| ------ | ---------------- | ---------------- |
| 200    | Success response | application/json |

---

## POST /api/calendar/remove-task

**File:** `src/routes/api/calendar/remove-task/+server.ts`

🔒 **Authentication Required**

### Parameters

No parameters

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 500    | Internal server error | application/json |
| 400    | Bad request           | application/json |

---

## GET /api/calendar/retry-failed

**File:** `src/routes/api/calendar/retry-failed/+server.ts`

### Parameters

No parameters

### Responses

No documented responses

---

## POST, DELETE /api/calendar/webhook

**File:** `src/routes/api/calendar/webhook/+server.ts`

### Parameters

No parameters

### Responses

No documented responses

---

## GET /api/cron/dunning

**File:** `src/routes/api/cron/dunning/+server.ts`

### Parameters

No parameters

### Responses

No documented responses

---

## POST /api/cron/renew-webhooks

**File:** `src/routes/api/cron/renew-webhooks/+server.ts`

### Parameters

No parameters

### Responses

No documented responses

---

## GET /api/cron/trial-reminders

**File:** `src/routes/api/cron/trial-reminders/+server.ts`

### Parameters

No parameters

### Responses

No documented responses

---

## GET /api/daily-briefs

**File:** `src/routes/api/daily-briefs/+server.ts`

### Parameters

| Name | Type   | Location | Required | Description           |
| ---- | ------ | -------- | -------- | --------------------- |
| date | string | query    | No       | Query parameter: date |

### Responses

No documented responses

---

## GET, PUT, DELETE /api/daily-briefs/{id}

**File:** `src/routes/api/daily-briefs/[id]/+server.ts`

### Parameters

| Name | Type   | Location | Required | Description        |
| ---- | ------ | -------- | -------- | ------------------ |
| id   | string | path     | Yes      | Path parameter: id |

### Responses

No documented responses

---

## POST /api/daily-briefs/cancel

**File:** `src/routes/api/daily-briefs/cancel/+server.ts`

### Parameters

No parameters

### Responses

No documented responses

---

## POST, GET /api/daily-briefs/generate

**File:** `src/routes/api/daily-briefs/generate/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name            | Type   | Location | Required | Description                      |
| --------------- | ------ | -------- | -------- | -------------------------------- |
| briefDate       | string | query    | No       | Query parameter: briefDate       |
| forceRegenerate | string | query    | No       | Query parameter: forceRegenerate |
| streaming       | string | query    | No       | Query parameter: streaming       |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 500    | Internal server error | application/json |
| 400    | Bad request           | application/json |

---

## GET /api/daily-briefs/history

**File:** `src/routes/api/daily-briefs/history/+server.ts`

### Parameters

| Name       | Type   | Location | Required | Description                 |
| ---------- | ------ | -------- | -------- | --------------------------- |
| page       | string | query    | No       | Query parameter: page       |
| limit      | string | query    | No       | Query parameter: limit      |
| start_date | string | query    | No       | Query parameter: start_date |
| end_date   | string | query    | No       | Query parameter: end_date   |
| search     | string | query    | No       | Query parameter: search     |

### Responses

No documented responses

---

## GET /api/daily-briefs/progress

**File:** `src/routes/api/daily-briefs/progress/+server.ts`

### Parameters

| Name | Type   | Location | Required | Description           |
| ---- | ------ | -------- | -------- | --------------------- |
| date | string | query    | No       | Query parameter: date |

### Responses

No documented responses

---

## GET /api/daily-briefs/search

**File:** `src/routes/api/daily-briefs/search/+server.ts`

### Parameters

| Name  | Type   | Location | Required | Description            |
| ----- | ------ | -------- | -------- | ---------------------- |
| q     | string | query    | No       | Query parameter: q     |
| limit | string | query    | No       | Query parameter: limit |

### Responses

No documented responses

---

## GET /api/daily-briefs/stats

**File:** `src/routes/api/daily-briefs/stats/+server.ts`

### Parameters

No parameters

### Responses

No documented responses

---

## GET /api/daily-briefs/status

**File:** `src/routes/api/daily-briefs/status/+server.ts`

### Parameters

| Name   | Type   | Location | Required | Description             |
| ------ | ------ | -------- | -------- | ----------------------- |
| date   | string | query    | No       | Query parameter: date   |
| userId | string | query    | No       | Query parameter: userId |

### Responses

No documented responses

---

## GET /api/dashboard

**File:** `src/routes/api/dashboard/+server.ts`

**Description:** Optimized dashboard handler using RPC function

🔒 **Authentication Required**

### Parameters

| Name     | Type   | Location | Required | Description               |
| -------- | ------ | -------- | -------- | ------------------------- |
| timezone | string | query    | No       | Query parameter: timezone |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 500    | Internal server error | application/json |

---

## GET /api/dashboard/bottom-sections

**File:** `src/routes/api/dashboard/bottom-sections/+server.ts`

🔒 **Authentication Required**

### Parameters

No parameters

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 500    | Internal server error | application/json |

---

## GET /api/email-tracking/{tracking_id}

**File:** `src/routes/api/email-tracking/[tracking_id]/+server.ts`

### Parameters

| Name        | Type   | Location | Required | Description                 |
| ----------- | ------ | -------- | -------- | --------------------------- |
| tracking_id | string | path     | Yes      | Path parameter: tracking_id |

### Responses

No documented responses

---

## POST /api/feedback

**File:** `src/routes/api/feedback/+server.ts`

### Parameters

No parameters

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 500    | Database error        | application/json |
| 500    | Internal server error | application/json |
| 400    | Bad request           | application/json |

### Types

```typescript
interface FeedbackRequest {
	category: string;
	rating?: number;
	feedback_text: string;
	user_email?: string;
	honeypot?: string;
}
```

---

## GET /api/health

**File:** `src/routes/api/health/+server.ts`

### Parameters

No parameters

### Responses

No documented responses

---

## POST, GET /api/notes

**File:** `src/routes/api/notes/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name       | Type   | Location | Required | Description                 |
| ---------- | ------ | -------- | -------- | --------------------------- |
| project_id | string | query    | No       | Query parameter: project_id |
| limit      | string | query    | No       | Query parameter: limit      |
| search     | string | query    | No       | Query parameter: search     |
| offset     | string | query    | No       | Query parameter: offset     |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 500    | Database error        | application/json |
| 500    | Internal server error | application/json |
| 400    | Bad request           | application/json |

---

## PUT, DELETE, GET /api/notes/{id}

**File:** `src/routes/api/notes/[id]/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name | Type   | Location | Required | Description        |
| ---- | ------ | -------- | -------- | ------------------ |
| id   | string | path     | Yes      | Path parameter: id |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 404    | Resource not found    | application/json |
| 500    | Database error        | application/json |
| 500    | Internal server error | application/json |
| 400    | Bad request           | application/json |

---

## PATCH, DELETE /api/notes/{id}/link

**File:** `src/routes/api/notes/[id]/link/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name | Type   | Location | Required | Description        |
| ---- | ------ | -------- | -------- | ------------------ |
| id   | string | path     | Yes      | Path parameter: id |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 404    | Resource not found    | application/json |
| 500    | Database error        | application/json |
| 500    | Internal server error | application/json |
| 400    | Bad request           | application/json |

---

## POST /api/onboarding

**File:** `src/routes/api/onboarding/+server.ts`

### Parameters

No parameters

### Responses

No documented responses

---

## GET, POST /api/phases-jobs

**File:** `src/routes/api/phases-jobs/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name       | Type   | Location | Required | Description                 |
| ---------- | ------ | -------- | -------- | --------------------------- |
| status     | string | query    | No       | Query parameter: status     |
| project_id | string | query    | No       | Query parameter: project_id |
| limit      | string | query    | No       | Query parameter: limit      |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 500    | Database error        | application/json |
| 500    | Internal server error | application/json |

---

## GET /api/project-briefs

**File:** `src/routes/api/project-briefs/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name   | Type   | Location | Required | Description             |
| ------ | ------ | -------- | -------- | ----------------------- |
| date   | string | query    | No       | Query parameter: date   |
| userId | string | query    | No       | Query parameter: userId |

### Responses

| Status | Description    | Content Type     |
| ------ | -------------- | ---------------- |
| 401    | Unauthorized   | application/json |
| 500    | Database error | application/json |

---

## GET, DELETE /api/project-briefs/{id}

**File:** `src/routes/api/project-briefs/[id]/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name | Type   | Location | Required | Description        |
| ---- | ------ | -------- | -------- | ------------------ |
| id   | string | path     | Yes      | Path parameter: id |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 404    | Resource not found    | application/json |
| 500    | Database error        | application/json |
| 500    | Internal server error | application/json |

---

## GET, POST /api/projects

**File:** `src/routes/api/projects/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name  | Type   | Location | Required | Description            |
| ----- | ------ | -------- | -------- | ---------------------- |
| page  | string | query    | No       | Query parameter: page  |
| limit | string | query    | No       | Query parameter: limit |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 500    | Database error        | application/json |
| 500    | Internal server error | application/json |
| 400    | Bad request           | application/json |

---

## GET, PUT, DELETE /api/projects/{id}

**File:** `src/routes/api/projects/[id]/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name | Type   | Location | Required | Description        |
| ---- | ------ | -------- | -------- | ------------------ |
| id   | string | path     | Yes      | Path parameter: id |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 404    | Resource not found    | application/json |
| 500    | Database error        | application/json |
| 500    | Internal server error | application/json |
| 400    | Bad request           | application/json |

---

## GET /api/projects/{id}/briefs

**File:** `src/routes/api/projects/[id]/briefs/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name | Type   | Location | Required | Description        |
| ---- | ------ | -------- | -------- | ------------------ |
| id   | string | path     | Yes      | Path parameter: id |

### Responses

| Status | Description      | Content Type     |
| ------ | ---------------- | ---------------- |
| 200    | Success response | application/json |
| 401    | Unauthorized     | application/json |
| 500    | Database error   | application/json |
| 400    | Bad request      | application/json |

---

## GET /api/projects/{id}/briefs/latest

**File:** `src/routes/api/projects/[id]/briefs/latest/+server.ts`

### Parameters

| Name | Type   | Location | Required | Description        |
| ---- | ------ | -------- | -------- | ------------------ |
| id   | string | path     | Yes      | Path parameter: id |

### Responses

No documented responses

---

## GET, POST, PUT, DELETE /api/projects/{id}/calendar

**File:** `src/routes/api/projects/[id]/calendar/+server.ts`

**Description:** Background process to migrate all project tasks to use the new project calendar

🔒 **Authentication Required**

### Parameters

| Name | Type   | Location | Required | Description        |
| ---- | ------ | -------- | -------- | ------------------ |
| id   | string | path     | Yes      | Path parameter: id |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 500    | Internal server error | application/json |

---

## GET /api/projects/{id}/calendar-status

**File:** `src/routes/api/projects/[id]/calendar-status/+server.ts`

### Parameters

| Name | Type   | Location | Required | Description        |
| ---- | ------ | -------- | -------- | ------------------ |
| id   | string | path     | Yes      | Path parameter: id |

### Responses

| Status | Description      | Content Type     |
| ------ | ---------------- | ---------------- |
| 200    | Success response | application/json |

---

## POST /api/projects/{id}/calendar/share

**File:** `src/routes/api/projects/[id]/calendar/share/+server.ts`

**Description:** POST /api/projects/[id]/calendar/share

🔒 **Authentication Required**

### Parameters

| Name | Type   | Location | Required | Description        |
| ---- | ------ | -------- | -------- | ------------------ |
| id   | string | path     | Yes      | Path parameter: id |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 500    | Internal server error | application/json |
| 400    | Bad request           | application/json |

---

## POST /api/projects/{id}/calendar/sync

**File:** `src/routes/api/projects/[id]/calendar/sync/+server.ts`

**Description:** POST /api/projects/[id]/calendar/sync

🔒 **Authentication Required**

### Parameters

| Name | Type   | Location | Required | Description        |
| ---- | ------ | -------- | -------- | ------------------ |
| id   | string | path     | Yes      | Path parameter: id |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 500    | Internal server error | application/json |

---

## DELETE /api/projects/{id}/delete

**File:** `src/routes/api/projects/[id]/delete/+server.ts`

**Description:** Handle calendar event deletion with comprehensive error handling

### Parameters

| Name | Type   | Location | Required | Description        |
| ---- | ------ | -------- | -------- | ------------------ |
| id   | string | path     | Yes      | Path parameter: id |

### Responses

No documented responses

---

## GET /api/projects/{id}/details

**File:** `src/routes/api/projects/[id]/details/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name | Type   | Location | Required | Description        |
| ---- | ------ | -------- | -------- | ------------------ |
| id   | string | path     | Yes      | Path parameter: id |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 404    | Resource not found    | application/json |
| 500    | Database error        | application/json |
| 500    | Internal server error | application/json |

---

## POST, PUT, GET /api/projects/{id}/generate-brief-template

**File:** `src/routes/api/projects/[id]/generate-brief-template/+server.ts`

### Parameters

| Name | Type   | Location | Required | Description        |
| ---- | ------ | -------- | -------- | ------------------ |
| id   | string | path     | Yes      | Path parameter: id |

### Responses

No documented responses

---

## GET /api/projects/{id}/history

**File:** `src/routes/api/projects/[id]/history/+server.ts`

### Parameters

| Name | Type   | Location | Required | Description        |
| ---- | ------ | -------- | -------- | ------------------ |
| id   | string | path     | Yes      | Path parameter: id |

### Responses

No documented responses

---

## GET /api/projects/{id}/notes

**File:** `src/routes/api/projects/[id]/notes/+server.ts`

### Parameters

| Name  | Type   | Location | Required | Description            |
| ----- | ------ | -------- | -------- | ---------------------- |
| id    | string | path     | Yes      | Path parameter: id     |
| page  | string | query    | No       | Query parameter: page  |
| limit | string | query    | No       | Query parameter: limit |

### Responses

| Status | Description      | Content Type     |
| ------ | ---------------- | ---------------- |
| 200    | Success response | application/json |

---

## GET, POST, PUT, PATCH, DELETE /api/projects/{id}/phases

**File:** `src/routes/api/projects/[id]/phases/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name    | Type   | Location | Required | Description              |
| ------- | ------ | -------- | -------- | ------------------------ |
| id      | string | path     | Yes      | Path parameter: id       |
| phaseId | string | query    | No       | Query parameter: phaseId |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 500    | Database error        | application/json |
| 500    | Internal server error | application/json |
| 400    | Bad request           | application/json |

---

## PATCH, DELETE /api/projects/{id}/phases/{phaseId}

**File:** `src/routes/api/projects/[id]/phases/[phaseId]/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name    | Type   | Location | Required | Description             |
| ------- | ------ | -------- | -------- | ----------------------- |
| id      | string | path     | Yes      | Path parameter: id      |
| phaseId | string | path     | Yes      | Path parameter: phaseId |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 404    | Resource not found    | application/json |
| 500    | Database error        | application/json |
| 500    | Internal server error | application/json |
| 400    | Bad request           | application/json |

---

## POST, DELETE /api/projects/{id}/phases/{phaseId}/schedule

**File:** `src/routes/api/projects/[id]/phases/[phaseId]/schedule/+server.ts`

**Description:** Phase Task Scheduling Endpoint

### Parameters

| Name    | Type   | Location | Required | Description             |
| ------- | ------ | -------- | -------- | ----------------------- |
| id      | string | path     | Yes      | Path parameter: id      |
| phaseId | string | path     | Yes      | Path parameter: phaseId |

### Responses

No documented responses

### Types

```typescript
interface SchedulingResult {
	scheduled_tasks: Array<{
		task_id: string;
		suggested_date: string;
		priority_order: number;
		reasoning: string;
		dependencies_considered?: string[];
	}

interface ExistingScheduleItem {
	start_time: string;
	end_time: string;
	task_title: string;
	task_id?: string;
}

interface TaskToSchedule {
	id: string;
	title: string;
	description?: string;
	duration_minutes: number;
	priority?: string;
	dependencies?: any;
	suggested_start_date?: string;
	status?: string;
}
```

---

## POST /api/projects/{id}/phases/generate

**File:** `src/routes/api/projects/[id]/phases/generate/+server.ts`

**Description:** Phase Generation API Handler

🔒 **Authentication Required**

### Parameters

| Name | Type   | Location | Required | Description        |
| ---- | ------ | -------- | -------- | ------------------ |
| id   | string | path     | Yes      | Path parameter: id |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 404    | Resource not found    | application/json |
| 500    | Internal server error | application/json |
| 400    | Bad request           | application/json |

---

## POST /api/projects/{id}/phases/preview

**File:** `src/routes/api/projects/[id]/phases/preview/+server.ts`

**Description:** Analyze task scheduling conflicts and rescheduling needs based on scheduling method

🔒 **Authentication Required**

### Parameters

| Name | Type   | Location | Required | Description        |
| ---- | ------ | -------- | -------- | ------------------ |
| id   | string | path     | Yes      | Path parameter: id |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 404    | Resource not found    | application/json |
| 500    | Database error        | application/json |
| 500    | Internal server error | application/json |
| 400    | Bad request           | application/json |

### Types

```typescript
interface TaskPreview {
	id: string;
	title: string | null;
	status: Database['public']['Enums']['task_status'] | null;
	start_date: string | null;
}

interface TaskConflict {
	id: string;
	title: string | null;
	status: Database['public']['Enums']['task_status'] | null;
	start_date: string | null;
	conflict_type: 'past_incomplete' | 'outside_timeline';
}

interface RescheduledTask {
	id: string;
	title: string | null;
	current_date: string | null;
	suggested_date: string | null;
}

interface RecurringTaskInfo {
	id: string;
	title: string | null;
	recurrence_pattern: Database['public']['Enums']['recurrence_pattern'] | null;
	recurrence_ends: string | null;
	recurrence_end_source: Database['public']['Enums']['recurrence_end_reason'] | null;
}

interface PreviewResponse {
	task_counts: {
		total: number;
		by_status: Record<string, number>;
	}
```

---

## POST /api/projects/{id}/phases/tasks

**File:** `src/routes/api/projects/[id]/phases/tasks/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name | Type   | Location | Required | Description        |
| ---- | ------ | -------- | -------- | ------------------ |
| id   | string | path     | Yes      | Path parameter: id |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 500    | Internal server error | application/json |
| 400    | Bad request           | application/json |

---

## GET /api/projects/{id}/questions/random

**File:** `src/routes/api/projects/[id]/questions/random/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name | Type   | Location | Required | Description        |
| ---- | ------ | -------- | -------- | ------------------ |
| id   | string | path     | Yes      | Path parameter: id |

### Responses

| Status | Description      | Content Type     |
| ------ | ---------------- | ---------------- |
| 200    | Success response | application/json |
| 401    | Unauthorized     | application/json |

---

## GET /api/projects/{id}/stats

**File:** `src/routes/api/projects/[id]/stats/+server.ts`

### Parameters

| Name | Type   | Location | Required | Description        |
| ---- | ------ | -------- | -------- | ------------------ |
| id   | string | path     | Yes      | Path parameter: id |

### Responses

| Status | Description      | Content Type     |
| ------ | ---------------- | ---------------- |
| 200    | Success response | application/json |

---

## POST, GET, PUT, DELETE /api/projects/{id}/synthesize

**File:** `src/routes/api/projects/[id]/synthesize/+server.ts`

### Parameters

| Name | Type   | Location | Required | Description        |
| ---- | ------ | -------- | -------- | ------------------ |
| id   | string | path     | Yes      | Path parameter: id |

### Responses

No documented responses

---

## POST /api/projects/{id}/synthesize/apply

**File:** `src/routes/api/projects/[id]/synthesize/apply/+server.ts`

### Parameters

| Name | Type   | Location | Required | Description        |
| ---- | ------ | -------- | -------- | ------------------ |
| id   | string | path     | Yes      | Path parameter: id |

### Responses

No documented responses

---

## POST, GET /api/projects/{id}/tasks

**File:** `src/routes/api/projects/[id]/tasks/+server.ts`

**Description:** Handle phase assignment logic for new tasks

🔒 **Authentication Required**

### Parameters

| Name | Type   | Location | Required | Description        |
| ---- | ------ | -------- | -------- | ------------------ |
| id   | string | path     | Yes      | Path parameter: id |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 404    | Resource not found    | application/json |
| 500    | Database error        | application/json |
| 500    | Internal server error | application/json |
| 400    | Bad request           | application/json |

---

## PATCH, DELETE /api/projects/{id}/tasks/{taskId}

**File:** `src/routes/api/projects/[id]/tasks/[taskId]/+server.ts`

**Description:** Intelligently determine what calendar operations are needed with timezone support

🔒 **Authentication Required**

### Parameters

| Name   | Type   | Location | Required | Description            |
| ------ | ------ | -------- | -------- | ---------------------- |
| id     | string | path     | Yes      | Path parameter: id     |
| taskId | string | path     | Yes      | Path parameter: taskId |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 404    | Resource not found    | application/json |
| 500    | Internal server error | application/json |
| 400    | Bad request           | application/json |

---

## GET /api/projects/{id}/tasks/{taskId}/calendar-status

**File:** `src/routes/api/projects/[id]/tasks/[taskId]/calendar-status/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name   | Type   | Location | Required | Description            |
| ------ | ------ | -------- | -------- | ---------------------- |
| id     | string | path     | Yes      | Path parameter: id     |
| taskId | string | path     | Yes      | Path parameter: taskId |

### Responses

| Status | Description      | Content Type     |
| ------ | ---------------- | ---------------- |
| 200    | Success response | application/json |
| 401    | Unauthorized     | application/json |
| 500    | Database error   | application/json |

---

## POST /api/projects/{id}/tasks/assign-backlog

**File:** `src/routes/api/projects/[id]/tasks/assign-backlog/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name | Type   | Location | Required | Description        |
| ---- | ------ | -------- | -------- | ------------------ |
| id   | string | path     | Yes      | Path parameter: id |

### Responses

| Status | Description      | Content Type     |
| ------ | ---------------- | ---------------- |
| 200    | Success response | application/json |
| 401    | Unauthorized     | application/json |

### Types

```typescript
interface BacklogAssignmentResult {
	phase_assignments: Array<{
		task_id: string;
		phase_id: string;
		reasoning: string;
		suggested_date?: string;
		priority_order?: number;
	}

interface PhaseInfo {
	id: string;
	name: string;
	description?: string;
	start_date?: string;
	end_date?: string;
	valid_date_range: {
		earliest_task_date: string;
		latest_task_date: string | null;
		description: string;
	}

interface TaskInfo {
	id: string;
	title: string;
	description?: string;
	dependencies?: any;
	duration_minutes?: number;
}

type AssignmentMethod = 'phases_only' | 'with_dates' | 'with_calendar';
```

---

## PATCH, GET /api/projects/{id}/tasks/batch

**File:** `src/routes/api/projects/[id]/tasks/batch/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name | Type   | Location | Required | Description        |
| ---- | ------ | -------- | -------- | ------------------ |
| id   | string | path     | Yes      | Path parameter: id |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 404    | Resource not found    | application/json |
| 500    | Database error        | application/json |
| 500    | Internal server error | application/json |
| 400    | Bad request           | application/json |

---

## POST /api/projects/{id}/tasks/reschedule-overdue

**File:** `src/routes/api/projects/[id]/tasks/reschedule-overdue/+server.ts`

**Description:** Find all phases that a task falls within (handles overlapping phases)

🔒 **Authentication Required**

### Parameters

| Name | Type   | Location | Required | Description        |
| ---- | ------ | -------- | -------- | ------------------ |
| id   | string | path     | Yes      | Path parameter: id |

### Responses

| Status | Description      | Content Type     |
| ------ | ---------------- | ---------------- |
| 200    | Success response | application/json |
| 401    | Unauthorized     | application/json |

### Types

```typescript
interface RescheduleResult {
	rescheduled_tasks: Array<{
		task_id: string;
		new_start_date: string;
		reasoning: string;
		days_shifted: number;
	}

interface TaskUpdate {
	id: string;
	start_date: string;
	updated_at: string;
}

interface PhaseAssignment {
	task_id: string;
	phase_ids: string[];
	assignment_reason: string;
}

interface CalendarOperation {
	type: 'update' | 'create';
	task: any;
	newDate: string;
}
```

---

## POST /api/projects/{id}/tasks/unschedule-all

**File:** `src/routes/api/projects/[id]/tasks/unschedule-all/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name | Type   | Location | Required | Description        |
| ---- | ------ | -------- | -------- | ------------------ |
| id   | string | path     | Yes      | Path parameter: id |

### Responses

| Status | Description      | Content Type     |
| ------ | ---------------- | ---------------- |
| 200    | Success response | application/json |
| 401    | Unauthorized     | application/json |

---

## GET /api/projects/briefs-count

**File:** `src/routes/api/projects/briefs-count/+server.ts`

### Parameters

| Name       | Type   | Location | Required | Description                 |
| ---------- | ------ | -------- | -------- | --------------------------- |
| projectIds | string | query    | No       | Query parameter: projectIds |

### Responses

| Status | Description      | Content Type     |
| ------ | ---------------- | ---------------- |
| 200    | Success response | application/json |

---

## GET /api/projects/list

**File:** `src/routes/api/projects/list/+server.ts`

### Parameters

| Name   | Type   | Location | Required | Description             |
| ------ | ------ | -------- | -------- | ----------------------- |
| page   | string | query    | No       | Query parameter: page   |
| limit  | string | query    | No       | Query parameter: limit  |
| status | string | query    | No       | Query parameter: status |
| search | string | query    | No       | Query parameter: search |

### Responses

| Status | Description      | Content Type     |
| ------ | ---------------- | ---------------- |
| 200    | Success response | application/json |

---

## GET /api/projects/search

**File:** `src/routes/api/projects/search/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name  | Type   | Location | Required | Description            |
| ----- | ------ | -------- | -------- | ---------------------- |
| q     | string | query    | No       | Query parameter: q     |
| page  | string | query    | No       | Query parameter: page  |
| limit | string | query    | No       | Query parameter: limit |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 500    | Database error        | application/json |
| 500    | Internal server error | application/json |

---

## GET, DELETE /api/queue-jobs/{id}

**File:** `src/routes/api/queue-jobs/[id]/+server.ts`

### Parameters

| Name | Type   | Location | Required | Description        |
| ---- | ------ | -------- | -------- | ------------------ |
| id   | string | path     | Yes      | Path parameter: id |

### Responses

No documented responses

---

## POST /api/search

**File:** `src/routes/api/search/+server.ts`

🔒 **Authentication Required**

### Parameters

No parameters

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 500    | Database error        | application/json |
| 500    | Internal server error | application/json |
| 400    | Bad request           | application/json |

### Types

```typescript
interface SearchRequest {
	query: string;
	userId?: string; // Optional since we'll get from session
}
```

---

## POST /api/search/more

**File:** `src/routes/api/search/more/+server.ts`

🔒 **Authentication Required**

### Parameters

No parameters

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 500    | Database error        | application/json |
| 500    | Internal server error | application/json |
| 400    | Bad request           | application/json |

### Types

```typescript
interface LoadMoreRequest {
	query: string;
	type: 'braindump' | 'project' | 'task';
	offset?: number;
	userId?: string; // Optional since we'll get from session
}
```

---

## POST /api/stripe/checkout

**File:** `src/routes/api/stripe/checkout/+server.ts`

### Parameters

No parameters

### Responses

No documented responses

---

## GET /api/stripe/invoice/{id}/download

**File:** `src/routes/api/stripe/invoice/[id]/download/+server.ts`

### Parameters

| Name | Type   | Location | Required | Description        |
| ---- | ------ | -------- | -------- | ------------------ |
| id   | string | path     | Yes      | Path parameter: id |

### Responses

No documented responses

---

## POST /api/stripe/portal

**File:** `src/routes/api/stripe/portal/+server.ts`

### Parameters

No parameters

### Responses

No documented responses

---

## POST /api/stripe/webhook

**File:** `src/routes/api/stripe/webhook/+server.ts`

### Parameters

No parameters

### Responses

No documented responses

---

## GET, PATCH, DELETE /api/tasks/{id}/recurrence

**File:** `src/routes/api/tasks/[id]/recurrence/+server.ts`

🔒 **Authentication Required**

### Parameters

| Name  | Type   | Location | Required | Description            |
| ----- | ------ | -------- | -------- | ---------------------- |
| id    | string | path     | Yes      | Path parameter: id     |
| scope | string | query    | No       | Query parameter: scope |
| date  | string | query    | No       | Query parameter: date  |

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 404    | Resource not found    | application/json |
| 500    | Internal server error | application/json |
| 400    | Bad request           | application/json |

---

## GET, POST, PUT, DELETE /api/templates

**File:** `src/routes/api/templates/+server.ts`

### Parameters

| Name | Type   | Location | Required | Description           |
| ---- | ------ | -------- | -------- | --------------------- |
| type | string | query    | No       | Query parameter: type |
| id   | string | query    | No       | Query parameter: id   |

### Responses

No documented responses

---

## POST /api/transcribe

**File:** `src/routes/api/transcribe/+server.ts`

🔒 **Authentication Required**

### Parameters

No parameters

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 401    | Unauthorized          | application/json |
| 500    | Internal server error | application/json |
| 400    | Bad request           | application/json |

---

## GET, PUT /api/users/calendar-preferences

**File:** `src/routes/api/users/calendar-preferences/+server.ts`

### Parameters

No parameters

### Responses

No documented responses

---

## POST /api/visitors

**File:** `src/routes/api/visitors/+server.ts`

### Parameters

No parameters

### Responses

| Status | Description           | Content Type     |
| ------ | --------------------- | ---------------- |
| 200    | Success response      | application/json |
| 500    | Database error        | application/json |
| 500    | Internal server error | application/json |

---
