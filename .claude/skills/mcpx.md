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

## Rules

- Always search before executing — don't assume tool names exist
- Always inspect the schema before executing — validate you have the right arguments
- Use `mcpx search -k` for exact name matching
- Pipe results through `jq` when you need to extract specific fields
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

# Pipe from a file
cat params.json | mcpx exec server tool

# Read args from a file with --file flag
mcpx exec filesystem read_file -f params.json
```

## 4. Long-running tools (Tasks)

Some tools support async execution via MCP Tasks. mcpx auto-detects this and uses task-augmented execution when available.

```bash
# Default: waits for the task to complete, showing progress
mcpx exec my-server long_running_tool '{"input": "data"}'

# Return immediately with a task handle (for scripting/polling)
mcpx exec my-server long_running_tool '{"input": "data"}' --no-wait

# Check task status
mcpx task get my-server <taskId>

# Retrieve the result once complete
mcpx task result my-server <taskId>

# List all tasks on a server
mcpx task list my-server

# Cancel a running task
mcpx task cancel my-server <taskId>
```

For tools that don't support tasks, `exec` works exactly as before.

## 5. Elicitation (Server-Requested Input)

Some servers request user input mid-operation (e.g., confirmations, auth flows). mcpx handles this automatically:

```bash
# Interactive — prompts appear in the terminal
mcpx exec my-server deploy_tool '{"target": "staging"}'
# Server requests input: Confirm deployment
#   *Confirm [y/n]: y

# Non-interactive — decline all elicitation (for scripts/CI)
mcpx exec my-server deploy_tool '{"target": "staging"}' --no-interactive

# JSON mode — read/write elicitation as JSON via stdin/stdout
echo '{"action":"accept","content":{"confirm":true}}' | \
  mcpx exec my-server deploy_tool '{"target": "staging"}' --json
```

## Authentication

Some HTTP servers require OAuth. If you see an "Not authenticated" error:

```bash
mcpx auth <server>        # authenticate via browser
mcpx auth <server> -s     # check token status and TTL
mcpx auth <server> -r     # force token refresh
mcpx deauth <server>      # remove stored auth
```

## Available commands

| Command                                | Purpose                           |
| -------------------------------------- | --------------------------------- |
| `mcpx`                               | List all servers and tools        |
| `mcpx servers`                       | List servers (name, type, detail) |
| `mcpx -d`                            | List with descriptions            |
| `mcpx info <server>`                 | Server overview (version, capabilities, tools) |
| `mcpx info <server> <tool>`          | Show tool schema                  |
| `mcpx exec <server>`                 | List tools for a server           |
| `mcpx exec <server> <tool> '<json>'` | Execute a tool                    |
| `mcpx exec <server> <tool> -f file`  | Execute with args from file       |
| `mcpx search "<query>"`              | Search tools (keyword + semantic) |
| `mcpx search -k "<pattern>"`         | Keyword/glob search only          |
| `mcpx search -q "<query>"`           | Semantic search only              |
| `mcpx search -n <number> "<query>"`  | Limit number of results (default: 10) |
| `mcpx index`                         | Build/rebuild search index        |
| `mcpx index -i`                      | Show index status                 |
| `mcpx auth <server>`                 | Authenticate with OAuth           |
| `mcpx auth <server> -s`              | Check token status and TTL        |
| `mcpx auth <server> -r`              | Force token refresh               |
| `mcpx deauth <server>`               | Remove stored authentication      |
| `mcpx ping`                          | Check connectivity to all servers |
| `mcpx ping <server> [server2...]`    | Check specific server(s)          |
| `mcpx add <name> --command <cmd>`    | Add a stdio MCP server            |
| `mcpx add <name> --url <url>`        | Add an HTTP MCP server            |
| `mcpx add <name> --url <url> --transport sse` | Add a legacy SSE server  |
| `mcpx remove <name>`                 | Remove an MCP server              |
| `mcpx skill install --claude`        | Install mcpx skill for Claude   |
| `mcpx skill install --cursor`        | Install mcpx rule for Cursor    |
| `mcpx resource`                     | List all resources across servers |
| `mcpx resource <server>`            | List resources for a server       |
| `mcpx resource <server> <uri>`      | Read a specific resource          |
| `mcpx prompt`                       | List all prompts across servers   |
| `mcpx prompt <server>`              | List prompts for a server         |
| `mcpx prompt <server> <name> '<json>'` | Get a specific prompt          |
| `mcpx exec <server> <tool> --no-wait` | Execute as async task, return handle |
| `mcpx exec <server> <tool> --ttl <ms>` | Set task TTL (default: 60000) |
| `mcpx -N exec <server> <tool> ...`  | Decline elicitation (non-interactive) |
| `mcpx task list <server>`            | List tasks on a server          |
| `mcpx task get <server> <taskId>`    | Get task status                 |
| `mcpx task result <server> <taskId>` | Retrieve completed task result  |
| `mcpx task cancel <server> <taskId>` | Cancel a running task           |
