# mcpcli — Implementation Plan

## Package Choices

| Concern                 | Package                     | Why                                                                                                                                                                                   |
| ----------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime                 | Bun                         | Native TS, fast startup, built-in test runner, `bun build --compile` for binaries                                                                                                     |
| CLI framework           | `commander`                 | Battle-tested, massive ecosystem, great subcommand support. `citty` is a modern alternative but commander has more docs/examples                                                      |
| MCP client              | `@modelcontextprotocol/sdk` | Official SDK — provides `Client`, `StdioClientTransport`, `StreamableHTTPClientTransport`, OAuth helpers, tool types                                                                  |
| JSON Schema validation  | `ajv`                       | Industry standard for validating against JSON Schema at runtime. MCP tools expose `inputSchema` as JSON Schema — Zod cannot validate against a JSON Schema object received at runtime |
| Glob matching (strings) | `picomatch`                 | 3KB, fastest, zero deps — matches tool names against glob patterns without touching filesystem                                                                                        |
| Cosine similarity       | Hand-rolled (~10 lines)     | Pure arithmetic, no deps needed. For 1000 vectors of dim 384, <5ms in Bun                                                                                                             |
| Linting                 | `prettier`                  | Code formatting with 100-char width, 2-space indent, trailing commas                                                                                                                  |
| Embeddings              | `@huggingface/transformers` | Xenova/all-MiniLM-L6-v2 ONNX model (~23MB, 384-dim). No API keys — runs fully local in-process                                                                                        |
| Terminal colors         | `ansis`                     | Lightweight ANSI color codes for human-friendly output                                                                                                                                |
| Spinners                | `nanospinner`               | Simple CLI progress indicators                                                                                                                                                        |

## Directory Structure

```
mcpcli/
├── src/
│   ├── cli.ts                  # Entry point — shebang, commander setup, subcommand registration
│   ├── context.ts              # AppContext builder — config, manager, format options
│   ├── commands/
│   │   ├── list.ts             # Default command — list servers and tools
│   │   ├── info.ts             # info <server> and info <server>/<tool>
│   │   ├── search.ts           # search <query> (--keyword, --semantic)
│   │   ├── call.ts             # call <server> <tool> [json]
│   │   ├── auth.ts             # auth, deauth commands with OAuth flow and status
│   │   └── index.ts            # index command for building search.json
│   ├── config/
│   │   ├── loader.ts           # Config resolution (env → flag → cwd → ~/.config)
│   │   ├── schemas.ts          # TypeScript interfaces, type guards, validation functions
│   │   └── env.ts              # ${VAR_NAME} interpolation in config values
│   ├── client/
│   │   ├── manager.ts          # ServerManager — connects to servers, caches clients, lazy init
│   │   ├── stdio.ts            # Stdio transport setup (spawn child process)
│   │   ├── http.ts             # HTTP/StreamableHTTP transport setup, debug fetch
│   │   └── oauth.ts            # OAuthClientProvider implementation (token storage, browser flow, callback server)
│   ├── search/
│   │   ├── index.ts            # Unified search: keyword + semantic, merge & rank
│   │   ├── keyword.ts          # Glob/substring matching via picomatch
│   │   ├── semantic.ts         # Embedding generation (huggingface transformers) + cosine similarity
│   │   └── indexer.ts          # Build/update search.json — extract scenarios + keywords, generate embeddings
│   ├── validation/
│   │   └── schema.ts           # ajv-based input validation against tool inputSchema
│   └── output/
│       ├── formatter.ts        # Human-friendly vs JSON output, TTY detection, colors
│       └── spinner.ts          # CLI spinner state management
├── skills/
│   └── mcpcli.md               # Claude Code skill file
├── test/
│   ├── cli.test.ts
│   ├── commands/
│   │   ├── list.test.ts
│   │   ├── info.test.ts
│   │   ├── search.test.ts
│   │   ├── call.test.ts
│   │   └── auth.test.ts
│   ├── config/
│   │   ├── loader.test.ts
│   │   └── env.test.ts
│   ├── client/
│   │   ├── manager.test.ts
│   │   └── oauth.test.ts
│   ├── search/
│   │   ├── keyword.test.ts
│   │   ├── semantic.test.ts
│   │   └── indexer.test.ts
│   ├── validation/
│   │   └── schema.test.ts
│   ├── output/
│   │   └── formatter.test.ts
│   └── fixtures/
│       ├── mock-server.ts      # Minimal stdio MCP server for testing
│       ├── servers.json
│       ├── auth.json
│       └── search.json
├── .github/
│   └── workflows/
│       ├── ci.yml              # Lint + test on push/PR
│       └── release.yml         # Publish npm + build binaries on release
├── .prettierrc                 # Prettier config
├── .prettierignore             # Prettier ignore patterns
├── .gitignore
├── package.json
├── tsconfig.json
├── bun.lock
├── install.sh                  # Curl installer for binary distribution
├── README.md
├── plan.md
├── LICENSE
└── dist/
    └── mcpcli                  # Compiled binary (created by build)
```

