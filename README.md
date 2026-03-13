# mcpx

A command-line interface for MCP servers. **curl for MCP.**

Two audiences:

1. **AI/LLM agents** that prefer shelling out over maintaining persistent MCP connections — better for token management, progressive tool discovery, and sharing a single pool of MCP servers across multiple agents on one machine
2. **MCP developers** who need a fast way to discover, debug, and test their servers from the terminal

## Install

```bash
# Via bun
bun install -g @evantahler/mcpx

# Via curl
curl -fsSL https://raw.githubusercontent.com/evantahler/mcpx/main/install.sh | bash
```

The curl installer downloads a pre-built binary (macOS/Linux) — no runtime needed. The bun install method requires [Bun](https://bun.sh). Windows `.exe` binaries are available on the [GitHub Releases](https://github.com/evantahler/mcpx/releases) page.

## Quick Start

```bash
# Add the GitHub MCP server
mcpx add github --url https://mcp.github.com

# List all servers and their tools
mcpx

# List with descriptions
mcpx -d

# Inspect a server
mcpx info github

# Inspect a specific tool
mcpx info github search_repositories

# Execute a tool
mcpx exec github search_repositories '{"query": "mcp server"}'

# Search tools — combines keyword and semantic matching
mcpx search "post a ticket to linear"

# Search with only keyword/glob matching (fast, no embeddings)
mcpx search -k "*file*"

# Search with only semantic matching
mcpx search -q "manage pull requests"

# Limit the number of results (default: 10)
mcpx search -n 5 "manage pull requests"
```

## Commands

| Command                                | Description                                            |
| -------------------------------------- | ------------------------------------------------------ |
| `mcpx`                                 | List all configured servers and tools                  |
| `mcpx servers`                         | List configured servers (name, type, detail)           |
| `mcpx info <server>`                   | Server overview (version, capabilities, tools, counts) |
| `mcpx info <server> <tool>`            | Show tool schema                                       |
| `mcpx search <query>`                  | Search tools (keyword + semantic)                      |
| `mcpx search -k <pattern>`             | Keyword/glob search only                               |
| `mcpx search -q <query>`               | Semantic search only                                   |
| `mcpx search -n <number> <query>`      | Limit number of results (default: 10)                  |
| `mcpx index`                           | Build/rebuild the search index                         |
| `mcpx index -i`                        | Show index status                                      |
| `mcpx exec <server> <tool> [json]`     | Validate inputs locally, then execute tool             |
| `mcpx exec <server> <tool> -f file`    | Read tool args from a JSON file                        |
| `mcpx exec <server>`                   | List available tools for a server                      |
| `mcpx auth <server>`                   | Authenticate with an HTTP MCP server (OAuth)           |
| `mcpx auth <server> -s`                | Check auth status and token TTL                        |
| `mcpx auth <server> -r`                | Force token refresh                                    |
| `mcpx deauth <server>`                 | Remove stored authentication for a server              |
| `mcpx add <name> --command <cmd>`      | Add a stdio MCP server to your config                  |
| `mcpx add <name> --url <url>`          | Add an HTTP MCP server to your config                  |
| `mcpx remove <name>`                   | Remove an MCP server from your config                  |
| `mcpx ping`                            | Check connectivity to all configured servers           |
| `mcpx ping <server> [server2...]`      | Check connectivity to specific server(s)               |
| `mcpx skill install --claude`          | Install the mcpx skill for Claude Code                 |
| `mcpx skill install --cursor`          | Install the mcpx rule for Cursor                       |
| `mcpx resource`                        | List all resources across all servers                  |
| `mcpx resource <server>`               | List resources for a server                            |
| `mcpx resource <server> <uri>`         | Read a specific resource                               |
| `mcpx prompt`                          | List all prompts across all servers                    |
| `mcpx prompt <server>`                 | List prompts for a server                              |
| `mcpx prompt <server> <name> [json]`   | Get a specific prompt                                  |
| `mcpx exec <server> <tool> --no-wait`  | Execute as async task, return task handle immediately  |
| `mcpx exec <server> <tool> --ttl <ms>` | Set task TTL in milliseconds (default: 60000)          |
| `mcpx task list <server>`              | List tasks on a server                                 |
| `mcpx task get <server> <taskId>`      | Get task status                                        |
| `mcpx task result <server> <taskId>`   | Retrieve completed task result                         |
| `mcpx task cancel <server> <taskId>`   | Cancel a running task                                  |

## Options

| Flag                      | Purpose                                                  |
| ------------------------- | -------------------------------------------------------- |
| `-h, --help`              | Show help                                                |
| `-V, --version`           | Show version                                             |
| `-d, --with-descriptions` | Include tool descriptions in list output                 |
| `-c, --config <path>`     | Specify config file location                             |
| `-v, --verbose`           | Show HTTP details and JSON-RPC protocol messages         |
| `-S, --show-secrets`      | Show full auth tokens in verbose output (unmasked)       |
| `-j, --json`              | Force JSON output (default when piped)                   |
| `-N, --no-interactive`    | Decline server elicitation requests (for scripted usage) |
| `-l, --log-level <level>` | Minimum server log level to display (default: `warning`) |

Server log messages (`notifications/message`) are displayed on stderr with level-appropriate coloring. Valid levels (in ascending severity): `debug`, `info`, `notice`, `warning`, `error`, `critical`, `alert`, `emergency`. When a server declares logging capability, mcpx sends `logging/setLevel` to request messages at the configured threshold and above.

## Managing Servers

Add and remove servers from the CLI — no manual JSON editing required.

```bash
# Add a stdio server
mcpx add filesystem --command npx --args "-y,@modelcontextprotocol/server-filesystem,/tmp"

# Add an HTTP server with headers
mcpx add my-api --url https://api.example.com/mcp --header "Authorization:Bearer tok123"

# Add with tool filtering
mcpx add github --url https://mcp.github.com --allowed-tools "search_*,get_*"

# Add a legacy SSE server (explicit transport)
mcpx add legacy-api --url https://api.example.com/sse --transport sse

# Add with environment variables
mcpx add my-server --command node --args "server.js" --env "API_KEY=sk-123,DEBUG=true"

# Overwrite an existing server
mcpx add filesystem --command echo --force

# Remove a server (also cleans up auth.json)
mcpx remove filesystem

# Remove but keep stored auth credentials
mcpx remove my-api --keep-auth

# Preview what would be removed
mcpx remove my-api --dry-run
```

**`add` options:**

| Flag                       | Purpose                                |
| -------------------------- | -------------------------------------- |
| `--command <cmd>`          | Command to run (stdio server)          |
| `--args <a1,a2,...>`       | Comma-separated arguments              |
| `--env <KEY=VAL,...>`      | Comma-separated environment variables  |
| `--cwd <dir>`              | Working directory for the command      |
| `--url <url>`              | Server URL (HTTP server)               |
| `--header <Key:Value>`     | HTTP header (repeatable)               |
| `--transport <type>`       | Transport: `sse` or `streamable-http`  |
| `--allowed-tools <t1,t2>`  | Comma-separated allowed tool patterns  |
| `--disabled-tools <t1,t2>` | Comma-separated disabled tool patterns |
| `-f, --force`              | Overwrite if server already exists     |
| `--no-auth`                | Skip automatic OAuth after adding      |
| `--no-index`               | Skip rebuilding the search index       |

**`remove` options:**

| Flag          | Purpose                                           |
| ------------- | ------------------------------------------------- |
| `--keep-auth` | Don't remove stored auth credentials              |
| `--dry-run`   | Show what would be removed without changing files |

## Configuration

Config lives in `~/.mcpx/` (or the current directory). Three files:

### `servers.json` — MCP Server Definitions

Standard MCP server config format. Supports both stdio and HTTP servers.

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
      "env": { "API_KEY": "${API_KEY}" },
      "allowedTools": ["read_file", "list_directory"],
      "disabledTools": ["delete_file"]
    },
    "github": {
      "url": "https://mcp.github.com"
    },
    "internal-api": {
      "url": "https://mcp.internal.example.com",
      "headers": { "Authorization": "Bearer ${TOKEN}" }
    },
    "legacy-sse": {
      "url": "https://legacy.example.com/sse",
      "transport": "sse"
    }
  }
}
```

**Stdio servers** — `command` + `args`, spawned as child processes
**HTTP servers** — `url`, with optional static `headers` for pre-shared tokens. OAuth is auto-discovered at connection time via `.well-known/oauth-authorization-server` — no config needed. By default, mcpx tries Streamable HTTP first and automatically falls back to legacy SSE if the server doesn't support it. Set `"transport": "sse"` or `"transport": "streamable-http"` to skip auto-detection.

Environment variables are interpolated via `${VAR_NAME}` syntax. Set `MCP_STRICT_ENV=false` to warn instead of error on missing variables.

**Tool filtering:**

- `allowedTools` — glob patterns for tools to expose (whitelist)
- `disabledTools` — glob patterns for tools to hide (blacklist, takes precedence)

### `auth.json` — OAuth Token Storage (managed automatically)

Stores OAuth tokens for HTTP MCP servers. You don't edit this directly — managed automatically.

```json
{
  "github": {
    "access_token": "gho_xxxx",
    "refresh_token": "ghr_xxxx",
    "expires_at": "2026-03-03T12:00:00Z",
    "token_type": "bearer",
    "scope": "repo,read:org"
  },
  "linear": {
    "access_token": "lin_xxxx",
    "refresh_token": "lin_ref_xxxx",
    "expires_at": "2026-03-04T08:30:00Z",
    "token_type": "bearer"
  }
}
```

Tokens are automatically refreshed when expired (if a refresh token is available). Any command that connects to a server (`exec`, `info`, `search`, listing) will refresh tokens transparently. `mcpx auth <server> --status` shows current token state and TTL.

### `search.json` — Semantic Search Index (managed automatically)

Contains every discovered tool with metadata for semantic search. Built and updated automatically — any command that connects to a server will detect new/changed tools and re-index them in the background.

```json
{
  "version": 1,
  "indexed_at": "2026-03-03T10:00:00Z",
  "embedding_model": "Xenova/all-MiniLM-L6-v2",
  "tools": [
    {
      "server": "linear",
      "tool": "createIssue",
      "description": "Create a new issue in Linear",
      "input_schema": { "...": "..." },
      "scenarios": ["Create a new issue in Linear", "create issue"],
      "keywords": ["create", "issue"],
      "embedding": [0.012, -0.034, "..."]
    }
  ]
}
```

Each tool gets:

- **scenarios** — the tool description plus a keyword phrase derived from the tool name
- **keywords** — terms extracted by splitting the tool name on `_`, `-`, and camelCase boundaries
- **embedding** — 384-dim vector for cosine similarity search

Scenarios and keywords are extracted heuristically from tool names and descriptions. Embeddings are generated in-process using `Xenova/all-MiniLM-L6-v2` (~23MB ONNX model, downloaded on first run). No API keys needed.

## Config Resolution Order

1. `MCP_CONFIG_PATH` environment variable
2. `-c / --config` flag
3. `./servers.json` (current directory)
4. `~/.mcpx/servers.json`

## Environment Variables

| Variable          | Purpose                     | Default    |
| ----------------- | --------------------------- | ---------- |
| `MCP_CONFIG_PATH` | Config directory path       | `~/.mcpx/` |
| `MCP_DEBUG`       | Enable debug output         | `false`    |
| `MCP_TIMEOUT`     | Request timeout (seconds)   | `1800`     |
| `MCP_CONCURRENCY` | Parallel server connections | `5`        |
| `MCP_MAX_RETRIES` | Retry attempts              | `3`        |
| `MCP_STRICT_ENV`  | Error on missing `${VAR}`   | `true`     |

## OAuth Flow

For HTTP MCP servers that require OAuth:

```bash
# Start the OAuth flow — opens browser for authorization
mcpx auth github

