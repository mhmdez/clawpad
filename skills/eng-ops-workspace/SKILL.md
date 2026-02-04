---
name: eng-ops-workspace
description: Engineering operations workspace skill for ClawPad. Use when creating or managing: (1) Migration plans and tracking docs, (2) Infrastructure audits and cleanup plans, (3) Cost optimization analysis, (4) Security audits and compliance docs, (5) Runbooks and procedures, (6) Implementation status tracking, (7) Risk assessments, (8) Architecture decisions (ADRs). Triggers on requests for ops documentation, planning, auditing, or tracking engineering projects in your ClawPad workspace.
---

# Engineering Ops Workspace

Structured documentation system for engineering operations in ClawPad—migrations, infrastructure, DevOps, security, and team management.

## Workspace Structure

Create this structure in your ClawPad pages (`~/.openclaw/pages/`):

```
eng-ops/                    # Space for engineering ops
├── infrastructure/
│   ├── aws/
│   │   ├── cleanup-YYYY-MM/
│   │   └── runbooks/
│   └── cost-optimization/
├── devops/
│   ├── migrations/
│   └── runbooks/
├── security/
│   ├── audits/
│   └── access-reviews/
├── architecture/
│   └── decisions/          # ADRs
└── team/
    └── processes/
```

## Document Types

### 1. Migration Plan

**File:** `eng-ops/devops/migrations/source-to-dest.md`

```markdown
---
title: Source to Destination Migration
icon: 🔄
tags:
  - migration
  - active
---

# [Source] to [Destination] Migration Plan

**Created:** YYYY-MM-DD
**Status:** Planning | In Progress | ✅ Complete
**Author:** [Name]

## Overview

| Aspect | Details |
|--------|---------|
| Source | [Source system] |
| Destination | [Target system] |
| Risk Level | **HIGH/MEDIUM/LOW** |

---

## Risk Assessment

### HIGH RISK Items
| Risk | Impact | Mitigation |
|------|--------|------------|
| [Risk] | [Impact] | [Mitigation] |

---

## Migration Phases

### Phase 0: Discovery & Audit
**Goal:** [Clear objective]

\`\`\`bash
# Discovery commands
\`\`\`

**Deliverables:**
- [ ] Resource inventory
- [ ] Dependency map

### Phase 1: Execution
**Goal:** [Objective]

- [ ] Task 1
- [ ] Task 2

---

## Rollback Plan
[Steps to revert]
```

### 2. Tracking Document

**File:** `eng-ops/devops/migrations/source-tracking.md`

```markdown
---
title: Migration Tracking
icon: 📊
tags:
  - tracking
---

# [Project] - Execution Tracking

**Started:** YYYY-MM-DD
**Status:** 🔄 In Progress

---

## Quick Reference

| Item | Value |
|------|-------|
| Source | [value] |
| Destination | [value] |

---

## Pre-Execution Checklist

- [x] Blocker 1 verified ✅
- [ ] Blocker 2 pending

---

## Verification Results

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| Item 1 | X | Y | ✅/❌ |

---

## Notes & Issues Log

| Date | Issue | Resolution |
|------|-------|------------|
| YYYY-MM-DD | Started | - |
```

### 3. Cleanup/Audit Plan

**File:** `eng-ops/infrastructure/aws/cleanup-2026-01.md`

```markdown
---
title: AWS Cleanup Jan 2026
icon: 🧹
tags:
  - aws
  - cost-optimization
---

# AWS Cleanup Plan

**Account:** [identifier]
**Date:** YYYY-MM-DD

---

## Execution Log

| Date | Action | Status | Savings |
|------|--------|--------|---------|
| YYYY-MM-DD | Action | COMPLETED | $X/year |

**Total Savings: $X/year**

---

## Remaining Opportunities

| Resource | Details | Savings | Status |
|----------|---------|---------|--------|
| Item | Description | $X/year | READY |
```

### 4. Runbook

**File:** `eng-ops/devops/runbooks/procedure-name.md`

```markdown
---
title: Procedure Name
icon: 📋
tags:
  - runbook
---

# [Procedure] Runbook

**Last Updated:** YYYY-MM-DD
**Owner:** [Team]

## Prerequisites

- [ ] Access to [system]
- [ ] [Tool] installed

## Procedure

### Step 1: [Name]

\`\`\`bash
command --flag value
\`\`\`

**Verify:**
- [ ] Expected result

## Troubleshooting

### Issue: [Problem]
**Solution:**
\`\`\`bash
# Fix command
\`\`\`

## Rollback
\`\`\`bash
# Rollback commands
\`\`\`
```

## Conventions

### Naming
- **Projects:** `<topic>-YYYY-MM` (e.g., `aws-cleanup-2026-01`)
- **Migrations:** `<source>-to-<dest>.md`

### Status Indicators
- ✅ Complete
- ⏳ In Progress
- ⏸️ Pending
- ❌ Blocked
- ⚠️ Warning

### Frontmatter
Always include ClawPad frontmatter:
```yaml
---
title: Document Title
icon: 📄
tags:
  - tag1
  - tag2
---
```

### Tables
Use tables for structured data:
- Risk assessments
- Verification results
- Status tracking

### Checklists
```markdown
- [x] Completed ✅
- [ ] Pending
```

## Workflow

### Creating a New Project

1. Create space: `eng-ops/` in ClawPad
2. Create subdirectory for domain
3. Start with plan or analysis document
4. Add tracking document when execution begins
5. Update status as you progress

### Using with OpenClaw Agent

Your agent can:
- Create new pages in the workspace
- Update checklists and status
- Add entries to execution logs
- Generate reports from tracking data

All changes sync instantly in ClawPad UI.

## References

- `references/templates.md` - Full document templates
