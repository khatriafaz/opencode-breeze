# opencode-breeze

Open [Breeze](https://www.breeze.pm) cards in the OpenCode Desktop side panel. Click a card link anywhere in a session and
the card opens in its own side tab, where you can tick checklist items and post comments.

Built for OpenCode `2.3.x` (`@opencode/plugin@2.3.0`). The GUI plugin API is experimental.

## What it adds

| Part | Where |
| --- | --- |
| Card link clicks | A click on `app.breeze.pm/cards/<id>` or `app.breeze.pm/projects/<p>/cards/<id>` opens the card in a side tab. ⌘-click (or any modifier) opens the browser as before. |
| Card tab | Project, list, assignees, dates, time, tags, custom fields, description, checklists you can tick, and comments. |
| Card actions | **Send to agent** button under the title (attaches the card to your prompt as a chip), move to another list, set or clear the due date, add or remove assignees, edit or delete your own comments. |
| Comment editor | Bold, italic, strikethrough, code, lists, quote, link (⌘B, ⌘I, ⌘⇧X, ⌘E, ⌘K; ⌘↩ posts) and `@` mentions of project members, who get notified. Paste arrives as plain text. |
| Session link | **Link to session** on a card (or **Send to agent**, which links too) pins it to the session. Linked cards show as a Breeze chip in the session header, next to the context and branch; click it to open the card, or pick one when several are linked. Links are stored per session on the server, copied to forks and removed with the session. |
| Freshness | A visible card refreshes when shown, on window focus and every 2 minutes; hidden card tabs every 5 minutes. A dot on a card's tab marks comments you have not seen. |
| **Breeze** tab | Connection status, open a card by link or id, and the cards linked in this session. From the side panel **+** menu or the **Open Breeze panel** command. |
| Integration | **Breeze** in OpenCode's integrations, with a personal API token or `BREEZE_API_TOKEN`. |

## Behavior

- **Tabs:** each card is its own side tab (`card-<id>`). OpenCode stores open tabs per session.
- **Token:** the server part holds it. Connect from the panel; the token goes to OpenCode's credential store. If
  `BREEZE_API_TOKEN` is set in the server's environment, that works too.
- **Teams:** accounts in several Breeze teams are handled by trying each team and remembering which one sees the card.
- **Writes:** ticks, list moves, dates and assignees save at once; comments post on **Post**; deleting a comment asks
  first. There is no undo from the panel.
- **Send to agent:** the chip carries the card's facts, description, checklists and latest 5 comments, quoted. The agent
  gets no Breeze tools.
- **Click interception:** OpenCode sends http(s) links straight to the browser and has no plugin hook for them, so the
  panel catches card-link clicks in the capture phase. That relies on the app's markup and may need fixing after an
  OpenCode update. The **Breeze** tab's linked-cards list works without it.
- **Logo:** tabs draw the Breeze mark through their label. The **+** menu and New tab list only take built-in icon
  names, so the panel swaps the icon on rows titled exactly "Breeze" in the DOM. Like the link interception, it may
  need fixing after an OpenCode update; if it breaks, those rows show the built-in checklist icon.

## Install

```bash
opencode plugin add "git+https://github.com/khatriafaz/opencode-breeze.git#v0.2.0"
```

This adds the plugin to your global `~/.config/opencode/opencode.json`. OpenCode Desktop loads GUI plugins only from
the global config. The built panel bundle ships in the repo, so there is no build step. Drop `#v0.2.0` to track `main`.

Then connect Breeze: open **Breeze** from the side panel **+** menu and click **Connect Breeze**, or set
`BREEZE_API_TOKEN` for the OpenCode server. Your token is on [app.breeze.pm/profile](https://app.breeze.pm/profile).

## Develop

```bash
bun install
bun run bundle     # dist/gui-experimental.cjs
bun run dev        # rebuild on change
bun run typecheck
```

Load a clone from the global config:

```jsonc
// ~/.config/opencode/opencode.json
{ "plugins": ["/absolute/path/to/opencode-breeze"] }
```

Commit `dist/` after GUI changes; Git installs use the committed bundle. The script is named `bundle`, not `build`,
because OpenCode's Git installer fails on packages with a `build` script.

## Layout

```text
src/
├── index.ts          Server part: integration, Breeze REST client, session links, RPC
├── rpc.ts            RPC contract (`breeze`) shared by the server and GUI parts
├── gui.tsx           ./gui-experimental entry: panel, link interception, command, menu item
└── gui/
    ├── definition.ts i18n
    ├── links.ts      Card link parsing
    ├── state.ts      Card cache over RPC, session link scan
    ├── card.tsx      Card tab
    ├── editor.tsx    Rich comment editor with @mentions
    ├── text.ts       Card as plain-text context for the agent
    ├── home.tsx      Breeze tab
    ├── icon.tsx      Breeze logo for tabs and launcher rows
    └── style.css
```

## RPC

`POST /api/rpc/breeze/<method>?location[directory]=<dir>` with body `{ "input": { ... } }`.

| Method | Input | Output |
| --- | --- | --- |
| `linked` | `{ sessionID }` | `{ sessionID, cardIDs }` |
| `link` | `{ sessionID, cardID, linked }` | `{ sessionID, cardIDs }` |
| `account` | `{}` | `{ connected, name?, email?, error? }` |
| `connect` | `{ token }` | same as `account` |
| `card` | `{ cardID }` | the card |
| `todo` | `{ cardID, todoListID, todoID, done }` | the card |
| `comment` | `{ cardID, text, mentionIDs? }` | the card |
| `editComment` | `{ cardID, commentID, text, mentionIDs? }` | the card |
| `deleteComment` | `{ cardID, commentID }` | the card |
| `update` | `{ cardID, stageID?, dueDate? }` (`YYYY-MM-DD` or `null`) | the card |
| `assign` | `{ cardID, add?: emails, remove?: userIDs }` | the card |

## License

MIT