## Implementation Phases

### Phase 1: Project Bootstrap ✅

**Goal:** Skeleton that compiles and runs `mcpcli --help`.

1. `bun init` — create package.json, tsconfig.json
2. Install deps:
   ```bash
   bun add @modelcontextprotocol/sdk commander ajv picomatch ansis nanospinner @huggingface/transformers
   bun add -d prettier @types/bun @types/picomatch
   ```
3. Configure package.json with scripts (dev, test, lint, format, build)
4. Create `src/cli.ts` with shebang, commander program, register all subcommands as stubs
5. Configure `.prettierrc` (100 char width, 2 space indent)
6. Configure tsconfig.json (strict, ESM, Bun types)
7. Verify: `bun run src/cli.ts --help` shows all commands

### Phase 2: Config Loading ✅

**Goal:** Read and validate `servers.json`, resolve config paths, interpolate env vars.

1. **`src/config/schemas.ts`** — TypeScript interfaces for all three config files:
   - `ServerConfig` — discriminated union: `StdioServerConfig | HttpServerConfig`
   - `AuthEntry` / `AuthFile` — per-server token storage
   - `SearchIndex` / `IndexedTool` — tools array with scenarios, keywords, embeddings
   - Manual validation functions (`validateServersFile`, `validateAuthFile`, `validateSearchIndex`)
2. **`src/config/env.ts`** — `interpolateEnv(value: string): string`
   - Regex for `${VAR_NAME}`, replace from `process.env`
   - `MCP_STRICT_ENV=true` → throw on missing, `false` → warn and leave empty
3. **`src/config/loader.ts`** — `loadConfig(options): Config`
   - Resolution order: `-c` flag → `MCP_CONFIG_PATH` → `./servers.json` → `~/.config/mcpcli/servers.json`
   - Parse JSON, validate, interpolate env vars in all string values
   - Return typed config object
   - Create config dir if it doesn't exist
   - Load auth.json and search.json from same directory (create empty if missing)

### Phase 3: Server Connection (Stdio + HTTP) ✅

**Goal:** Connect to MCP servers, list their tools.

1. **`src/client/stdio.ts`** — `createStdioTransport(config): StdioClientTransport`
2. **`src/client/http.ts`** — `createHttpTransport(config, authProvider?): StreamableHTTPClientTransport`
3. **`src/client/manager.ts`** — `ServerManager` class
   - Lazy-init, connection caching, concurrent connections (up to `MCP_CONCURRENCY`)
   - Tool filtering via picomatch (allowedTools/disabledTools)
   - Graceful shutdown
   - Timeout support via `MCP_TIMEOUT` env var
   - Retry support via `MCP_MAX_RETRIES` env var

### Phase 4: Core Commands — list, info, call ✅

**Goal:** The three essential commands work end-to-end.

1. **`src/output/formatter.ts`** — Human-friendly vs JSON output, TTY detection, colors
2. **`src/output/spinner.ts`** — CLI spinner wrapper
3. **`src/commands/list.ts`** — default command with `-d` descriptions flag
4. **`src/commands/info.ts`** — server and server/tool inspection
5. **`src/commands/call.ts`** — tool execution with JSON args, stdin support

