# Engineering Ops Templates

Complete templates for ClawPad engineering operations documents.

## Migration Plan Template

```markdown
---
title: [Source] to [Destination] Migration
icon: 🔄
tags:
  - migration
  - [status]
---

# [Source] to [Destination] Migration Plan

**Created:** YYYY-MM-DD
**Status:** Planning | In Progress | ✅ Complete
**Author:** Engineering Operations

## Overview

Migrate [what] from [source] to [destination].

| Aspect | Details |
|--------|---------|
| Source | [Source system/org] |
| Destination | [Target system/org] |
| Method | [Transfer method] |
| Risk Level | **HIGH/MEDIUM/LOW** |
| Timeline | [Duration estimate] |

---

## Risk Assessment Summary

### HIGH RISK Items
| Risk | Impact | Mitigation |
|------|--------|------------|
| [Risk description] | [What breaks] | [How to prevent/fix] |

### MEDIUM RISK Items
| Risk | Impact | Mitigation |
|------|--------|------------|
| [Risk description] | [What breaks] | [How to prevent/fix] |

### LOW RISK Items
- [Item 1]
- [Item 2]

---

## Migration Phases

### Phase 0: Discovery & Audit (Week 1)

**Goal:** Complete inventory of [source]

#### 0.1 [Resource] Audit
\`\`\`bash
# Commands to discover resources
\`\`\`

#### 0.2 [Dependency] Mapping
\`\`\`bash
# Commands to map dependencies
\`\`\`

**Deliverables:**
- [ ] `resource-inventory.md`
- [ ] `dependency-map.md`

---

### Phase 1: Pre-Migration Preparation (Week 2)

**Goal:** Set up [destination] to receive [resources]

#### 1.1 Create [Required Resources]
\`\`\`bash
# Setup commands
\`\`\`

#### 1.2 Resolve Conflicts
\`\`\`bash
# Conflict resolution commands
\`\`\`

**Deliverables:**
- [ ] [Destination] configured
- [ ] Conflicts resolved

---

### Phase 2: Migration Execution (Week 3)

**Goal:** Transfer [resources] with verification

#### Pre-Transfer Checklist
\`\`\`bash
# Verification commands before transfer
\`\`\`

#### Transfer Command
\`\`\`bash
# Actual transfer command
\`\`\`

#### Post-Transfer Verification
\`\`\`bash
# Verification commands after transfer
\`\`\`

---

### Phase 3: Verification & Cleanup (Week 4)

#### Verification Checklist
- [ ] All [resources] transferred
- [ ] All [systems] working
- [ ] All [users] have access
- [ ] No [errors] reported

#### Cleanup
\`\`\`bash
# Archive/cleanup commands
\`\`\`

---

## Rollback Procedures

### Single [Resource] Rollback
\`\`\`bash
# Rollback single item
\`\`\`

### Full Rollback (Emergency)
\`\`\`bash
# Full rollback commands
\`\`\`

---

## Success Metrics

| Metric | Target |
|--------|--------|
| [Resources] migrated | 100% |
| [System] uptime | >99% |
| [Errors] reported | 0 |
```

---

## Tracking Document Template

```markdown
---
title: [Project] Tracking
icon: 📊
tags:
  - tracking
  - [status]
---

# [Project] - Execution Tracking

**Started:** YYYY-MM-DD
**Status:** 🔄 In Progress
**Approach:** [Method/Option chosen]

---

## Quick Reference

| Item | Value |
|------|-------|
| Source | [value] |
| Destination | [value] |
| Resources | [count] |
| Estimated Time | [duration] |

---

## Pre-Execution Checklist

### Blockers Verified
- [ ] Blocker 1 checked
- [ ] Blocker 2 checked
- [ ] Blocker 3 checked

### Communication
- [ ] Team notified
- [ ] Stakeholders informed
- [ ] Schedule confirmed

---

## Execution

### Step 1: [Name]
**Status:** ⏳ Pending

**Instructions:**
1. [Step]
2. [Step]

- [ ] Task 1
- [ ] Task 2

---

## Verification Results

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| [Check 1] | [X] | - | ⏳ |
| [Check 2] | [Y] | - | ⏳ |

---

## Success Criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

---

## Post-Execution Tasks

- [ ] Notify completion
- [ ] Update documentation
- [ ] Archive source

---

## Notes & Issues Log

| Date | Issue | Resolution |
|------|-------|------------|
| YYYY-MM-DD | Started | - |
```

---

## Implementation Status Template

```markdown
---
title: [Project] Status
icon: 📈
tags:
  - status
  - implementation
---

# [Project] - Implementation Status

**Last Updated:** YYYY-MM-DD HH:MM
**Status:** Phases 0-X Complete, Phase Y Pending

---

## Executive Summary

| Phase | Status | Key Actions |
|-------|--------|-------------|
| Phase 0 | ✅ COMPLETE | Summary |
| Phase 1 | ⏳ IN PROGRESS | Summary |
| Phase 2 | ⏸️ PENDING | Summary |

### Quick Stats
- **Metric 1:** Value
- **Metric 2:** Value

---

## Phase 0: [Name] ✅

### Completed Actions
- [x] Action 1
- [x] Action 2

### Key Findings
- Finding 1
- Finding 2

---

## Phase 1: [Name] ⏳

### In Progress
- [ ] Task 1
- [ ] Task 2
```

---

## Runbook Template

```markdown
---
title: [Procedure] Runbook
icon: 📋
tags:
  - runbook
  - [category]
---

# [Procedure Name] Runbook

**Last Updated:** YYYY-MM-DD
**Owner:** [Team/Person]
**Frequency:** [When to use]

## Overview

[1-2 sentences describing when and why to use this runbook]

## Prerequisites

- [ ] Access to [system]
- [ ] Permissions for [action]
- [ ] [Tool] installed

## Procedure

### Step 1: [Name]

\`\`\`bash
# Command with description
command --flag value
\`\`\`

**Expected output:**
\`\`\`
[Example output]
\`\`\`

### Step 2: [Name]

\`\`\`bash
# Next command
\`\`\`

**Verify:**
- [ ] [Verification step]

## Troubleshooting

### Issue: [Common problem]

**Symptoms:** [What you see]

**Solution:**
\`\`\`bash
# Fix command
\`\`\`

## Rollback

If something goes wrong:

\`\`\`bash
# Rollback commands
\`\`\`

## Related Runbooks

- [Related Runbook 1](link)
- [Related Runbook 2](link)
```

---

## Analysis Document Template

```markdown
---
title: [Topic] Analysis
icon: 🔍
tags:
  - analysis
  - [category]
---

# [Topic] - Analysis

## Situation
- **Target**: ...
- **Scenario**: ...
- **Goal**: ...

---

## TL;DR Summary

| Question | Answer | Verified? |
|----------|--------|-----------|
| Question 1 | Answer | ✅ |

---

## Option Comparison

| Factor | Option A | Option B |
|--------|----------|----------|
| Effort | Low | High |
| Risk | ... | ... |

### Recommendation
- **If [condition]**: Option A
- **If [condition]**: Option B

---

## Validated Data

### [Category]
| Metric | Value |
|--------|-------|

---

## Next Steps
[If applicable]
```
