# CLAUDE.md

## Project

mcpx — A CLI for MCP servers. "curl for MCP."

## Commands

- `bun run dev` — Run in development mode
- `bun test` — Run tests
- `bun lint` — Check formatting and types
- `bun format` — Auto-fix formatting
- `bun run build` — Build single binary

## Rules

- **Always bump the patch version in `package.json`** when making any code changes (source, tests, config). Use semver: patch for fixes/small changes, minor for new features, major for breaking changes.
- **Always keep `README.md`, `.claude/skills/mcpx.md`, and `.cursor/rules/mcpx.mdc` in sync** with any CLI changes (commands, flags, syntax, examples). Both skill files include workflow steps, code examples, and a command table that must all reflect the current CLI surface.
- **Always run `bun run format`** before committing to fix formatting issues.
- **Always use the logger** (`src/output/logger.ts`) for diagnostic output instead of `process.stderr.write` or raw `console.error`/`console.warn`. The logger is spinner-aware and respects JSON/TTY/log-level configuration. Use `logger.error` / `logger.warn` / `logger.info` / `logger.debug` for line-oriented messages, or `logger.writeRaw` when you need to preserve hand-rolled ANSI / newlines (e.g., interactive prompts). `console.log` for structured stdout output is still fine.
- **Never merge or auto-merge a PR without explicit human approval.** Create the PR and report the URL, but do not merge it. The human will review and merge manually.
- **When a PR closes a GitHub issue, include `Closes <issue URL>` in the PR body** (e.g., `Closes https://github.com/arcadeai-labs/mcpx/issues/29`). This lets GitHub auto-close the issue when the PR is merged.