# Check token status
mcpx auth github -s
# => github: authenticated (expires in 47m)

# Force re-authentication
mcpx auth github -r

# Authenticate without rebuilding the search index
mcpx auth github --no-index
```

The OAuth flow:

1. Discovers the server's OAuth metadata via `/.well-known/oauth-authorization-server`
2. Starts a local callback server on a random port
3. Opens the browser for user authorization
4. Exchanges the authorization code for tokens
5. Stores tokens in `auth.json`
6. Automatically refreshes tokens before they expire on any subsequent command

## Search

`mcpx search` is a single command that combines keyword matching and semantic vector search. By default, both strategies run and results are merged.

```bash
# Combined search (default) — keyword hits + semantic matches, merged and ranked
mcpx search "send a message to slack"
# => slack/postMessage          (0.94) Post a message to a channel
# => slack/sendDirectMessage    (0.87) Send a DM to a user
# => teams/sendMessage          (0.72) Send a Teams message

# Keyword only — fast glob match against tool names, descriptions, and keywords
mcpx search -k "*pull*request*"
# => github/createPullRequest
# => github/getPullRequest
# => github/mergePullRequest

# Semantic only — vector similarity against intent
mcpx search -q "review someone's code changes"
# => github/submitPullRequestReview  (0.91) Submit a PR review
# => github/getPullRequest           (0.85) Get PR details
# => github/listPullRequestCommits   (0.78) List commits in a PR
```

The combined search pipeline:

1. **Keyword match** — glob/substring against tool names, descriptions, and indexed keywords
2. **Semantic match** — embed the query, cosine similarity against tool embeddings
3. **Merge & rank** — combine both result sets, deduplicate, sort by score
4. **Return** — top results with similarity scores

The index updates incrementally — only new or changed tools are re-indexed. The first run indexes everything; subsequent runs are fast.

## Tasks (Async Tool Execution)

MCP servers can declare support for [tasks](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks) — long-running operations that return a task handle instead of blocking until completion. When a tool supports tasks (`execution.taskSupport: "optional"` or `"required"`), mcpx automatically uses task-augmented execution.

```bash
# Default: wait for the task to complete, showing progress updates
mcpx exec my-server long_running_tool '{"input": "data"}'

