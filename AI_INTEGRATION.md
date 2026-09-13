# AI Integration for Parse Server

This document describes how AI agents and LLMs can interact with Parse Server databases.

## Parse MCP Server

[Parse MCP Server](https://github.com/R3D347HR4Y/parse-mcp) is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that enables AI assistants to interact with Parse Server instances through natural language.

[![Docker Hub](https://img.shields.io/docker/v/purpleshow/parse-mcp-server?label=Docker%20Hub&logo=docker&sort=semver)](https://hub.docker.com/r/purpleshow/parse-mcp-server)
[![GitHub](https://img.shields.io/github/stars/R3D347HR4Y/parse-mcp?style=social)](https://github.com/R3D347HR4Y/parse-mcp)

### Features

| Category | Capabilities |
|----------|-------------|
| **Schema Exploration** | Get all schemas, inspect class structure, understand field types |
| **Data Querying** | Full Parse query syntax, pagination, sorting, pointer includes |
| **Relations** | Query and manage Pointer and Relation fields |
| **CRUD Operations** | Create, read, update, delete objects with safety prompts |
| **Batch Operations** | Bulk create, update, delete (max 50 per batch) |
| **Users & Roles** | Query users, list roles, get role members |
| **Cloud Code** | Execute Cloud Code functions |
| **Aggregation** | MongoDB-style aggregation pipelines |
| **Troubleshooting** | Validate pointers, find orphaned references, class statistics |
| **Configuration** | Read and update Parse Config |

### Installation

#### Docker (Recommended)

```bash
docker pull purpleshow/parse-mcp-server:latest

docker run -d -p 3000:3000 \
  -e PARSE_SERVER_URL="http://localhost:1337/parse" \
  -e PARSE_APP_ID="YOUR_APP_ID" \
  -e PARSE_MASTER_KEY="YOUR_MASTER_KEY" \
  purpleshow/parse-mcp-server:latest
```

#### npm

```bash
npm install -g parse-mcp-server
```

### IDE Configuration

#### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "parse": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "MCP_TRANSPORT=stdio",
        "-e", "PARSE_SERVER_URL=http://localhost:1337/parse",
        "-e", "PARSE_APP_ID=YOUR_APP_ID",
        "-e", "PARSE_MASTER_KEY=YOUR_MASTER_KEY",
        "purpleshow/parse-mcp-server:latest"
      ]
    }
  }
}
```

#### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "parse": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "MCP_TRANSPORT=stdio",
        "-e", "PARSE_SERVER_URL=http://localhost:1337/parse",
        "-e", "PARSE_APP_ID=YOUR_APP_ID",
        "-e", "PARSE_MASTER_KEY=YOUR_MASTER_KEY",
        "purpleshow/parse-mcp-server:latest"
      ]
    }
  }
}
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PARSE_SERVER_URL` | ✅ | Parse Server URL (e.g., `http://localhost:1337/parse`) |
| `PARSE_APP_ID` | ✅ | Your Parse Application ID |
| `PARSE_MASTER_KEY` | ⚠️ | Master Key for admin operations |
| `PARSE_JS_KEY` | ❌ | JavaScript Key (optional) |
| `MCP_TRANSPORT` | ❌ | `http` (default) or `stdio` |
| `MCP_PORT` | ❌ | HTTP port (default: 3000) |

### Safety

The MCP server is designed with safety in mind:

- **Permission Prompts**: All data modification tools include warnings and suggest asking for user permission
- **Destructive Warnings**: Delete operations are clearly marked as dangerous
- **Sample-First Approach**: Encourages getting sample data before writing complex queries
- **Schema Awareness**: Suggests exploring schemas to understand data structure

### Links

- **GitHub**: <https://github.com/R3D347HR4Y/parse-mcp>
- **Docker Hub**: <https://hub.docker.com/r/purpleshow/parse-mcp-server>
- **npm**: <https://www.npmjs.com/package/parse-mcp-server>

## For AI Agents

If you are an AI agent exploring this repository:

1. **To interact with a Parse Server database**, use the Parse MCP Server tools
2. **Before querying**, use `get_all_schemas` to understand the database structure
3. **Before complex queries**, use `get_sample_objects` to see actual data formats
4. **Before modifying data**, always ask the user for permission
5. **For troubleshooting**, use `validate_pointer` and `find_orphaned_pointers`

### Recommended Workflow


