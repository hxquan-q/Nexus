# Changelog

## [0.2.1] - 2026-06-02

### Changed
- Replaced all `alert()` calls in options page with toast notifications
- Replaced all `confirm()` calls with custom confirmation dialog modals
- Internationalized all previously hardcoded English toast messages
- Removed non-essential `console.log` statements from content script and background service worker
- Added `.editorconfig` for consistent code style across contributors
- Added `LICENSE` file (MIT)
- Updated README with Contributing section and CHANGELOG link

## [0.2.0] - 2026-06-02

### Added
- Keyboard shortcut help modal in sidepanel header menu
- Time-of-day greeting in empty chat state (morning/afternoon/evening/night)
- Data migration version tracking system (storage schema versioning)
- Version display in settings page footer and history panel footer
- i18n support for all new shortcut help modal strings
- i18n support for time-of-day greeting strings (English + Chinese)

### Changed
- Improved empty state subtitle to show time-based greeting when provider is configured
- Memory cleanup: ensured all rAF timers are properly cleared on unmount
- Memory cleanup: ensured all interval timers are cleared on unmount

## [0.1.0] - 2026-06-02

### Added
- Apple-style SidePanel chat interface with dark/light/system themes
- Multi-provider AI support (OpenAI, Anthropic, Gemini, DeepSeek, OpenRouter, Qwen, Zhipu, Custom)
- Streaming responses with real-time markdown rendering
- Code syntax highlighting (18 languages) with copy/expand
- KaTeX math rendering (inline and block)
- Mermaid diagram rendering (sandboxed iframe)
- Graphviz/DOT diagram rendering (sandboxed iframe)
- Image input: paste, drag-drop, file picker with vision model support
- Document upload: PDF, DOCX, CSV, TXT, MD parsing
- Browser control via Chrome DevTools Protocol (19 tools)
- Page content extraction (Readability + Turndown)
- YouTube video transcript extraction and summarization
- Text selection toolbar (ask/summarize/translate/explain/grammar)
- Full-page and area screenshot capture with overlay
- Floating ball on all pages
- Keyboard shortcuts (configurable)
- Chat import/export (JSON, Markdown, HTML, ZIP)
- Agent Skills system with script execution
- MCP client (HTTP/SSE, Bearer auth)
- System prompt / custom instructions
- Right-click context menu integration
- Message actions: edit+resend, regenerate, delete, copy
- Conversation templates (Translation, Code, Writing, Analysis)
- Token context management with progress bar
- Context auto-trimming based on model limits
- Chat search within conversation (Ctrl+F)
- Pop-out chat window
- Share/copy chat as Markdown
- Onboarding wizard for first-time setup
- Provider connection test with response time
- Extension icon badge (streaming/error status)
- Message reactions (thumbs up/down)
- Sound effects (Web Audio API, optional)
- Network offline detection
- Full i18n support (English / Simplified Chinese)
- Comprehensive settings page (9 sections)
