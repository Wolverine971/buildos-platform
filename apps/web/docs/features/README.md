<!-- apps/web/docs/features/README.md -->

# Features Documentation

This directory contains comprehensive documentation for all BuildOS web application features, including specifications, implementation guides, and testing procedures.

## ✅ Documented Features

### 🧠 Brain Dump System (10 docs)

**Entry Point**: [/braindump-context/README.md](braindump-context/README.md)

AI-powered stream-of-consciousness input processing:

- Long-form brain dumps with dual processing
- Short quick-capture updates
- Preparatory analysis for token savings
- Concurrent processing (up to 3 simultaneous)
- Phase-based task organization

**Key Docs**:

- Implementation phases
- Preparatory analysis integration
- Multi-brain-dump system
- Testing guides

---

### 📅 Calendar Integration (7 docs)

**Entry Point**: [/calendar-integration/README.md](calendar-integration/README.md)

Google Calendar synchronization and project-specific calendars:

- OAuth integration
- Bidirectional event sync
- LLM-powered project detection
- Webhook notifications
- Conflict resolution
- Per-project calendar management

**Key Docs**:

- Integration planning and implementation
- Bug fixes and improvements
- Calendar analysis and ingestion

---

### 🔔 Notification System (6 docs)

**Entry Point**: [/notifications/NOTIFICATION_SYSTEM_DOCS_MAP.md](notifications/NOTIFICATION_SYSTEM_DOCS_MAP.md) ⭐

Generic stackable notification system:

- Multiple concurrent notifications
- Minimized and expanded views
- Modal coordination
- Progress tracking (streaming, step-based, binary)
- Real-time updates

**Key Docs**:

- Complete system map and navigation
- Technical specification (1,729 lines)
- Implementation and API reference
- QA checklist and bug fixes

---

### 👤 Admin Dashboard (1 doc)

**Entry Point**: [/admin-dashboard/README.md](admin-dashboard/README.md)

LLM usage tracking and analytics:

- Real-time usage metrics
- Cost analytics
- Model/operation breakdowns
- Performance monitoring
- User cost analysis

---

### 🚀 Onboarding (V3 + Legacy Archive)

**Entry Points**:

- Current: [/onboarding/README.md](onboarding/README.md)
- Legacy V2 notes: [/onboarding/ONBOARDING_V2_UPDATED_SPEC.md](onboarding/ONBOARDING_V2_UPDATED_SPEC.md)

User onboarding flows:

- V3: 4-step onboarding focused on intent/stakes, real project creation, and notification setup
- V2: archived historical implementation reference

---

### 📊 Project Export (2 docs)

**Entry Point**: [/project-export/](project-export/)

Project export and printing:

- PDF export migration
- Browser print implementation

---

### 📋 Phase Generation (1 doc)

**Entry Point**: [/phase-generation/](phase-generation/)

Intelligent task phase organization:

- Procedural phase generation
- Calendar-aware scheduling

---

### 📅 Time Blocks (1 doc)

**Entry Point**: [/time-blocks/README.md](time-blocks/README.md)

Time block scheduling system.

---

## 🎯 Quick Navigation

| Feature          | Status      | Docs | Entry Point                                                                           |
| ---------------- | ----------- | ---- | ------------------------------------------------------------------------------------- |
| Brain Dump       | ✅ Complete | 10   | [README](braindump-context/README.md)                                                 |
| Calendar         | ✅ Complete | 7    | [README](calendar-integration/README.md)                                              |
| Notifications    | ✅ Complete | 6    | [MAP](notifications/NOTIFICATION_SYSTEM_DOCS_MAP.md) ⭐                               |
| Admin Dashboard  | ✅ Complete | 1    | [README](admin-dashboard/README.md)                                                   |
| Onboarding       | ✅ Active   | 2    | [Current](onboarding/README.md) [Legacy V2](onboarding/ONBOARDING_V2_UPDATED_SPEC.md) |
| Project Export   | ✅ Complete | 2    | [DIR](project-export/)                                                                |
| Phase Generation | ✅ Complete | 1    | [DIR](phase-generation/)                                                              |
| Time Blocks      | ✅ Complete | 1    | [README](time-blocks/README.md)                                                       |

## 📂 Directory Structure

```
/features/
├── README.md (this file)
├── /braindump-context/    (10 docs)
├── /calendar-integration/ (7 docs)
├── /notifications/        (6 docs)
├── /admin-dashboard/      (1 doc)
├── /onboarding/          (active docs)
├── /project-export/      (2 docs)
├── /phase-generation/    (1 doc)
└── /time-blocks/         (1 doc)
```

## 🔍 How to Use This Directory

### Understanding a Feature

1. Find the feature in the table above
2. Go to entry point (usually README.md in that directory)
3. Follow cross-references to related docs
4. Check `/apps/web/docs/technical/` for implementation details

### Finding Implementation Details

1. Read feature spec here
2. Check `/apps/web/docs/technical/api/endpoints/[feature].md` for API docs
3. Check `/apps/web/docs/technical/architecture/` for architecture
4. Look in `/src/lib/components/` for component code

### Testing a Feature

1. Find feature docs here
2. Check for testing guides or QA checklists
3. See `/apps/web/docs/technical/testing/TESTING_CHECKLIST.md` for general procedures

## 🔗 Related Documentation

- **Technical Implementation**: `/apps/web/docs/technical/`
- **API Documentation**: `/apps/web/docs/technical/api/`
- **Component Patterns**: `/apps/web/docs/design/`
- **Development Guide**: `/apps/web/docs/development/`

## 📊 Feature Statistics

- **Total Features Documented**: 8 main features
- **Total Feature Documents**: 35+ specification and implementation docs
- **Best-Documented Feature**: Notifications (with dedicated docs map) ⭐
- **Newest major onboarding update**: Onboarding V3

## ⚠️ Known Issues

See `/apps/web/docs/technical/audits/` for:

- Core Columns: ⚠️ Critical gaps in integration
- Other implementation issues and findings

---

**Last Updated**: February 16, 2026
**See Also**: [START-HERE.md](../START-HERE.md) | [README.md](../README.md)
