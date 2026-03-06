# CLAUDE.md

## Project

mcpcli — A CLI for MCP servers. "curl for MCP."

## Commands

- `bun run dev` — Run in development mode
- `bun test` — Run tests
- `bun lint` — Check formatting (prettier)
- `bun format` — Auto-fix formatting
- `bun run build` — Build single binary

## Rules

- **Always bump the patch version in `package.json`** when making any code changes (source, tests, config). Use semver: patch for fixes/small changes, minor for new features, major for breaking changes.
- **Always keep `README.md` and `.claude/skills/mcpcli.md` in sync** with any CLI changes (commands, flags, syntax, examples). The skill file includes workflow steps, code examples, and a command table that must all reflect the current CLI surface.
- **Always run `bun run format`** before committing to fix prettier formatting issues.
