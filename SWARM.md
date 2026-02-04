# SWARM.md — ClawPad v2 Execution Tracker

**Master orchestration document for swarm agent execution.**
**Last updated:** (auto-updated by swarm runner)

---

## Execution Rules

1. Each task has a spec doc in `specs/` with full context
2. Agents work on PENDING tasks, set to IN_PROGRESS, then DONE or FAILED
3. Max 3 concurrent agents to avoid git conflicts
4. Each agent commits its work before marking DONE
5. After DONE, a review agent audits the work
6. REVIEWED = passes audit. FAILED = needs re-work with notes

## Task Status Key

| Status | Meaning |
|--------|---------|
| PENDING | Not started |
| IN_PROGRESS | Agent working on it |
| DONE | Agent finished, awaiting review |
| REVIEW | Review agent auditing |
| REVIEWED | Passes audit, complete |
| FAILED | Needs re-work (see notes) |

---

## Tasks

### Wave 1 — Core Features (parallel, no dependencies)

| # | Task | Spec | Status | Agent | Notes |
|---|------|------|--------|-------|-------|
| 01 | Editor Slash Commands & Custom Blocks | [specs/01](specs/01-editor-slash-commands.md) | DONE | swarm-01 | ✅ 8 commands + callout block |
| 02 | AI Writing UX — Selection Toolbar | [specs/02](specs/02-ai-writing-ux.md) | DONE | swarm-02 | ✅ 3-phase flow + Cmd+J |
| 03 | Command Palette Enhancement | [specs/03](specs/03-command-palette.md) | DONE | swarm-03 | ✅ All 4 subtasks |
| 04 | Dark Mode | [specs/04](specs/04-dark-mode.md) | DONE | swarm-04 | ✅ System detect + toggle + audit |

### Wave 2 — Polish (after Wave 1 stable)

| # | Task | Spec | Status | Agent | Notes |
|---|------|------|--------|-------|-------|
| 05 | Mobile Responsive Layout | [specs/05](specs/05-mobile-responsive.md) | DONE | swarm-05 | ✅ Bottom tabs + full-screen panels |
| 06 | Keyboard Shortcuts System | [specs/06](specs/06-keyboard-shortcuts.md) | DONE | swarm-06 | ✅ 12 shortcuts + hints + conflict fix |
| 07 | Image Upload in Chat | [specs/07](specs/07-image-upload-chat.md) | DONE | swarm-07 | ✅ Paste/drag/picker + gateway API |
| 08 | Search Integration | [specs/08](specs/08-search-integration.md) | DONE | swarm-08 | ✅ Relevance scoring + QMD + search page |

### Wave 3 — Ship (after Wave 2)

| # | Task | Spec | Status | Agent | Notes |
|---|------|------|--------|-------|-------|
| 09 | npm Package (`npx clawpad`) | [specs/09](specs/09-npm-package.md) | DONE | swarm-09 | ✅ CLI + standalone + gateway detect |

---

## Progress Summary

- **Total:** 9 tasks
- **Pending:** 0
- **In Progress:** 0
- **Done:** 9
- **Reviewed:** 0
- **Failed:** 0
