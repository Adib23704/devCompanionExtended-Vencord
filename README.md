# DevCompanionExtended

A Vencord plugin that exposes an embedded [MCP](https://modelcontextprotocol.io/) (Model Context Protocol) server inside Discord, letting AI agents (Claude, Cursor, etc.) inspect and interact with the Discord client in real time.

## Authors

- prism
- justjxke
- \_\_azuree\_\_

---

## How It Works

The plugin runs an HTTP server inside Discord's Electron process (via IPC) that speaks JSON-RPC 2.0 / MCP. AI tools connect to it and call named tools to query webpack modules, Flux stores, the DOM, plugins, and more - all live inside the running Discord client.

Two transport modes are available:

| Mode | Default | Description |
|------|---------|-------------|
| **IPC (HTTP)** | Enabled | Native HTTP server hosted inside Electron via IPC. Fast, no external process needed. |
| **WebSocket fallback** | Disabled | Connects to an external MCP WebSocket server (e.g. the original DevCompanion). Activates if IPC fails and the setting is on. |

---

## Setup

1. Drop this folder into `src/userplugins/` and rebuild Vencord.
2. Enable **DevCompanionExtended** in Vencord settings.
3. Point your MCP client at `http://127.0.0.1:8486` (default IPC port).

The plugin will log the actual port to the Vencord logger (`DevCompanionExtended`) on startup.

---

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `notifyOnConnect` | `true` | Show notification when MCP connects |
| `allowReload` | `true` | Allow MCP to reload Discord |
| `allowPluginToggle` | `true` | Allow MCP to enable/disable plugins |
| `debugMode` | `true` | Enable debug logging |
| `ports` | _(empty)_ | Manual WebSocket ports/ranges (auto-detect if empty) |
| `maxReconnectAttempts` | `5` | WS reconnect retries before giving up |
| `scanSpread` | `2` | WS port scan range above/below default |
| `enableIpcServer` | `true` | Enable the embedded HTTP/IPC MCP server _(restart required)_ |
| `enableWebSocketFallback` | `false` | Fall back to WS if IPC fails |
| `ipcPort` | `8486` | IPC server port (`0` = OS auto-assign) |
| `cacheEnabled` | `true` | Cache responses for read-only tools |
| `cacheTtlMs` | `10000` | Cache TTL in ms |
| `cacheMaxEntries` | `300` | Max cached entries |
| `prebuildSearchIndex` | `false` | Pre-index module tokens at startup for faster literal search |
| `prebuildPatchIndex` | `false` | Pre-index patched modules at startup |
| `prewarmStoreCache` | `false` | Pre-populate store cache at startup |
| `prewarmSearchQueries` | _(empty)_ | Comma/space-separated literal queries to prewarm |
| `ipcReadyTimeoutMs` | `12000` | How long to wait for IPC readiness after reload |
| `ipcReadyIntervalMs` | `300` | Polling interval while waiting for IPC readiness |

---

## Toolbox Actions

Available in the Vencord plugin toolbox:

- **Reconnect** - stop and restart WebSocket connections
- **Test Connection** - log current WebSocket and IPC server status

---

## MCP Tools

All tools use JSON-RPC 2.0 via `tools/call`. Most tools accept an `action` field to select the sub-operation.

### `module`
Webpack module operations.

| Action | Description |
|--------|-------------|
| `find` | Search modules by props, code, displayName, pattern, etc. |
| `extract` | Get module source code |
| `exports` | List module exports |
| `context` | Summary + source snippets |
| `diff` | Original vs patched source |
| `deps` / `relationships` | Module dependency graph |
| `size` | Module size + extraction recommendation |
| `ids` | List all module IDs |
| `stats` | Webpack summary stats |
| `explain` | Context + exports + anchor candidates |
| `findStrings` | Extract string literals from a module |

**Key params:** `moduleId`, `props[]`, `code[]`, `pattern`, `kind`, `usePatched`, `maxLength`, `limit`

---

### `store`
Flux store operations.

| Action | Description |
|--------|-------------|
| `list` | List all known stores |
| `find` | Find a store by name |
| `state` | Get store state (optionally call a method) |
| `call` | Call a store method with args |
| `diff` | State changes since last snapshot |
| `subscriptions` | Events the store subscribes to |
| `methods` | Store method names |

**Key params:** `storeName` / `name`, `method`, `args[]`, `filter`, `limit`

---

### `component`
React component operations.

| Action | Description |
|--------|-------------|
| `find` | Find component by code snippets |
| `inspect` | Component tree from a CSS selector |
| `tree` | Detailed component tree |

**Key params:** `code[]`, `selector`, `maxDepth`, `maxBreadth`

---

### `intl`
Internationalisation / string key operations.

| Action | Description |
|--------|-------------|
| `hash` | Hash a readable intl key |
| `reverse` | Reverse a 6-char hash to a key |
| `search` | Search intl keys by text |
| `scan` | Find intl keys used in a module |
| `targets` | Find usage sites of an intl key |

**Key params:** `key`, `hash`, `query`, `moduleId`

---

### `flux`
Flux dispatcher operations.

| Action | Description |
|--------|-------------|
| `events` | List recent Flux events |
| `types` | List dispatcher action types |
| `dispatch` | Dispatch a Flux action |
| `listeners` | List listeners for an event |

**Key params:** `type`, `payload`, `event`, `filter`

---

### `patch`
Vencord patch analysis and testing.

| Action | Description |
|--------|-------------|
| `test` | Test a patch against live Discord |
| `lint` | Score patch pattern quality |
| `overlap` | Find overlapping patches for a module |
| `unique` | Check find-string uniqueness |
| `analyze` | All patched modules for a plugin |
| `plugin` | Patches registered by a plugin |
| `suggest` | Suggest alternatives for a broken find |

**Key params:** `find`, `match`, `replace`, `replacements[]`, `pluginName`, `moduleId`

---

### `dom`
DOM inspection and manipulation.

| Action | Description |
|--------|-------------|
| `inspect` / `query` | Query DOM elements |
| `styles` | Get computed styles |
| `modify` | Modify element styles/attributes/classes |
| `tree` | DOM subtree |
| `classes` | List all CSS classes on page |
| `text` | Find text nodes by content |
| `path` | Ancestor path of an element |
| `snapshot` | Full DOM snapshot |

**Key params:** `selector`, `limit`, `includeText`, `includeAttrs`, `query`, `styles`, `addClass`, `removeClass`

---

### `discord`
Discord context and APIs.

| Action | Description |
|--------|-------------|
| `context` | Current user/guild/channel context |
| `ready` | Wait for Discord ready state |
| `waitForIpc` | Wait for IPC server availability |
| `api` | Call a Discord REST endpoint |
| `snowflake` | Decode a Discord snowflake ID |
| `endpoints` | List known API endpoints |
| `common` | List common webpack module exports |
| `stores` | List Flux stores |
| `memory` | Memory usage stats |
| `performance` | Performance metrics |
| `enum` | Find and inspect Discord enums |

**Key params:** `method` (get/post/put/patch/del), `url`, `body`, `snowflake`, `filter`, `queryEnum`

---

### `analytics`
Capture Discord analytics events via `trackWithMetadata`.

| Action | Description |
|--------|-------------|
| `start` | Begin capturing |
| `get` / `events` | Retrieve captured events |
| `stop` | Stop capturing |
| `status` | Current capture status |
| `clear` | Clear captured events |

**Key params:** `filter`, `isRegex`, `limit`, `redact`, `fields`, `stopOnMatch`, `stopAfter`

---

### `plugin`
Vencord plugin management.

| Action | Description |
|--------|-------------|
| `list` | List plugins |
| `info` | Plugin details |
| `patches` | Patches registered by a plugin |
| `enable` / `disable` / `toggle` | Enable or disable a plugin |
| `settings` | Read plugin settings |
| `setSetting` | Write plugin settings |

**Key params:** `pluginName` / `pluginId` / `name`, `enabled`, `values`

---

### `search`
Unified module search.

| Action | Description |
|--------|-------------|
| `literal` | Substring search across all modules |
| `regex` / `pattern` | Regex search |
| `props` / `code` / `store` / `component` / `moduleId` | Type-specific search |
| `extract` | Search then return source snippets |
| `context` | Search with surrounding context lines |

**Key params:** `pattern`, `isRegex`, `limit`, `offset`, `kind`, `radius`, `contextLines`, `preset` (full/compact/minimal)

---

### `trace`
Trace Flux actions and store changes.

| Action | Description |
|--------|-------------|
| `start` | Begin tracing |
| `get` / `events` | Get traced events |
| `stop` | Stop tracing |
| `store` | Watch a store for changes |
| `storeEvents` | Events from watched stores |
| `handlers` | Registered Flux handlers |
| `status` | Trace status |
| `clear` | Clear trace buffer |

**Key params:** `filter`, `isRegex`, `storeName`, `redact`, `fields`, `sampleRate`, `matchPayload`, `maxPayloadDepth`

---

### `intercept`
Intercept live function calls.

| Action | Description |
|--------|-------------|
| `set` | Install an interceptor on a module export |
| `get` | Retrieve recorded calls |
| `stop` | Remove an interceptor |
| `status` | List active interceptors |

**Key params:** `moduleId`, `exportName`, `path`, `id`, `matchArgs`, `matchResult`, `sampleRate`

---

### `evaluateCode`
Evaluate arbitrary JavaScript inside the Discord client.

**Key params:** `code` _(required)_, `async`, `expression`, `timeoutMs`, `maxOutputChars`

---

### `reloadDiscord`
Reload the Discord client window.

**Key params:** `delayMs`

---

### `batch_tools`
Run multiple tools in one request, optionally in parallel.

**Key params:** `requests[]` _(required)_ - each with `tool`, `arguments`, optional `id` and `timeoutMs`; `parallelism` (default 4); `stream` (return a resource ID immediately and write results as they finish)

---

### `read_resource`
Read a stored resource by ID (used with streaming `batch_tools` results).

**Key params:** `resourceId` _(required)_, `offset`, `length`

---

## Architecture Notes

- **IPC path**: Native HTTP server (`native.ts`) runs in Electron main process. The renderer polls for queued requests via `getNextRequest` IPC, dispatches them to `handleMcpRequest`, and sends responses back via `sendResponse` IPC.
- **WebSocket path**: `ws.ts` connects outbound to an external MCP server (e.g. the original DevCompanion CLI) and handles the same tool set.
- **Caching**: Read-only tool responses are cached in memory with configurable TTL and max-entries to reduce redundant module scans.
- **Patch/search indexes**: Optional pre-built indexes (`prebuildSearchIndex`, `prebuildPatchIndex`) trade startup time for faster query responses.
