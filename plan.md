# mcpcli — Implementation Plan

## Package Choices

| Concern                 | Package                     | Why                                                                                                                                                                                   |
| ----------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime                 | Bun                         | Native TS, fast startup, built-in test runner, `bun build --compile` for binaries                                                                                                     |
| CLI framework           | `commander`                 | Battle-tested, massive ecosystem, great subcommand support. `citty` is a modern alternative but commander has more docs/examples                                                      |
| MCP client              | `@modelcontextprotocol/sdk` | Official SDK — provides `Client`, `StdioClientTransport`, `StreamableHTTPClientTransport`, OAuth helpers, tool types                                                                  |
| JSON Schema validation  | `ajv`                       | Industry standard for validating against JSON Schema at runtime. MCP tools expose `inputSchema` as JSON Schema — Zod cannot validate against a JSON Schema object received at runtime |
| Glob matching (strings) | `picomatch`                 | 3KB, fastest, zero deps — matches tool names against glob patterns without touching filesystem                                                                                        |
| Cosine similarity       | Hand-rolled (~10 lines)     | Pure arithmetic, no deps needed. For 1000 vectors of dim 1536, <5ms in Bun                                                                                                            |
| Linting                 | `@biomejs/biome`            | Fast, single tool for lint + format, works great with Bun                                                                                                                             |
| Embeddings              | Shell out to `claude` CLI   | No API keys to manage — reuses whatever coding CLI is already installed                                                                                                               |

## Directory Structure

```
mcpcli/
├── src/
│   ├── cli.ts                  # Entry point — shebang, commander setup, subcommand registration
│   ├── commands/
│   │   ├── list.ts             # Default command — list servers and tools
│   │   ├── info.ts             # info <server> and info <server>/<tool>
│   │   ├── search.ts           # search <query> (--keyword, --semantic)
│   │   ├── call.ts             # call <server> <tool> [json]
│   │   └── auth.ts             # auth <server> (--status, --refresh)
│   ├── config/
│   │   ├── loader.ts           # Config resolution (env → flag → cwd → ~/.config)
│   │   ├── schemas.ts          # Zod schemas for servers.json, auth.json, search.json
│   │   └── env.ts              # ${VAR_NAME} interpolation in config values
│   ├── client/
│   │   ├── manager.ts          # ServerManager — connects to servers, caches clients, lazy init
│   │   ├── stdio.ts            # Stdio transport setup (spawn child process)
│   │   ├── http.ts             # HTTP/StreamableHTTP transport setup
│   │   └── oauth.ts            # OAuthClientProvider implementation (token storage, browser flow, callback server)
│   ├── search/
│   │   ├── index.ts            # Unified search: keyword + semantic, merge & rank
│   │   ├── keyword.ts          # Glob/substring matching via picomatch
│   │   ├── semantic.ts         # Embedding generation (shell out to claude) + cosine similarity
│   │   └── indexer.ts          # Build/update search.json — detect new/changed tools, generate scenarios + embeddings
│   ├── validation/
│   │   └── schema.ts           # ajv-based input validation against tool inputSchema
│   ├── output/
│   │   └── formatter.ts        # Human-friendly vs JSON output, TTY detection
│   └── daemon/
│       └── pool.ts             # Connection pooling daemon (Unix socket IPC)
├── skills/
│   └── mcpcli.md               # Claude Code skill file
├── test/
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
│   │   └── manager.test.ts
│   ├── search/
│   │   ├── keyword.test.ts
│   │   ├── semantic.test.ts
│   │   └── indexer.test.ts
│   ├── validation/
│   │   └── schema.test.ts
│   └── fixtures/
│       ├── servers.json        # Test config
│       ├── auth.json           # Test tokens
│       └── search.json         # Test index
├── .github/
│   └── workflows/
│       ├── ci.yml              # Lint + test on push/PR
│       └── release.yml         # Publish npm + build binaries on release
├── package.json
├── tsconfig.json
├── biome.json
├── README.md
├── plan.md
└── LICENSE
```

## Implementation Phases

### Phase 1: Project Bootstrap

**Goal:** Skeleton that compiles and runs `mcpcli --help`.

1. `bun init` — create package.json, tsconfig.json
2. Install deps:
   ```bash
   bun add @modelcontextprotocol/sdk commander ajv picomatch
   bun add -d @biomejs/biome @types/bun
   ```
