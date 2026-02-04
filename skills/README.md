# ClawPad Skills

Community skills for enhancing ClawPad workspaces.

## Available Skills

| Skill | Description |
|-------|-------------|
| [workspace-manager](./workspace-manager/) | Workspace setup and organization assistant. Helps users create personalized folder structures based on their domain (engineering, research, business, creative, personal). |

## Installing Skills

Skills are automatically discovered by OpenClaw from `~/.openclaw/workspace/skills/`.

To install a skill:

```bash
# Copy the skill folder to your OpenClaw workspace
cp -r skills/workspace-manager ~/.openclaw/workspace/skills/
```

Or symlink for development:

```bash
ln -s $(pwd)/skills/workspace-manager ~/.openclaw/workspace/skills/workspace-manager
```

## Creating Skills

See [OpenClaw Skills Documentation](https://docs.openclaw.ai/skills) for the full guide.

Basic structure:
```
skills/
└── your-skill/
    ├── SKILL.md      # Main skill definition (required)
    └── references/   # Optional supporting files
```

The `SKILL.md` file should have YAML frontmatter with `name` and `description`, followed by markdown instructions for the agent.