### Phase 5: OAuth Authentication ✅

**Goal:** Automatic OAuth for HTTP MCP servers, manual `auth` command for explicit flows.

1. **`src/client/oauth.ts`** — `McpOAuthProvider` implementing SDK's `OAuthClientProvider`
   - Dynamic client registration, token lifecycle, browser-based flow
   - Local callback server on random port via `Bun.serve()`
   - Automatic token refresh before expiration
   - OAuth metadata auto-discovery via `.well-known/oauth-authorization-server`
2. **`src/commands/auth.ts`** — auth (flow, status, refresh) and deauth commands

### Phase 6: Input Validation ✅

**Goal:** Validate tool call arguments against inputSchema before sending to server.

1. **`src/validation/schema.ts`** — AJV-based validation with compiled validator caching
   - Required field checking, type validation, enum values, nested objects
   - Graceful degradation if schema unavailable

### Phase 7: Search — Keyword + Semantic ✅

**Goal:** Unified `search` command combining keyword and vector search.

1. **`src/search/keyword.ts`** — Glob/substring matching via picomatch with field weighting
2. **`src/search/semantic.ts`** — Xenova/all-MiniLM-L6-v2 embeddings (384-dim) + cosine similarity
3. **`src/search/indexer.ts`** — Index building with scenario/keyword extraction, incremental updates
4. **`src/search/index.ts`** — Unified search merging keyword (40%) + semantic (60%) scores

### Phase 8: Output Formatting ✅

**Goal:** Polish human-readable output with colors and alignment.

1. TTY detection: `process.stdout.isTTY` — human mode if true, JSON if false
2. `--json` flag: force JSON even in TTY
3. Color scheme: cyan servers, bold tools, green/yellow/dim scores, red errors
4. Column alignment, error output to stderr

### Phase 9: Claude Code Skill ✅

**Goal:** Ship a skill file that teaches Claude Code to use mcpcli.

1. **`skills/mcpcli.md`** — Search → Inspect → Call workflow with examples and rules

### Phase 10: CI/CD ✅

**Goal:** Automated testing on PRs, publishing on releases.

1. **`.github/workflows/ci.yml`** — lint + test on push/PR
2. **`.github/workflows/release.yml`** — publish npm + build binaries for 4 platforms
3. **`install.sh`** — curl installer detecting OS/arch

### Phase 11: Polish & Ship ✅

1. MIT LICENSE
2. Final README with comprehensive examples
3. End-to-end testing with real MCP servers
4. `v0.1.0` release

## Environment Variables

| Variable          | Purpose                     | Default             |
| ----------------- | --------------------------- | ------------------- |
| `MCP_CONFIG_PATH` | Config directory path       | `~/.config/mcpcli/` |
| `MCP_STRICT_ENV`  | Error on missing `${VAR}`   | `true`              |
| `MCP_CONCURRENCY` | Parallel server connections | `5`                 |
| `MCP_DEBUG`       | Enable verbose/debug output | `false`             |
| `MCP_TIMEOUT`     | Request timeout (seconds)   | `1800`              |
| `MCP_MAX_RETRIES` | Retry attempts on failure   | `3`                 |

## Implementation Order

| Step | Phase    | What you get                                                 |
| ---- | -------- | ------------------------------------------------------------ |
| 1    | Phase 1  | Project compiles, `--help` works                             |
| 2    | Phase 2  | Config loading works                                         |
| 3    | Phase 3  | Can connect to stdio + HTTP servers                          |
| 4    | Phase 4  | `mcpcli`, `mcpcli info`, `mcpcli call` work — **usable MVP** |
| 5    | Phase 8  | Pretty output with colors                                    |
| 6    | Phase 6  | Input validation on `call`                                   |
| 7    | Phase 5  | OAuth works for HTTP servers                                 |
| 8    | Phase 7  | Search (keyword + semantic)                                  |
| 9    | Phase 9  | Claude Code skill                                            |
| 10   | Phase 10 | CI/CD, automated publishing                                  |
| 11   | Phase 11 | Polish and v0.1.0                                            |
