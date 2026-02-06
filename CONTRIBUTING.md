# Contributing to ClawPad

Thanks for your interest in contributing! ClawPad is an open-source workspace for OpenClaw, and we welcome contributions of all kinds.

## Getting Started

1. **Fork and clone** the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/clawpad.git
   cd clawpad
   ```

2. **Install dependencies** (we use pnpm):
   ```bash
   pnpm install
   ```

3. **Start the dev server:**
   ```bash
   pnpm dev
   ```

4. **Open** [http://localhost:3000](http://localhost:3000) and start hacking.

## Code Style

- **TypeScript** — Strict mode is on. No `any` unless absolutely necessary (and even then, leave a comment explaining why).
- **Tailwind CSS v4** — Utility-first styling. Avoid custom CSS files unless building a truly unique component.
- **shadcn/ui** — Use existing components from `src/components/ui/` before building new ones. Add new shadcn components via `npx shadcn@latest add <component>`.
- **Naming** — Components: `PascalCase`. Files: `kebab-case.tsx`. Hooks: `use-kebab-case.ts`.
- **Imports** — Use `@/` path alias (e.g., `import { Button } from "@/components/ui/button"`).

## Making Changes

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feat/your-feature
   ```

2. **Make your changes.** Follow the existing patterns in the codebase.

3. **Test your changes:**
   ```bash
   pnpm build     # Must pass clean
   pnpm lint       # No lint errors
   ```

4. **Commit** with a clear message:
   ```
   feat: add keyboard shortcut for duplicating pages
   fix: sidebar not updating after file rename
   docs: update architecture diagram
   ```

5. **Push** and open a Pull Request against `main`.

## PR Guidelines

- Keep PRs focused — one feature or fix per PR.
- Include a brief description of what changed and why.
- If it's a UI change, include a screenshot or screen recording.
- Make sure the build passes before requesting review.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for a technical overview of how ClawPad works.

## Questions?

Open an issue or email mhmdez@me.com if you need help.
