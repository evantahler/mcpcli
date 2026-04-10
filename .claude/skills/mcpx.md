---
name: mcpx
description: Discover and use MCP tools via the mcpx CLI
trigger: when the user wants to interact with external services, APIs, or MCP tools
---

# mcpx — MCP Tool Discovery and Execution

You have access to external tools via `mcpx`. Use this workflow:

## 1. Search for tools

```bash
mcpx search "<what you want to do>"
```

## 2. Inspect the tool schema

```bash
mcpx info <server> <tool>
```

This shows parameters, types, required fields, and the full JSON Schema.

## 3. Execute the tool

```bash
mcpx exec <server> <tool> '<json args>'
mcpx exec <server> <tool> -f params.json
```

Output is JSON when piped. Use `--json` to force JSON output in any context — prefer this when you need to parse results programmatically.

## Rules

- Always search before executing — don't assume tool names exist
- Always inspect the schema before executing — validate you have the right arguments
- Use `mcpx search -k` for exact name matching
- Pipe results through `jq` when you need to extract specific fields
- Use `--json` when parsing output programmatically (automatic when piped, but explicit is safer)
- Use `-v` for verbose debugging (HTTP details + JSON-RPC protocol messages) if an exec fails unexpectedly
- Use `-l debug` to see all server log messages, or `-l error` for errors only

## Examples

```bash
# Find tools related to sending messages
mcpx search "send a message"

# See what parameters Slack_SendMessage needs
mcpx info arcade Slack_SendMessage

# Send a message
mcpx exec arcade Slack_SendMessage '{"channel":"#general","message":"hello"}'

# Chain commands — search repos and read the first result
mcpx exec github search_repositories '{"query":"mcp"}' \
  | jq -r '.content[0].text | fromjson | .items[0].full_name' \
  | xargs -I {} mcpx exec github get_file_contents '{"owner":"{}","path":"README.md"}'

# Read args from stdin
echo '{"path":"./README.md"}' | mcpx exec filesystem read_file

# Read args from a file with --file flag
mcpx exec filesystem read_file -f params.json
```

## Troubleshooting

- **"Not authenticated" / 401 error** → Run `mcpx auth <server>` to start the OAuth flow
- **Exec timeout** → Use `-v` to see where it stalls; set `MCP_TIMEOUT=<seconds>` to increase the timeout (default: 1800)
- **Search returns no results** → Try `mcpx search -k "*keyword*"` for glob matching, or `mcpx index` to rebuild the search index
- **Missing or stale tools** → Run `mcpx index` to rebuild; any command that connects to a server also auto-updates the index
- **Server won't connect** → Run `mcpx ping <server>` to check connectivity; use `-v` for protocol-level details
- **Auth token expired** → Run `mcpx auth <server> -r` to force a token refresh

## Long-running tools (Tasks)

Some tools support async execution via MCP Tasks. mcpx auto-detects this.

```bash
# Default: waits for the task to complete, showing progress
mcpx exec my-server long_running_tool '{"input": "data"}'

# Return immediately with a task handle (for scripting/polling)
mcpx exec my-server long_running_tool '{"input": "data"}' --no-wait

# Check task status / retrieve result / cancel
mcpx task get my-server <taskId>
mcpx task result my-server <taskId>
mcpx task cancel my-server <taskId>
mcpx task list my-server
```

## Elicitation (Server-Requested Input)

Some servers request user input mid-operation. mcpx handles this automatically in interactive mode. Use `-N` / `--no-interactive` to decline all elicitation (for scripts/CI), or `--json` to handle elicitation programmatically via stdin/stdout.

## Authentication

```bash
mcpx auth <server>             # authenticate via browser
mcpx auth <server> -s          # check token status and TTL
mcpx auth <server> -r          # force token refresh
mcpx auth <server> --no-index  # authenticate without rebuilding search index
mcpx deauth <server>           # remove stored auth
```

## Available commands