# Return immediately with a task handle (useful for scripting)
mcpx exec my-server long_running_tool '{"input": "data"}' --no-wait
# => Task created: task-abc123 (status: working)

# Check task status
mcpx task get my-server task-abc123

# Retrieve the result once complete
mcpx task result my-server task-abc123

# List all tasks on a server
mcpx task list my-server

# Cancel a running task
mcpx task cancel my-server task-abc123
```

For tools that don't support tasks, `exec` works exactly as before — no changes needed.

## Elicitation (Server-Requested User Input)

MCP servers can request user input mid-operation via [elicitation](https://modelcontextprotocol.io/specification/draft/client/elicitation). mcpx supports both modes:

- **Form mode**: The server sends a JSON schema describing input fields (strings, numbers, booleans, enums, multi-select). mcpx renders prompts in the terminal and validates input before returning it.
- **URL mode**: The server sends a URL for the user to visit (e.g., for authentication or payment flows). mcpx opens it in the default browser.

```bash
# Interactive — prompts appear in the terminal
mcpx exec my-server deploy_tool '{"target": "staging"}'
# Server requests input: Confirm deployment
#   *Confirm [y/n]: y

# Non-interactive — decline all elicitation (for scripts/CI)
mcpx exec my-server deploy_tool '{"target": "staging"}' --no-interactive