3. Configure package.json:
   ```json
   {
     "name": "mcpcli",
     "version": "0.1.0",
     "type": "module",
     "bin": { "mcpcli": "./src/cli.ts" },
     "files": ["src", "skills", "README.md", "LICENSE"],
     "scripts": {
       "dev": "bun run src/cli.ts",
       "test": "bun test",
       "lint": "biome check .",
       "format": "biome check --write .",
       "build": "bun build --compile --minify --sourcemap --bytecode ./src/cli.ts --outfile dist/mcpcli"
     },
     "publishConfig": { "access": "public" }
   }
   ```
4. Create `src/cli.ts` with shebang, commander program, register all subcommands as stubs
5. Configure biome.json (formatting + linting rules)
6. Configure tsconfig.json (strict, ESM, Bun types)
7. Verify: `bun run src/cli.ts --help` shows all commands

### Phase 2: Config Loading

**Goal:** Read and validate `servers.json`, resolve config paths, interpolate env vars.

1. **`src/config/schemas.ts`** — Zod schemas for all three config files:
   - `ServerConfig` — the `mcpServers` object with stdio and http variants
   - `AuthConfig` — per-server token storage
   - `SearchIndex` — tools array with scenarios, keywords, embeddings
2. **`src/config/env.ts`** — `interpolateEnv(value: string): string`
   - Regex for `${VAR_NAME}`, replace from `process.env`
   - `MCP_STRICT_ENV=true` → throw on missing, `false` → warn and leave empty
3. **`src/config/loader.ts`** — `loadConfig(options): Config`
   - Resolution order: `MCP_CONFIG_PATH` → `-c` flag → `./servers.json` → `~/.config/mcpcli/servers.json`
   - Parse JSON, validate with Zod, interpolate env vars in all string values
   - Return typed config object
   - Create config dir if it doesn't exist
   - Load auth.json and search.json from same directory (create empty if missing)
4. **Tests:** config loading, env interpolation, resolution order, missing file handling

### Phase 3: Server Connection (Stdio + HTTP)

**Goal:** Connect to MCP servers, list their tools.

1. **`src/client/stdio.ts`** — `createStdioTransport(config): StdioClientTransport`
   - Use `@modelcontextprotocol/sdk`'s `StdioClientTransport`
   - Spawn child process with `command`, `args`, `env`, `cwd` from config
2. **`src/client/http.ts`** — `createHttpTransport(config, authProvider?): StreamableHTTPClientTransport`
   - Use SDK's `StreamableHTTPClientTransport`
   - Pass auth provider if OAuth is needed (detected on 401)
   - Pass static headers if configured
3. **`src/client/manager.ts`** — `ServerManager` class
   - Lazy-init: connect to a server only when first needed
   - Cache connected `Client` instances
   - `getClient(serverName): Client` — connect if not cached, return cached
   - `listTools(serverName): Tool[]` — call `client.listTools()`
   - `callTool(serverName, toolName, args): Result` — call `client.callTool()`
   - `getAllTools(): Map<string, Tool[]>` — connect all servers concurrently (up to `MCP_CONCURRENCY`)
   - Apply tool filtering (allowedTools/disabledTools) via picomatch
   - Graceful shutdown: disconnect all clients on process exit
