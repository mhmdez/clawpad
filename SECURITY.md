# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| latest  | ✅        |

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

Instead, please email security concerns to the maintainers privately. You can reach us through the [OpenClaw Discord](https://discord.gg/openclaw) via DM, or open a [GitHub Security Advisory](https://github.com/mhmdez/clawpad/security/advisories/new).

We will acknowledge your report within 48 hours and aim to provide a fix or mitigation within 7 days for critical issues.

## Scope

ClawPad runs locally and connects to a local OpenClaw gateway. Security concerns include:

- **Gateway token exposure** — The gateway token should never be committed or exposed in client-side code.
- **Path traversal** — File operations should be scoped to the configured pages directory.
- **XSS via editor content** — User-generated markdown/HTML must be sanitized before rendering.
- **Dependency vulnerabilities** — We monitor dependencies and update regularly.

## Best Practices for Contributors

- Never commit secrets, tokens, or credentials.
- Use environment variables for sensitive configuration.
- Sanitize all user input before rendering or file system operations.
- Keep dependencies up to date (`pnpm audit`).
