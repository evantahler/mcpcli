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
