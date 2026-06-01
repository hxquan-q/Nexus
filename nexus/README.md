# Nexus - AI-Powered Browser Assistant

**Nexus** is a Chrome extension (Manifest V3) that brings a native AI layer to your browser. Chat with any AI model, control web pages, extract content, capture screenshots, and more -- all from a sleek sidepanel with Apple-level UI design.

![Nexus SidePanel](https://img.shields.io/badge/UI-Apple_HIG_Inspired-blue)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)
![Vue 3](https://img.shields.io/badge/Vue-3.x-42b883)
![WXT](https://img.shields.io/badge/WXT-0.20-orange)

## What It Looks Like

The sidepanel features a clean, spacious chat interface with:
- Rounded message bubbles (user in blue, assistant in light gray) with avatars
- Streaming AI responses with a blinking cursor
- Collapsible reasoning/thinking blocks
- Code blocks with syntax highlighting, copy button, and fullscreen expand
- KaTeX math rendering (inline and block)
- Mermaid and Graphviz diagram rendering in sandboxed iframes
- A model switcher dropdown in the header
- Light/dark/system theme with smooth transitions
- A history panel that slides in from the left

## Features

### M1: Core Chat Interface
- Apple Human Interface Guidelines inspired design
- SF Pro typography, frosted glass effects, subtle shadows
- Streaming responses with typewriter animation
- Auto-expanding input textarea
- Keyboard shortcuts (Enter send, Shift+Enter newline, Escape cancel)

### M2: Multi-Provider AI
- **OpenAI** (Chat Completions API)
- **Anthropic** (Claude, Messages API)
- **Gemini** (Google AI Studio)
- **DeepSeek** (with reasoning_content support)
- **OpenRouter** (multi-model routing)
- **Qwen / DashScope** (Chinese provider)
- **Zhipu** (GLM models)
- **Custom OpenAI-compatible** endpoints
- Quick model switcher in chat header
- Per-model vision capability toggle

### M3: Rich Markdown & Chart Rendering
- GFM (tables, task lists, strikethrough)
- Code blocks with highlight.js, copy button, fullscreen modal
- KaTeX math ($inline$ and $$block$$)
- Mermaid diagrams (flowchart, sequence, class, state, gantt, pie)
- Graphviz (DOT language) diagrams
- Image embedding with lightbox preview

### M4: Multimodal Input
- Image: paste, drag-and-drop, file picker (up to 4 per message)
- Documents: PDF, DOCX, CSV, TXT, MD with text extraction
- Vision model auto-detection

### M5: Browser Control
- Navigate, click, fill, hover, press keys via Chrome DevTools Protocol
- Screenshot capture and analysis
- Tab group integration for controlled tabs
- Sensitive action confirmation dialogs

### M6: Page Content & Video Summarization
- Readability + Turndown page extraction to clean Markdown
- YouTube transcript extraction and summarization
- Context menu: Summarize, Translate, Explain selected text

### M7: Chat Import/Export
- Export as JSON (full data) or Markdown (readable)
- ZIP export for multiple sessions
- Import with merge or replace modes

### M8: Agent Skills & MCP
- Import skill folders with instructions, scripts, and resources
- Script execution with user confirmation and trust mechanism
- MCP server connections with dynamic tool discovery
- Auth: none, Bearer Token, OAuth 2.1

### M9: Settings & Configuration
- Provider management (add/edit/delete/reorder)
- Theme selector (light/dark/system)
- UI font scale, language (en/zh-CN)
- Floating ball toggle, selection quote toggle
- System prompt customization
- Keyboard shortcut configuration

### M10: Screenshot & Selection Interaction
- Full-page screenshot capture
- Area screenshot with drag selection overlay
- Text selection toolbar (Ask, Summarize, Translate, Explain, Grammar)
- Selection popup with AI result display
- Configurable keyboard shortcuts

## Installation

### Development Mode

```bash
# Clone the repository
git clone <repo-url>
cd nexus

# Install dependencies
npm install

# Start development server with hot reload
npm run dev
```

Then in Chrome:
1. Open `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `.output/chrome-mv3` directory

### Production Build

```bash
# Build for Chrome
npm run build

# The built extension is in .output/chrome-mv3
# Zip it for distribution
npm run zip
```

## Configuration

### Adding an AI Provider

1. Click the gear icon in the sidepanel header (or go to extension options)
2. Navigate to **Providers** > **Add Provider**
3. Fill in:
   - **Name**: A friendly name (e.g., "My OpenAI")
   - **Type**: Select the provider type
   - **Base URL**: The API endpoint (auto-filled for known providers)
   - **API Key**: Your API key
4. Click **Fetch** to auto-discover models, or add them manually
5. Toggle the **V** badge on models that support vision/image input
6. Save and click **Activate** to start using the provider

### Quick Start with OpenAI

```
Type: OpenAI
Base URL: https://api.openai.com/v1
API Key: sk-...
Model: gpt-4o
```

### Using a Custom Provider

Any OpenAI-compatible endpoint works:

```
Type: Custom
Base URL: https://your-api.example.com/v1
API Key: your-key
Model: your-model-id
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Extension Framework | WXT |
| UI Framework | Vue 3 (Composition API) |
| Styling | CSS Variables + Scoped CSS |
| AI Providers | OpenAI SDK + custom adapters |
| Markdown | marked + custom renderers |
| Math | KaTeX |
| Charts | mermaid + @viz-js/viz (Graphviz) |
| Code Highlight | highlight.js |
| PDF Parsing | pdfjs-dist |
| DOCX Parsing | mammoth |
| CSV Parsing | PapaParse |
| Page Extraction | @mozilla/readability + turndown |
| Storage | @wxt-dev/storage + idb (IndexedDB) |
| MCP | @modelcontextprotocol/sdk |
| Archive | jszip |

## Development

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (Chrome)
npm run dev:firefox  # Start dev server (Firefox)
npm run build        # Production build (Chrome)
npm run compile      # Type check with vue-tsc
npm run zip          # Package as .zip
```

### Project Structure

```
nexus/
  entrypoints/
    background.ts          # Service worker
    sidepanel/             # Chat interface (App.vue)
    options/               # Settings page (App.vue)
    content/               # Content scripts
    sandbox/               # Sandboxed page for chart rendering
  utils/
    api.ts                 # Multi-provider streaming API
    providers/             # Provider adapters and types
    db.ts                  # IndexedDB session persistence
    storage.ts             # WXT storage helpers
    markdown.ts            # Markdown rendering config
    fileParser.ts          # File to text extraction
    pageExtractor.ts       # Web page content extraction
    videoSummary.ts        # YouTube transcript extraction
    screenshotCapture.ts   # Screenshot utilities
    selectionObserver.ts   # Text selection detection
    i18n.ts                # Internationalization
    mcp.ts                 # MCP client manager
    skills.ts              # Agent skills system
    tools.ts               # Browser control tool definitions
    chatImportExport.ts    # Chat data portability
  styles/
    design-tokens.css      # Apple-style design tokens
  background/
    control/               # Chrome DevTools Protocol control
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+S` | Open/close sidepanel |
| `Ctrl+G` | Quick ask |
| `Alt+O` | OCR capture |
| `Ctrl+B` | Toggle browser control |
| `Ctrl+Shift+S` | Area screenshot |
| `Ctrl+Shift+A` | Full page screenshot + ask AI |
| `Ctrl+N` | New chat (in sidepanel) |
| `Ctrl+H` | Toggle history (in sidepanel) |
| `Escape` | Cancel generation / close modal |

All shortcuts are configurable in Settings > Shortcuts.

## License

MIT -- see [LICENSE](LICENSE) for details.

## Recent Changes

See [CHANGELOG.md](CHANGELOG.md) for a full history of changes.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

Please ensure `npm run compile` passes before submitting.

---

## Nexus - AI 浏览器助手 (中文说明)

**Nexus** 是一款 Chrome 扩展（Manifest V3），为浏览器带来原生 AI 体验。支持多模型对话、网页控制、内容提取、截图分析等功能，界面采用 Apple 风格设计。

### 主要功能

- **多模型支持**: OpenAI、Claude、Gemini、DeepSeek、通义千问、智谱等
- **富文本渲染**: Markdown、代码高亮、数学公式、Mermaid/Graphviz 图表
- **多模态输入**: 图片粘贴/拖拽、PDF/DOCX/CSV 文件上传
- **浏览器控制**: 自动化操作网页元素（点击、填表、导航等）
- **内容提取**: 一键提取网页正文、YouTube 视频字幕
- **截图交互**: 全屏截图、区域截图、划词翻译/总结
- **技能与 MCP**: 导入自定义技能，连接外部 MCP 工具服务器
- **数据管理**: 对话导入导出（JSON/Markdown/ZIP）

### 安装开发版

```bash
npm install
npm run dev
```

在 Chrome 中加载 `.output/chrome-mv3` 目录即可。

### 快速配置

1. 打开扩展设置页面
2. 添加 AI 供应商（填入 API Key 和模型信息）
3. 点击启用，即可在侧边栏开始对话

### 支持的语言

- English
- 简体中文
