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
mcpcli call <server> <tool>
```

This shows parameters, types, required fields, and an example payload.

## 3. Call the tool

```bash
mcpcli call <server> <tool> '<json args>'
```

## Rules

- Always search before calling — don't assume tool names exist
- Always inspect the schema before calling — validate you have the right arguments
- Use `mcpcli search --keyword` for exact name matching
- Pipe results through `jq` when you need to extract specific fields
- Tool call results are always JSON with nested JSON strings auto-parsed
- Use `-v` for verbose HTTP debugging if a call fails unexpectedly

## Examples

```bash
# Find tools related to sending messages
mcpcli search "send a message"

# See what parameters Slack_SendMessage needs
mcpcli call arcade Slack_SendMessage

# Send a message
mcpcli call arcade Slack_SendMessage '{"channel":"#general","message":"hello"}'

# Chain commands — search repos and read the first result
mcpcli call github search_repositories '{"query":"mcp"}' \
  | jq -r '.content[0].text.items[0].full_name' \
  | xargs -I {} mcpcli call github get_file_contents '{"owner":"{}","path":"README.md"}'

# Read args from stdin
echo '{"path":"./README.md"}' | mcpcli call filesystem read_file
```

## Authentication

Some HTTP servers require OAuth. If you see an "Not authenticated" error:

```bash
mcpcli auth <server>        # authenticate via browser
mcpcli auth <server> --status  # check token status
mcpcli deauth <server>      # remove stored auth
```

## Available commands

| Command                                | Purpose                            |
| -------------------------------------- | ---------------------------------- |
| `mcpcli`                               | List all servers and tools         |
| `mcpcli -d`                            | List with descriptions             |
| `mcpcli call <server>`                 | List tools for a server            |
| `mcpcli call <server> <tool>`          | Show tool help and example payload |
| `mcpcli call <server> <tool> '<json>'` | Execute a tool                     |
| `mcpcli info <server>/<tool>`          | Show tool schema                   |
| `mcpcli search "<query>"`              | Search tools                       |
| `mcpcli auth <server>`                 | Authenticate with OAuth            |
