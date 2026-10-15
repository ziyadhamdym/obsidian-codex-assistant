# Obsidian Codex Assistant

**Use Codex with your Obsidian Markdown notes and Canvas boards.** This project includes a local Codex plugin and an optional Obsidian community plugin. It can search notes, find useful connections, review common cleanup issues, inspect Canvas cards and edges, and prepare note or Canvas changes for your approval.

> This is an independent community project. It is not affiliated with or endorsed by Obsidian or OpenAI.

## What it can do

### In Codex

- Connect to one Obsidian vault you choose on your computer.
- Search and read Markdown notes, and find likely missing note links.
- Report broken wiki links, orphan notes, empty notes, and common formatting issues.
- List and read `.canvas` files, including their text, file cards, and connections.
- Inspect Canvas files for malformed data, duplicate IDs, missing note cards, and dangling connections.
- Suggest Markdown notes related to a Canvas.
- Create a Markdown note or a Canvas with text cards and references to existing notes when you ask.
- Stage edits to an existing note or Canvas and show you the proposed change first.

### In Obsidian

The optional Obsidian plugin adds these Command Palette commands:

- **Show vault overview**
- **Suggest links for current note**
- **Review cleanup for current note**
- **Search notes**
- **Create a note**
- **Show Canvas overview**
- **Inspect current Canvas**
- **Suggest note cards for current Canvas**
- **Create a Canvas**

Choosing **Add card** in the Canvas suggestions dialog adds that note card and a connection to the open Canvas.

## Install in Codex

Codex runs the MCP server locally. You need Node.js available on your computer.

1. Install this repository as a local Codex plugin marketplace:

   ```sh
   codex plugin marketplace add <owner>/obsidian-codex-assistant
   ```

   You can also use the repository's HTTPS Git URL or a local clone path.

2. Install and enable the plugin:

   ```sh
   codex plugin add obsidian-codex-assistant@obsidian-codex-local
   ```

3. If its tools do not appear, restart Codex or open a new local conversation.
4. Ask Codex to connect your vault and provide that vault's absolute folder path. The connection lasts for the current MCP session, so connect again after a session restart.

For safer writes, set the Obsidian MCP server's tool approval mode to prompt in Codex settings:

```toml
[plugins."obsidian-codex-assistant".mcp_servers.obsidian]
enabled = true
default_tools_approval_mode = "prompt"
```

## Install in Obsidian

1. Copy the repository's `obsidian-plugin` folder into your vault's `.obsidian/plugins/` directory and rename the copied folder to `obsidian-codex-assistant`.
2. In Obsidian, open **Settings → Community plugins** and enable **Obsidian Codex Assistant**.
3. Open the Command Palette and choose one of the commands listed above.

The plugin manifest supports Obsidian 1.5.0 and later. On macOS, iCloud Drive vaults can be selected by their local folder path.

## Example requests

- “Search my vault for notes about project planning.”
- “Show notes that might connect to the current note.”
- “Check `Projects/Roadmap.canvas` for broken cards or connections.”
- “Find notes that would make useful cards on this Canvas.”
- “Create a Canvas with these three note cards: …”
- “Clean up this note, show me the changes, and wait for my approval.”

## Available Codex tools

| Tool | Purpose |
| --- | --- |
| `connect_vault` | Connect to a user-selected vault folder. |
| `vault_overview` | Summarize notes, Canvas count, broken links, orphan notes, and empty notes. |
| `search_notes`, `read_note` | Find and read Markdown notes. |
| `suggest_links`, `inspect_note_cleanup` | Suggest note links and report formatting or link issues. |
| `list_canvases`, `read_canvas`, `inspect_canvas` | List and inspect Canvas files. |
| `suggest_canvas_links` | Suggest related Markdown notes for a Canvas. |
| `propose_note_edit`, `propose_canvas_edit` | Stage a change and return a diff without writing it. |
| `apply_note_edit` | Apply a staged note or Canvas edit after you explicitly approve it. |
| `create_note`, `create_canvas` | Create new files when you ask. |

## Privacy and safety

- The MCP server is local and operates on the vault path you select. It skips hidden folders and symbolic links and rejects paths outside that vault.
- Note or Canvas content returned to Codex is processed by the AI host under your account's data settings. This project does not run a remote server or send telemetry.
- Existing notes and Canvas files are not changed until you approve a staged Codex edit. In Obsidian, cleanup changes and Canvas card additions happen only after you choose the corresponding action.
- The plugin has no delete tool.
- macOS may ask Codex for Files & Folders access. macOS access controls can apply to iCloud Drive broadly, while this plugin's file operations are scoped to the vault you selected.

## Project layout

```text
codex-plugin/       Local MCP server, tool definitions, and Codex skill
obsidian-plugin/    Optional Obsidian community plugin
marketplace.json    Local Codex marketplace definition
```

## Current limitations

- Canvas suggestions use shared words and note titles. They are hints for you to review, not guaranteed semantic matches.
- The Codex connection is local to the current MCP session.
- This release does not delete files, move notes, or edit Canvas layouts automatically.

## Release

Current version: **0.2.0**

## العربية

**استخدم Codex مع ملاحظات Obsidian ولوحات Canvas.** المشروع فيه إضافة محلية لـCodex وإضافة اختيارية لـObsidian. تقدر تبحث في الملاحظات، وتكتشف روابط محتملة، وتراجع مشاكل التنسيق، وتفحص بطاقات وروابط Canvas، وتقترح تعديلات قبل تطبيقها.

### التثبيت في Codex

تحتاج Node.js. أضف المستودع كسوق إضافات محلي:

```sh
codex plugin marketplace add <owner>/obsidian-codex-assistant
codex plugin add obsidian-codex-assistant@obsidian-codex-local
```

بعدها اطلب من Codex الاتصال بفولت Obsidian وأعطه المسار الكامل لمجلد الفولت. الاتصال يستمر خلال جلسة MCP الحالية فقط؛ أعد الاتصال بعد إعادة تشغيل الجلسة.

### التثبيت في Obsidian

انسخ مجلد `obsidian-plugin` إلى `<مجلد الفولت>/.obsidian/plugins/obsidian-codex-assistant/`، ثم فعّل **Obsidian Codex Assistant** من **Settings → Community plugins**. افتح قائمة الأوامر لاستخدام أوامر البحث والتنظيف والروابط وCanvas.

### الأمان والخصوصية

خادم Codex محلي ويتعامل مع الفولت الذي تختاره فقط، ويتجاهل المجلدات المخفية والروابط الرمزية. محتوى الملاحظات الذي يرجع إلى Codex تتم معالجته حسب إعدادات بيانات حسابك لدى مضيف الذكاء الاصطناعي. تعديلات Codex على ملاحظة أو Canvas موجودة لا تُحفظ إلا بعد موافقتك الصريحة. لا توجد أداة لحذف الملفات.