# JSON mode — elicitation requests are written to stdout as JSON,
# and responses are read from stdin (for programmatic handling)
echo '{"action":"accept","content":{"confirm":true}}' | \
  mcpx exec my-server deploy_tool '{"target": "staging"}' --json
```

## Debugging with Verbose Mode

`-v` shows both HTTP request/response details (like `curl -v`) and JSON-RPC protocol messages exchanged with the server. All debug output goes to stderr so piping to `jq` still works.

### JSON-RPC Protocol Tracing

Verbose mode traces every JSON-RPC message at the transport layer — requests, responses, and notifications — for both stdio and HTTP servers:

```bash
mcpx -v exec mock echo '{"message":"hello"}'

# → initialize (id: 0)
# ← initialize (id: 0) [45ms] — mock-server v1.0
# → notifications/initialized
# → tools/call (id: 1)
# ← tools/call (id: 1) [12ms] — ok
```

With `--json`, trace output is NDJSON on stderr (one JSON object per message):

```bash
mcpx -v -j exec mock echo '{"message":"hello"}' 2>trace.jsonl
```

### HTTP Traffic

For HTTP/SSE servers, verbose mode also shows raw HTTP headers and timing:

```bash
mcpx -v exec arcade Gmail_WhoAmI

# > POST https://api.arcade.dev/mcp/evan-coding
# > authorization: Bearer eyJhbGci...
# > content-type: application/json
# > accept: application/json, text/event-stream
# >
# {
#   "method": "tools/call",
#   "params": {
#     "name": "Gmail_WhoAmI",
#     "arguments": {}
#   }
# }
# < 200 OK (142ms)
# < content-type: application/json
# < x-request-id: abc123
# <
# { "content": [ ... ] }

# Debug on stderr, clean JSON on stdout
mcpx -v exec arcade Gmail_WhoAmI | jq .

# Show full auth tokens (unmasked)
mcpx -v -S exec arcade Gmail_WhoAmI
```

The `>` / `<` convention matches curl — `>` for request, `<` for response. The `→` / `←` arrows show JSON-RPC protocol messages with method names, IDs, round-trip timing, and result summaries.

## Input Validation

`mcpx exec` validates tool arguments locally before sending them to the server. MCP tools advertise a JSON Schema for their inputs — mcpx uses this to catch errors fast, without a round-trip.

```bash
# Missing required field — caught locally
mcpx exec github create_issue '{"title": "bug"}'
# => error: missing required field "repo" (github/create_issue)

# Wrong type — caught locally
mcpx exec github create_issue '{"repo": "foo", "title": 123}'
# => error: "title" must be a string, got number (github/create_issue)

