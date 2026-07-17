# mcpx

A command-line interface for MCP servers. **curl for MCP.**

The internet is debating CLI vs MCP like they're competitors. [They're not.](https://arcade.dev/blog/curl-for-mcp)

Three audiences:

1. **Coding agents** (Claude Code, Cursor) that prefer shelling out over maintaining persistent MCP connections — better for token management, progressive tool discovery, and sharing a single pool of MCP servers across multiple agents on one machine
2. **Non-coding agents** that need programmatic access to MCP tools from TypeScript — remote, persistent, or isolated agents that don't have a shell
3. **MCP developers** who need a fast way to discover, debug, and test their servers from the terminal

## Install

```bash
# Via bun (all platforms)
bun install -g @arcadeai/mcpx

# Via curl (macOS/Linux)
curl -fsSL https://raw.githubusercontent.com/arcadeai-labs/mcpx/main/install.sh | bash
```

```powershell
# Via PowerShell (Windows)
irm https://raw.githubusercontent.com/arcadeai-labs/mcpx/main/install.ps1 | iex
```

The curl/PowerShell installers download a pre-built binary — no runtime needed. The bun install method requires [Bun](https://bun.sh). Binaries for all platforms are also available on the [GitHub Releases](https://github.com/arcadeai-labs/mcpx/releases) page.

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

# Execute a tool (JSON args)
mcpx exec github search_repositories '{"query": "mcp server"}'

# Execute a tool with shell-style flags (anything after `--` is parsed against the tool's input schema)
mcpx exec github search_repositories -- --query "mcp server"

# Execute a tool without specifying the server (auto-resolved)
mcpx exec search_repositories '{"query": "mcp server"}'
mcpx exec search_repositories -- --query "mcp server"

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
| `mcpx exec <tool> [json]`              | Execute tool (server auto-resolved if unambiguous)     |
| `mcpx exec <server> <tool> -- --k=v`   | Shell-flag args (typed via the tool's input schema)    |
| `mcpx exec <server> <tool> -f file`    | Read tool args from a JSON file                        |
| `mcpx exec <server>`                   | List available tools for a server                      |
| `mcpx auth <server>`                   | Authenticate with an HTTP MCP server (OAuth)           |
| `mcpx auth <server> -s`                | Check auth status and token TTL                        |
| `mcpx auth <server> -r`                | Force token refresh                                    |
| `mcpx deauth <server>`                 | Remove stored authentication for a server              |
| `mcpx add <name> --command <cmd>`      | Add a stdio MCP server to your config                  |
| `mcpx add [name] --url <url>`          | Add an HTTP MCP server (name derived from URL if omitted) |
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
| `mcpx exec [server] <tool> --no-wait`  | Execute as async task, return task handle immediately  |
| `mcpx exec [server] <tool> --ttl <ms>` | Set task TTL in milliseconds (default: 60000)          |
| `mcpx task list <server>`              | List tasks on a server                                 |
| `mcpx task get <server> <taskId>`      | Get task status                                        |
| `mcpx task result <server> <taskId>`   | Retrieve completed task result                         |
| `mcpx task cancel <server> <taskId>`   | Cancel a running task                                  |
| `mcpx allow <server>`                  | Allow an agent to exec all tools on a server           |
| `mcpx allow <server> <tools...>`       | Allow specific tools only                              |
| `mcpx allow --all`                     | Allow all mcpx exec calls                              |
| `mcpx allow --all-read`                | Allow read-only commands (search, info, list, etc.)    |
| `mcpx allow --list`                    | Show current mcpx-related permissions                  |
| `mcpx allow --cursor <server>`         | Allow for Cursor instead of Claude Code                |
| `mcpx deny <server>`                   | Remove permissions for a server                        |
| `mcpx deny --all`                      | Remove all mcpx-related permissions                    |
| `mcpx check-update`                    | Check for a newer version of mcpx                      |
| `mcpx upgrade`                         | Upgrade mcpx to the latest version                     |

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
| `-F, --format <format>`   | Output format: `json` or `markdown`                      |
| `-N, --no-interactive`    | Decline server elicitation requests (for scripted usage) |
| `--no-color`              | Disable ANSI colors in output                            |
| `--force-color`           | Force ANSI colors even when piped                        |
| `-l, --log-level <level>` | Minimum server log level to display (default: `warning`) |

### Output & colors

mcpx auto-detects whether stdout/stderr are interactive and adapts:

- TTY → colored, formatted output (tables, headers, badges).
- Non-TTY / piped → JSON.

Color emission honors the standard env vars and matching flags:

- `NO_COLOR=1` or `--no-color` — disable ANSI colors.
- `FORCE_COLOR=1` or `--force-color` — enable ANSI colors even when piped.
- `--json` / `-j` — JSON output, no colors.
- `CI=true` — treated as non-interactive (spinners off).

Server log messages (`notifications/message`) are displayed on stderr with level-appropriate coloring. Valid levels (in ascending severity): `debug`, `info`, `notice`, `warning`, `error`, `critical`, `alert`, `emergency`. When a server declares logging capability, mcpx sends `logging/setLevel` to request messages at the configured threshold and above.

## Managing Servers

Add and remove servers from the CLI — no manual JSON editing required.

```bash
# Add a stdio server (anything after `--` is passed to the command verbatim)
mcpx add filesystem --command npx -- -y @modelcontextprotocol/server-filesystem /tmp

# Equivalent forms: repeatable --args, or a single comma-separated --args
mcpx add filesystem --command npx --args -y --args @modelcontextprotocol/server-filesystem --args /tmp
mcpx add filesystem --command npx --args "-y,@modelcontextprotocol/server-filesystem,/tmp"

# Add an HTTP server with headers
mcpx add my-api --url https://api.example.com/mcp --header "Authorization:Bearer tok123"

# When --url is used, the name is optional — derived from the URL's last path
# segment (or hostname if there is none). The example below stores the server
# under the name "evan-coding".
mcpx add --url https://api.arcade.dev/mcp/evan-coding

# Add with tool filtering (repeatable, or comma-separated)
mcpx add github --url https://mcp.github.com --allowed-tools "search_*" --allowed-tools "get_*"

# Add a legacy SSE server (explicit transport)
mcpx add legacy-api --url https://api.example.com/sse --transport sse

# Add with environment variables (repeatable, or comma-separated)
mcpx add my-server --command node --args server.js --env API_KEY=sk-123 --env DEBUG=true

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

| Flag                       | Purpose                                                                |
| -------------------------- | ---------------------------------------------------------------------- |
| `--command <cmd>`          | Command to run (stdio server)                                          |
| `--args <arg>`             | Argument for the command. Repeatable, or comma-separated. Tokens after `--` are also appended (stdio only). |
| `--env <KEY=VAL>`          | Environment variable. Repeatable, or comma-separated.                  |
| `--cwd <dir>`              | Working directory for the command                                      |
| `--url <url>`              | Server URL (HTTP server)                                               |
| `--header <Key:Value>`     | HTTP header. Repeatable.                                               |
| `--transport <type>`       | Transport: `sse` or `streamable-http`                                  |
| `--allowed-tools <pat>`    | Allowed tool pattern. Repeatable, or comma-separated.                  |
| `--disabled-tools <pat>`   | Disabled tool pattern. Repeatable, or comma-separated.                 |
| `-f, --force`              | Overwrite if server already exists                                     |
| `--no-auth`                | Skip automatic OAuth after adding                                      |
| `--no-index`               | Skip rebuilding the search index                                       |

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

Contains every discovered tool with metadata for semantic search. Built by `mcpx index` and kept fresh automatically — `mcpx` (the default list) and `mcpx index --status` already fetch every server's live tools, so they detect new/changed/removed tools and re-index the affected servers in the background.

```json
{
  "version": 1,
  "indexed_at": "2026-03-03T10:00:00Z",
  "embedding_model": "Xenova/bge-small-en-v1.5",
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

Scenarios and keywords are extracted heuristically from tool names and descriptions. Embeddings are generated in-process using `Xenova/bge-small-en-v1.5` (~33MB ONNX model, downloaded on first run). No API keys needed.

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

### Shell-flag args

Anything after a `--` separator is parsed as shell flags using the tool's input schema for type coercion. This is handy for interactive use — you don't need to remember JSON quoting rules.

```bash
# JSON form
mcpx exec github create_issue '{"owner":"arcadeai-labs","repo":"mcpx","title":"bug"}'

# Equivalent shell-flag form
mcpx exec github create_issue -- --owner arcadeai-labs --repo mcpx --title bug

# --field=value also works
mcpx exec github create_issue -- --owner=arcadeai-labs --repo=mcpx --title=bug

# Booleans
mcpx exec my-server flagit -- --enabled         # true
mcpx exec my-server flagit -- --no-enabled      # false

# Arrays — repeatable flag or comma-split
mcpx exec my-server tag -- --label bug --label todo
mcpx exec my-server tag -- --label bug,todo
```

Type coercion follows the field's `type` in the input schema (`string`, `integer`, `number`, `boolean`, `array`). Nested objects must use the JSON form. Combining `--` shell flags with inline JSON args, `--file`, or stdin is rejected.

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

### Output Formats (`--format`)

Tool results (`exec`, `task result`) support three output formats via the global `--format` / `-F` flag:

| Format     | Description                                                             |
| ---------- | ----------------------------------------------------------------------- |
| `json`     | Full MCP protocol response as JSON (default)                            |
| `text`     | Extract text from content blocks, strip protocol wrapper                |
| `markdown` | Extract text and render with rich terminal formatting (colors, borders) |

```bash
# Default JSON output — full MCP response with content array
mcpx exec github search_repositories '{"query":"mcp"}'

# Markdown — rich terminal rendering with colors and formatting
mcpx exec github search_repositories '{"query":"mcp"}' -F markdown
```

The `markdown` format extracts text from MCP content blocks and renders it through Bun's built-in markdown parser with ANSI styling — headings, bold/italic, code blocks with borders, colored links, and bullet lists. JSON content is converted to a structured document with headings and bullet lists.

For other commands (`list`, `info`, `search`), `--format json` forces JSON output and `--format markdown` uses the existing human-friendly formatting.

### Chaining tool results

Tool results are JSON by default, designed for chaining:

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
3. **Execute** — `mcpx exec <tool> '<json>'` to execute (or `mcpx exec <server> <tool> '<json>'` if the tool name is ambiguous)

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
  mcpx exec <tool> '<json args>'              # server auto-resolved
  mcpx exec <server> <tool> '<json args>'     # explicit server
  mcpx exec <server> <tool> -- --k=v          # shell-flag args (typed via schema)
  mcpx exec <server> <tool> -f params.json

Always search before executing — don't assume tool names.
```

### Programmatic Usage (TypeScript SDK)

For agents that don't have shell access — remote, persistent, or isolated agents running in TypeScript:

```typescript
import { McpxClient } from "@arcadeai/mcpx";

const client = new McpxClient();
// or: new McpxClient({ configDir: "/path/to/.mcpx" })
// or: new McpxClient({ servers: { mcpServers: { ... } } })

// 1. Search for tools
const results = await client.search("send a message");

// 2. Inspect the tool schema
const tool = await client.info("arcade", "Slack_SendMessage");

// 3. Execute the tool
const result = await client.exec("arcade", "Slack_SendMessage", {
  channel: "#general",
  message: "hello",
});

// Also available: listTools, listResources, readResource,
// listPrompts, getPrompt, listTasks, getTask, cancelTask,
// getServerInfo, getServerNames, validateToolInput

await client.close();
```

The SDK uses the same config files as the CLI (`~/.mcpx/servers.json`, `auth.json`, `search.json`). Server management (add, remove, auth) is done via the CLI — the SDK is read-only.

You can also pass server config directly, bypassing file loading entirely:

```typescript
const client = new McpxClient({
  servers: {
    mcpServers: {
      local: { command: "node", args: ["server.js"] },
      remote: { url: "https://mcp.example.com" },
    },
  },
});
```

#### Tool metadata

`info()` and `listTools()` return the raw MCP `Tool`, so you get everything the server declares: `name`, `title`, `description`, `inputSchema`, `outputSchema`, `execution.taskSupport`, and `annotations`. The `annotations` object carries the MCP behavioral hints:

```typescript
const tool = await client.info("github", "delete_repo");
tool?.annotations; // { title?, readOnlyHint?, destructiveHint?, idempotentHint?, openWorldHint? }
```

> ⚠️ Annotations are **untrusted hints** — per the MCP spec, clients should never make tool-use decisions based on annotations from untrusted servers. Treat the approval gate below as a guardrail, not a security boundary.

#### Human-in-the-loop approval gate

Because the SDK runs non-interactively, mcpx can't prompt a human itself — instead you supply an approval callback and a policy for which tools to gate. This lets you require approval before, say, any **open-world writeable** tool (`openWorldHint: true` and not `readOnlyHint`) runs:

```typescript
import { McpxClient, ToolApprovalDeniedError } from "@arcadeai/mcpx";

const client = new McpxClient({
  servers: { mcpServers: { github: { url: "https://mcp.github.com" } } },
  approvalPolicy: "open-world-writeable", // default is "none"
  onApprovalRequired: async ({ server, tool, args, annotations, reason }) => {
    // Prompt a human, call out to an approval service, check a policy, etc.
    return await promptHuman(`Allow ${server}/${tool}? (${reason})`, args);
  },
});

// Gated tools wait for the callback; returning false throws ToolApprovalDeniedError.
// If a tool is gated but no onApprovalRequired callback was provided, exec() throws
// ToolApprovalRequiredError (fail-closed).
await client.exec("github", "delete_repo", { repo: "old-thing" });
```

`approvalPolicy` accepts:

| Value                   | Gates                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `"none"` _(default)_    | nothing — existing behavior, zero overhead                                         |
| `"open-world-writeable"`| tools with `openWorldHint: true` and not `readOnlyHint` (unannotated tools pass)   |
| `"writeable"`           | any tool not explicitly `readOnlyHint: true` (also gates unannotated tools)        |
| `"all"`                 | every `exec()` call                                                                |
| `(tool, server) => boolean` | a custom predicate                                                             |
| `Array<…>`              | any of the above, combined with OR                                                 |

Helpers `isOpenWorldWriteable(tool)` and `isWriteable(tool)` are exported for building custom predicates, along with the `ToolAnnotations` type. `mcpx info <server> <tool>` also surfaces these hints in the CLI.

**Gating a specific tool by name.** The annotation presets can't tell two similar tools apart — a "create PR" and a "create issue" tool both look like open-world writes. To gate one but not the other, use the custom predicate form and match on `tool.name` (and `server`):

```typescript
const client = new McpxClient({
  servers: { mcpServers: { github: { url: "https://mcp.github.com" } } },

  // Require approval ONLY for creating PRs — issue creation runs freely.
  approvalPolicy: (tool, server) => server === "github" && tool.name === "create_pull_request",

  onApprovalRequired: async ({ server, tool, args }) => await promptHuman(`Allow ${server}/${tool}?`, args),
});

await client.exec("github", "create_pull_request", { ... }); // waits for approval
await client.exec("github", "create_issue", { ... }); // runs immediately, no prompt
```

Confirm the exact `tool.name` first — it must match exactly, and servers name tools differently (e.g. `create_pull_request` vs `github_create_pr`):

```bash
mcpx search "open pull request"      # find the tool and its server
mcpx info github create_pull_request # confirm the name
```

To match a family of tools, use a regex (`/pull_request|merge_pr/.test(tool.name)`); to gate the PR tool _and_ everything open-world-writeable, combine them with the array form: `["open-world-writeable", (tool, server) => …]`. Matching on `tool.name` is reliable — unlike `annotations`, which are untrusted server-supplied hints.

## Permissions (Claude Code & Cursor)

AI agents like Claude Code and Cursor prompt users to approve each `mcpx exec` call. `mcpx allow` and `mcpx deny` manage fine-grained permission rules so agents can self-authorize specific tools without broad access.

**Key insight:** If the user allows the initial permission pattern once (safe — it only writes to local settings files), the agent can then grant itself access to specific tools as needed. This is an opt-in workflow — by default, agents cannot self-authorize and will prompt the user for each `mcpx exec` call.

```bash
# Allow all tools on a server (Claude Code, default)
mcpx allow github

# Allow for Cursor instead
mcpx allow github --cursor

# Allow specific tools only
mcpx allow github search_repositories get_file

# Allow read-only commands (search, info, list, servers, ping, etc.)
mcpx allow --all-read

# Allow all mcpx exec calls
mcpx allow --all

# Show current permissions across all scopes
mcpx allow --list
mcpx allow --list --cursor

# Preview what would be written
mcpx allow github --dry-run

# Revoke a server's permissions
mcpx deny github

# Revoke all mcpx permissions
mcpx deny --all
```

**Target flag** — by default, permissions target Claude Code. Use `--cursor` to target Cursor instead:

| Flag        | Pattern prefix | Settings files                                  |
| ----------- | -------------- | ----------------------------------------------- |
| _(default)_ | `Bash(…)`      | `.claude/settings.local.json`, etc.             |
| `--cursor`  | `Shell(…)`     | `.cursor/cli.json`, `~/.cursor/cli-config.json` |

**Scope flags** control where the permission is written:

| Flag        | Claude Code file              | Cursor file                 | Default |
| ----------- | ----------------------------- | --------------------------- | ------- |
| `--local`   | `.claude/settings.local.json` | `.cursor/cli.json`          | ✓       |
| `--project` | `.claude/settings.json`       | `.cursor/cli.json`          |         |
| `--global`  | `~/.claude/settings.json`     | `~/.cursor/cli-config.json` |         |

**`allow` options:**

| Flag         | Purpose                                             |
| ------------ | --------------------------------------------------- |
| `--all`      | Allow all mcpx exec calls                           |
| `--all-read` | Allow read-only commands (search, info, list, etc.) |
| `--list`     | Show current mcpx-related permissions               |
| `--cursor`   | Target Cursor settings instead of Claude Code       |
| `--local`    | Write to local settings (default)                   |
| `--project`  | Write to project settings (shared)                  |
| `--global`   | Write to global settings                            |
| `--dry-run`  | Show patterns without writing                       |

**`deny` options:**

| Flag         | Purpose                                       |
| ------------ | --------------------------------------------- |
| `--all`      | Remove all mcpx-related permissions           |
| `--all-read` | Remove read-only command permissions          |
| `--cursor`   | Target Cursor settings instead of Claude Code |
| `--local`    | Write to local settings (default)             |
| `--project`  | Write to project settings (shared)            |
| `--global`   | Write to global settings                      |
| `--dry-run`  | Show what would be removed                    |

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
| Embeddings  | `@huggingface/transformers` (Xenova/bge-small-en-v1.5) |

## Inspiration

Inspired by [mcp-cli](https://github.com/philschmid/mcp-cli) by Phil Schmid, which nails the core DX of a shell-friendly MCP client. mcpx extends that foundation with OAuth support for HTTP servers and semantic tool search.

## Why mcpx?

mcpx is the client. If you need the server side — auth, governance, and production tools at scale — check out [Arcade](https://arcade.dev).

The full story: [curl for MCP: Why Coding Agents Are Happier Using the CLI](https://arcade.dev/blog/curl-for-mcp)

## License

MIT