4. **Tests:** mock stdio server (use SDK's test utilities or a simple echo server), test connection, tool listing

### Phase 4: Core Commands — list, info, call

**Goal:** The three essential commands work end-to-end.

1. **`src/output/formatter.ts`**
   - `isInteractive()` — check `process.stdout.isTTY` and `--json` flag
   - `formatToolList(tools, options)` — table with server/tool columns, optional descriptions
   - `formatToolSchema(tool)` — pretty-print inputSchema
   - `formatCallResult(result)` — JSON output
   - Human mode: colors (green server names, bold tool names), aligned columns
   - JSON mode: structured output for piping
2. **`src/commands/list.ts`** — default command
   - `manager.getAllTools()` → format and print
   - `-d` flag includes descriptions
3. **`src/commands/info.ts`**
   - Parse `server` or `server/tool` argument
   - `info <server>` → list tools for that server
   - `info <server>/<tool>` → show tool schema (inputSchema, description)
4. **`src/commands/call.ts`**
   - Parse `server`, `tool`, optional `json` arg
   - Read from stdin if no json arg and stdin is not TTY
   - Parse JSON input
   - Validate against inputSchema (Phase 6), skip if no schema
   - `manager.callTool()` → print result
5. **Tests:** each command with mock servers, test both human and JSON output modes

### Phase 5: OAuth Authentication

**Goal:** Automatic OAuth for HTTP MCP servers, manual `auth` command for explicit flows.

1. **`src/client/oauth.ts`** — implement `OAuthClientProvider` interface from SDK:
   - `redirectUrl` — `http://127.0.0.1:{port}/callback` (random available port)
   - `clientInformation()` / `saveClientInformation()` — read/write dynamic client registration to auth.json
   - `tokens()` / `saveTokens()` — read/write tokens to auth.json, check `expires_at`
   - `redirectToAuthorization(url)` — open browser via `open` (macOS) / `xdg-open` (Linux)
   - `saveCodeVerifier()` / `codeVerifier()` — in-memory storage during the flow
   - Local callback server: `Bun.serve()` on `127.0.0.1`, random port, listen for redirect
   - Auto-refresh: before any request, check if token is expired, refresh if possible
2. **Integration with `src/client/http.ts`**:
   - Always pass the oauth provider to `StreamableHTTPClientTransport`
   - On 401, the SDK's transport automatically triggers the auth flow via the provider
   - If tokens exist in auth.json and are valid, they're used silently
   - If tokens are expired but refresh token exists, refresh silently
   - If no tokens or refresh fails, trigger full browser flow
3. **`src/commands/auth.ts`**:
   - `auth <server>` — force the full OAuth flow for a server (even if tokens exist)
   - `auth <server> --status` — show token state: authenticated (expires in Xm), expired, not authenticated
   - `auth <server> --refresh` — force a token refresh
4. **Tests:** mock OAuth server, test token storage, test refresh flow, test expired token handling

### Phase 6: Input Validation

**Goal:** Validate tool call arguments against inputSchema before sending to server.

1. **`src/validation/schema.ts`**:
   - `validateToolInput(schema: JSONSchema, input: unknown): ValidationResult`
   - Use `ajv` to compile and validate
   - Return structured errors: field path, expected type, actual value
   - Cache compiled validators by tool name (ajv compiles schemas to fast functions)
2. **Integration with `src/commands/call.ts`**:
   - After parsing JSON input, before calling `manager.callTool()`
   - Fetch tool schema via `manager.getToolSchema(server, tool)`
   - If schema exists, validate. On failure, print errors and exit 1
   - If no schema, proceed without validation
3. **Error formatting:**
   - Human mode: colored error messages with field paths
   - JSON mode: `{ "error": "validation", "details": [...] }`
4. **Tests:** valid inputs, missing required fields, wrong types, enum violations, nested objects, no-schema fallback

### Phase 7: Search — Keyword + Semantic

**Goal:** Unified `search` command combining keyword and vector search.

1. **`src/search/keyword.ts`**:
   - `keywordSearch(query: string, tools: IndexedTool[]): ScoredResult[]`
   - Use picomatch to match query against tool name, description, and keywords
   - Also do substring matching (case-insensitive) for non-glob queries
   - Score: exact name match > keyword match > description substring
2. **`src/search/semantic.ts`**:
   - `generateEmbedding(text: string): number[]`
     - Shell out to configured CLI: `echo "<text>" | claude --print "Return ONLY a JSON array of numbers representing a 256-dimensional embedding vector for this text. No other output."`
     - Parse the JSON array response
     - Alternative: detect if `claude` supports a direct embedding command
   - `semanticSearch(query: string, tools: IndexedTool[]): ScoredResult[]`
     - Generate embedding for query
     - Cosine similarity against each tool's stored embedding
     - Return sorted by similarity score
   - `cosineSimilarity(a: number[], b: number[]): number` — pure math, ~10 lines
3. **`src/search/indexer.ts`**:
   - `buildIndex(tools: Map<string, Tool[]>): SearchIndex`
     - For each tool, generate scenarios + keywords + embedding via CLI
     - Prompt for scenarios: "Given this MCP tool [name, description, schema], list 10 realistic scenarios where someone would use it. Also list 10 keywords. Return as JSON."
     - Generate embedding from concatenated: tool name + description + all scenarios
   - `updateIndex(existing: SearchIndex, currentTools: Map<string, Tool[]>): SearchIndex`
     - Diff current tools against existing index
     - Only re-index new or changed tools (compare by name + description hash)
     - Remove tools that no longer exist
   - Auto-trigger: called from `ServerManager` after connecting to servers, runs in background
4. **`src/search/index.ts`**:
   - `search(query: string, options: { keyword?: boolean, semantic?: boolean }): ScoredResult[]`
   - Default: run both keyword and semantic, merge results
   - `--keyword` only: skip semantic
   - `--semantic` only: skip keyword
   - Merge: deduplicate by server/tool, take max score, sort descending
5. **`src/commands/search.ts`**:
   - Parse query and flags
   - Load search index from search.json
   - If index is empty/missing, warn and fall back to keyword-only against live tool list
   - Call `search()`, format and print results with scores
6. **Tests:** keyword matching, semantic similarity, index building, incremental updates, merged results

### Phase 8: Connection Pooling Daemon

**Goal:** Keep server connections warm across CLI invocations.

1. **`src/daemon/pool.ts`**:
   - Unix domain socket at `~/.config/mcpcli/daemon.sock`
   - Protocol: JSON-over-newline IPC
   - Commands: `connect`, `listTools`, `callTool`, `disconnect`, `shutdown`
   - The daemon is the `ServerManager` running as a long-lived process
   - Auto-start: if socket doesn't exist, fork the daemon process
   - Auto-shutdown: exit after `MCP_DAEMON_TIMEOUT` seconds of inactivity
   - `--no-daemon` flag: bypass daemon, connect directly (one-shot mode)
2. **Client-side integration**:
   - Before creating a direct `ServerManager`, try connecting to the daemon socket
   - If daemon is running, proxy all operations through it
   - If not, either start the daemon or run in one-shot mode
3. **Implementation note:** This is the most complex phase. Can be deferred to post-v1 — the CLI works fine without it, just reconnects each invocation. The daemon is a performance optimization.

**Decision: Defer daemon to post-v1.** Ship without it first. Each invocation connects fresh. Add pooling later when we know the usage patterns.

### Phase 9: Output Formatting

**Goal:** Polish human-readable output with colors and alignment.

1. **TTY detection:** `process.stdout.isTTY` — human mode if true, JSON if false
2. **`--json` flag:** force JSON even in TTY
3. **Color scheme** (ANSI escape codes):
   - Server names: cyan
   - Tool names: bold white
   - Scores: green (>0.8), yellow (0.5-0.8), dim (<0.5)
   - Errors: red
   - Warnings: yellow
   - Descriptions: dim/gray
4. **Alignment:** pad server/tool columns to align descriptions
5. **Error output:** always to stderr, structured in JSON mode

### Phase 10: Claude Code Skill

**Goal:** Ship a skill file that teaches Claude Code to use mcpcli.

1. **`skills/mcpcli.md`**:

   ```markdown
   ---
   name: mcpcli
   description: Discover and use MCP tools via the mcpcli CLI
   trigger: when the user wants to interact with external services, APIs, or MCP tools
   ---

   # mcpcli — MCP Tool Discovery and Execution

   You have access to external tools via `mcpcli`. Use this workflow:

   ## 1. Search for tools

   mcpcli search "<what you want to do>"

   ## 2. Inspect the tool schema

   mcpcli info <server>/<tool>

   ## 3. Call the tool

   mcpcli call <server> <tool> '<json args>'

   ## Rules

   - Always search before calling — don't assume tool names exist
   - Always inspect the schema before calling — validate you have the right arguments
   - Use `mcpcli search --keyword` for exact name matching
   - Pipe results through `jq` when you need to extract specific fields
   - Tool call results are always JSON
   ```

2. Install instructions in README (already there)

### Phase 11: CI/CD

**Goal:** Automated testing on PRs, publishing on releases.

1. **`.github/workflows/ci.yml`** — runs on push to main and PRs:

   ```yaml
   name: CI
   on:
     push:
       branches: [main]
     pull_request:
   jobs:
     check:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: oven-sh/setup-bun@v2
         - run: bun install --frozen-lockfile
         - run: bun lint
         - run: bun test
   ```

2. **`.github/workflows/release.yml`** — runs on GitHub Release publish:

   ```yaml
   name: Release
   on:
     release:
       types: [published]
   permissions:
     contents: write
     id-token: write
   jobs:
     ci:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: oven-sh/setup-bun@v2
         - run: bun install --frozen-lockfile
         - run: bun lint
         - run: bun test

     publish-npm:
       needs: ci
       runs-on: ubuntu-latest
       permissions:
         contents: read
         id-token: write
       steps:
         - uses: actions/checkout@v4
         - uses: oven-sh/setup-bun@v2
         - uses: actions/setup-node@v4
           with:
             node-version: 22
             registry-url: https://registry.npmjs.org
         - run: bun install --frozen-lockfile
         - run: npm publish --provenance --access public
           env:
             NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

     build-binaries:
       needs: ci
       runs-on: ubuntu-latest
       strategy:
         matrix:
           include:
             - target: bun-darwin-arm64
               artifact: mcpcli-darwin-arm64
             - target: bun-darwin-x64
               artifact: mcpcli-darwin-x64
             - target: bun-linux-arm64
               artifact: mcpcli-linux-arm64
             - target: bun-linux-x64
               artifact: mcpcli-linux-x64
       steps:
         - uses: actions/checkout@v4
         - uses: oven-sh/setup-bun@v2
         - run: bun install --frozen-lockfile
         - name: Build binary
           run: |
             VERSION="${GITHUB_REF_NAME#v}"
             bun build --compile --minify --sourcemap --bytecode \
               --target=${{ matrix.target }} \
               --define BUILD_VERSION="'\"$VERSION\"'" \
               ./src/cli.ts --outfile dist/${{ matrix.artifact }}
         - name: Upload to release
           run: gh release upload "$GITHUB_REF_NAME" dist/${{ matrix.artifact }} --clobber
           env:
             GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
   ```

3. **Release process** (manual tags):
   - Bump version in package.json
   - `git commit -m "v1.0.0" && git tag v1.0.0 && git push --follow-tags`
   - `gh release create v1.0.0 --generate-notes`
   - CI publishes to npm with provenance + builds binaries for 4 platforms + attaches to release

4. **install.sh** — curl installer that detects OS/arch and downloads the right binary from GitHub Releases

### Phase 12: Polish & Ship

1. Write LICENSE (MIT)
2. Final README review — ensure all examples work
3. Test end-to-end with real MCP servers (filesystem, a real HTTP server)
4. Test the skill file in a Claude Code session
5. `v0.1.0` release

## Implementation Order

For maximum incremental value, build in this order:

| Step | Phase    | What you get                                                 |
| ---- | -------- | ------------------------------------------------------------ |
| 1    | Phase 1  | Project compiles, `--help` works                             |
| 2    | Phase 2  | Config loading works                                         |
| 3    | Phase 3  | Can connect to stdio + HTTP servers                          |
| 4    | Phase 4  | `mcpcli`, `mcpcli info`, `mcpcli call` work — **usable MVP** |
| 5    | Phase 9  | Pretty output with colors                                    |
| 6    | Phase 6  | Input validation on `call`                                   |
| 7    | Phase 5  | OAuth works for HTTP servers                                 |
| 8    | Phase 7  | Search (keyword first, then semantic)                        |
| 9    | Phase 10 | Claude Code skill                                            |
| 10   | Phase 11 | CI/CD, automated publishing                                  |
| 11   | Phase 12 | Polish and v0.1.0                                            |
| 12   | Phase 8  | Connection pooling daemon (post-v1)                          |

## Open Questions

1. **Embedding dimensions** — What dimension does the `claude` CLI return for embeddings? We need to know for the cosine similarity implementation and search.json storage. May need to experiment or allow configurable dimensions.
2. **Embedding CLI interface** — Exact invocation TBD. Options:
   - `echo "text" | claude --print "return only a JSON array of 256 floats representing an embedding"`
   - A future `claude embed "text"` command if it exists
   - Fallback to other CLIs: `ollama embed`, `openai embed`, etc.
3. **Daemon complexity** — Deferred to post-v1. If startup time is acceptable without pooling (~200-500ms for stdio servers), may never need it.
4. **npm package name** — Is `mcpcli` available on npm? Need to check. Alternatives: `@evantahler/mcpcli`, `mcp-cli-tool`.