# Valid — sent to server
mcpx exec github create_issue '{"repo": "foo", "title": "bug"}'
# => { ... }
```

Validation covers:

- **Required fields** — errors before sending if any are missing
- **Type checking** — string, number, boolean, array, object
- **Enum values** — rejects values not in the allowed set
- **Nested objects** — validates recursively

If a tool's `inputSchema` is unavailable (some servers don't provide one), execution proceeds without local validation.

## Shell Output & Piping

Output is human-friendly by default, JSON when piped:

```bash
# Human-readable
mcpx info github

# JSON (piped)
mcpx info github | jq '.tools[].name'

# Force JSON
mcpx info github --json
```

Tool results are always JSON, designed for chaining:

```bash
# Search repos and read the first result
mcpx exec github search_repositories '{"query":"mcp"}' \
  | jq -r '.content[0].text | fromjson | .items[0].full_name' \
  | xargs -I {} mcpx exec github get_file_contents '{"owner":"{}","path":"README.md"}'

# Conditional execution
mcpx exec filesystem list_directory '{"path":"."}' \
  | jq -e '.content[0].text | contains("package.json")' \
  && mcpx exec filesystem read_file '{"path":"./package.json"}'
```

Stdin and file input work for tool arguments:

```bash
# Pipe JSON directly
echo '{"path":"./README.md"}' | mcpx exec filesystem read_file

# Pipe from a file
cat params.json | mcpx exec server tool

# Shell redirect from a file
mcpx exec server tool < params.json

# Read args from a file with --file flag
mcpx exec filesystem read_file -f params.json
```

## Agent Integration

### Claude Code Skill

mcpx ships a Claude Code skill at `.claude/skills/mcpx.md` that teaches Claude Code how to discover and use MCP tools. Install it:

```bash
# Install to the current project (.claude/skills/mcpx.md)
mcpx skill install --claude

# Install globally (~/.claude/skills/mcpx.md)
mcpx skill install --claude --global

# Install to both locations
mcpx skill install --claude --global --project

# Overwrite an existing skill file
mcpx skill install --claude --force
```

Then in any Claude Code session, the agent can use `/mcpx` or the skill triggers automatically when the agent needs to interact with external services. The skill instructs the agent to:

1. **Search first** — `mcpx search "<intent>"` to find relevant tools
2. **Inspect** — `mcpx info <server> <tool>` to get the schema before calling
3. **Execute** — `mcpx exec <server> <tool> '<json>'` to execute

This keeps tool schemas out of the system prompt entirely. The agent discovers what it needs on-demand, saving tokens and context window space.

### Cursor Rule

mcpx ships a Cursor rule at `.cursor/rules/mcpx.mdc` that teaches Cursor how to discover and use MCP tools. Install it:

```bash
# Install to the current project (.cursor/rules/mcpx.mdc)
mcpx skill install --cursor

# Install globally (~/.cursor/rules/mcpx.mdc)
mcpx skill install --cursor --global

# Install both Claude and Cursor at once
mcpx skill install --claude --cursor

# Overwrite an existing rule file
mcpx skill install --cursor --force
```

### Raw System Prompt (other agents)

For non-Claude-Code agents, add this to the system prompt:

```
You have access to MCP tools via the `mcpx` CLI.

To discover tools:
  mcpx search "<what you want to do>"    # combined keyword + semantic
  mcpx search -k "<pattern>"             # keyword/glob only
  mcpx info <server> <tool>              # tool schema

To execute tools:
  mcpx exec <server> <tool> '<json args>'
  mcpx exec <server> <tool> -f params.json

Always search before executing — don't assume tool names.
```

## Development

```bash
# Install dependencies
bun install

# Run in development
bun run dev

# Run tests
bun test

# Build single binary
bun run build

# Lint
bun lint
```

## Tech Stack

| Layer       | Choice                                                |
| ----------- | ----------------------------------------------------- |
| Runtime     | Bun                                                   |
| Language    | TypeScript                                            |
| MCP Client  | `@modelcontextprotocol/sdk`                           |
| CLI Parsing | `commander`                                           |
| Validation  | `ajv` (JSON Schema)                                   |
| Embeddings  | `@huggingface/transformers` (Xenova/all-MiniLM-L6-v2) |

## Inspiration

Inspired by [mcp-cli](https://github.com/philschmid/mcp-cli) by Phil Schmid, which nails the core DX of a shell-friendly MCP client. mcpx extends that foundation with OAuth support for HTTP servers and semantic tool search.

## License

MIT
