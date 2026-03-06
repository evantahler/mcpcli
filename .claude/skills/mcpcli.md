---
name: mcpcli
description: Discover and use MCP tools via the mcpcli CLI
trigger: when the user wants to interact with external services, APIs, or MCP tools
---

# mcpcli — MCP Tool Discovery and Execution

You have access to external tools via `mcpcli`. Use this workflow:

## 1. Search for tools

```bash
mcpcli search "<what you want to do>"
```

## 2. Inspect the tool schema

```bash
mcpcli info <server> <tool>
```

This shows parameters, types, required fields, and the full JSON Schema.

## 3. Execute the tool

```bash
mcpcli exec <server> <tool> '<json args>'
```

## Rules

- Always search before executing — don't assume tool names exist
- Always inspect the schema before executing — validate you have the right arguments
- Use `mcpcli search -k` for exact name matching
- Pipe results through `jq` when you need to extract specific fields
- Use `-v` for verbose HTTP debugging if an exec fails unexpectedly

## Examples

```bash
# Find tools related to sending messages
mcpcli search "send a message"

# See what parameters Slack_SendMessage needs
mcpcli info arcade Slack_SendMessage

# Send a message
mcpcli exec arcade Slack_SendMessage '{"channel":"#general","message":"hello"}'

# Chain commands — search repos and read the first result
mcpcli exec github search_repositories '{"query":"mcp"}' \
  | jq -r '.content[0].text | fromjson | .items[0].full_name' \
  | xargs -I {} mcpcli exec github get_file_contents '{"owner":"{}","path":"README.md"}'

# Read args from stdin
echo '{"path":"./README.md"}' | mcpcli exec filesystem read_file
```

## Authentication

Some HTTP servers require OAuth. If you see an "Not authenticated" error:

```bash
mcpcli auth <server>        # authenticate via browser
mcpcli auth <server> -s     # check token status and TTL
mcpcli auth <server> -r     # force token refresh
mcpcli deauth <server>      # remove stored auth
```

## Available commands

| Command                                | Purpose                           |
| -------------------------------------- | --------------------------------- |
| `mcpcli`                               | List all servers and tools        |
| `mcpcli -d`                            | List with descriptions            |
| `mcpcli info <server>`                 | Show tools for a server           |
| `mcpcli info <server> <tool>`          | Show tool schema                  |
| `mcpcli exec <server>`                 | List tools for a server           |
| `mcpcli exec <server> <tool> '<json>'` | Execute a tool                    |
| `mcpcli search "<query>"`              | Search tools (keyword + semantic) |
| `mcpcli search -k "<pattern>"`         | Keyword/glob search only          |
| `mcpcli search -q "<query>"`           | Semantic search only              |
| `mcpcli index`                         | Build/rebuild search index        |
| `mcpcli index -i`                      | Show index status                 |
| `mcpcli auth <server>`                 | Authenticate with OAuth           |
| `mcpcli auth <server> -s`              | Check token status and TTL        |
| `mcpcli auth <server> -r`              | Force token refresh               |
| `mcpcli deauth <server>`               | Remove stored authentication      |
| `mcpcli add <name> --command <cmd>`    | Add a stdio MCP server            |
| `mcpcli add <name> --url <url>`        | Add an HTTP MCP server            |
| `mcpcli remove <name>`                 | Remove an MCP server              |
| `mcpcli skill install --claude`        | Install mcpcli skill for Claude   |