| Command                                | Purpose                           |
| -------------------------------------- | --------------------------------- |
| `mcpx`                                | List all servers and tools        |
| `mcpx servers`                        | List servers (name, type, detail) |
| `mcpx -d`                             | List with descriptions            |
| `mcpx info <server>`                  | Server overview (version, capabilities, tools) |
| `mcpx info <server> <tool>`           | Show tool schema                  |
| `mcpx exec <server>`                  | List tools for a server           |
| `mcpx exec <server> <tool> '<json>'`  | Execute a tool                    |
| `mcpx exec <server> <tool> -f file`   | Execute with args from file       |
| `mcpx search "<query>"`               | Search tools (keyword + semantic) |
| `mcpx search -k "<pattern>"`          | Keyword/glob search only          |
| `mcpx search -q "<query>"`            | Semantic search only              |
| `mcpx search -n <number> "<query>"`   | Limit number of results (default: 10) |
| `mcpx index`                          | Build/rebuild search index        |
| `mcpx index -i`                       | Show index status                 |
| `mcpx auth <server>`                  | Authenticate with OAuth           |
| `mcpx auth <server> -s`               | Check token status and TTL        |
| `mcpx auth <server> -r`              | Force token refresh               |
| `mcpx auth <server> --no-index`       | Authenticate without rebuilding index |
| `mcpx deauth <server>`                | Remove stored authentication      |
| `mcpx ping`                           | Check connectivity to all servers |
| `mcpx ping <server> [server2...]`     | Check specific server(s)          |
| `mcpx add <name> --command <cmd>`     | Add a stdio MCP server            |
| `mcpx add <name> --url <url>`         | Add an HTTP MCP server            |
| `mcpx remove <name>`                  | Remove an MCP server              |
| `mcpx skill install --claude`         | Install mcpx skill for Claude     |
| `mcpx skill install --cursor`         | Install mcpx rule for Cursor      |
| `mcpx resource`                       | List all resources across servers |
| `mcpx resource <server>`              | List resources for a server       |
| `mcpx resource <server> <uri>`        | Read a specific resource          |
| `mcpx prompt`                         | List all prompts across servers   |
| `mcpx prompt <server>`                | List prompts for a server         |
| `mcpx prompt <server> <name> '<json>'` | Get a specific prompt            |
| `mcpx task list <server>`             | List tasks on a server            |
| `mcpx task get <server> <taskId>`     | Get task status                   |
| `mcpx task result <server> <taskId>`  | Retrieve completed task result    |
| `mcpx task cancel <server> <taskId>`  | Cancel a running task             |

## Global flags

| Flag                      | Purpose                                                  |
| ------------------------- | -------------------------------------------------------- |
| `-j, --json`              | Force JSON output (default when piped)                   |
| `-v, --verbose`           | Show HTTP details and JSON-RPC protocol messages         |
| `-d, --with-descriptions` | Include tool descriptions in list output                 |
| `-c, --config <path>`     | Specify config file location                             |
| `-N, --no-interactive`    | Decline server elicitation requests (for scripted usage) |
| `-S, --show-secrets`      | Show full auth tokens in verbose output (unmasked)       |
| `-l, --log-level <level>` | Minimum server log level to display (default: `warning`) |

## `add` options

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

## `remove` options

| Flag          | Purpose                                          |
| ------------- | ------------------------------------------------ |
| `--keep-auth` | Don't remove stored auth credentials             |
| `--dry-run`   | Show what would be removed without changing files |

## `skill install` options

| Flag        | Purpose                                    |
| ----------- | ------------------------------------------ |
| `--claude`  | Install skill for Claude Code              |
| `--cursor`  | Install rule for Cursor                    |
| `--global`  | Install to global location (`~/`)          |
| `--project` | Install to project location (default)      |
| `-f, --force` | Overwrite if file already exists         |

## Environment variables

| Variable          | Purpose                     | Default    |
| ----------------- | --------------------------- | ---------- |
| `MCP_CONFIG_PATH` | Config directory path       | `~/.mcpx/` |
| `MCP_TIMEOUT`     | Request timeout (seconds)   | `1800`     |
| `MCP_CONCURRENCY` | Parallel server connections | `5`        |
| `MCP_MAX_RETRIES` | Retry attempts              | `3`        |
| `MCP_STRICT_ENV`  | Error on missing `${VAR}`   | `true`     |
| `MCP_DEBUG`       | Enable debug output         | `false`    |
