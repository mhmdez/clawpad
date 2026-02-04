# ClawPad Skills

Community-contributed skills for OpenClaw agents working with ClawPad.

## What are Skills?

Skills are modular packages that extend your OpenClaw agent's capabilities with specialized knowledge, workflows, and templates. They help transform your agent from a general-purpose assistant into a specialized collaborator.

## Available Skills

| Skill | Description |
|-------|-------------|
| [eng-ops-workspace](eng-ops-workspace/) | Engineering operations documentation—migrations, audits, runbooks, and tracking |

## Using Skills

Skills provide templates and workflows for your ClawPad workspace (`~/.openclaw/pages/`). Your OpenClaw agent can use these patterns to create and manage documentation.

## Contributing a Skill

1. Create a directory: `skills/your-skill-name/`
2. Add a `SKILL.md` with:
   - YAML frontmatter (`name`, `description`)
   - Markdown instructions
3. Optionally add:
   - `references/` - detailed documentation
   - `scripts/` - automation scripts
   - `assets/` - templates and files
4. Submit a PR

See [CONTRIBUTING.md](../CONTRIBUTING.md) for general contribution guidelines.

## Skill Format

```
your-skill/
├── SKILL.md           # Required: Main skill definition
├── references/        # Optional: Detailed docs
├── scripts/           # Optional: Automation
└── assets/            # Optional: Templates
```

### SKILL.md Structure

```markdown
---
name: your-skill
description: What it does and when to use it
---

# Your Skill

Instructions and documentation...
```
