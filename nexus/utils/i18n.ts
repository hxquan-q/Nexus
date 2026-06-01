/**
 * Internationalization (i18n) system for Nexus
 * Supports English and Simplified Chinese
 */

export type Language = 'en' | 'zh-CN';
export type TranslationKey = string;

type TranslationParams = Record<string, string | number>;

const translations: Record<Language, Record<TranslationKey, string>> = {
  en: {
    // ===== SidePanel Header =====
    'header.history': 'Chat history',
    'header.toggleTheme': 'Toggle theme',
    'header.lightTheme': 'Light theme',
    'header.darkTheme': 'Dark theme',
    'header.systemTheme': 'System theme',
    'header.newChat': 'New chat',
    'header.settings': 'Settings',
    'header.selectModel': 'Select model',

    // ===== Model Selector =====
    'model.noModels': 'No models configured. Open Settings to add a provider.',
    'model.noMatchingModels': 'No matching models',
    'providers.noModelsHint': 'Click \'Fetch Models\' or add manually below',
    'model.searchPlaceholder': 'Search models...',
    'model.notConfigured': 'Not configured',

    // ===== Empty State =====
    'empty.title': 'Nexus',
    'empty.subtitle': 'What can I help you with?',
    'empty.noProvider': 'Welcome! Let\'s get started.',
    'empty.configure': 'Configure AI Provider',

    // ===== Chat Messages =====
    'chat.thinking': 'Thinking...',
    'chat.stopped': 'Stopped',
    'chat.copy': 'Copy',
    'chat.copied': 'Copied!',
    'chat.expand': 'Expand',
    'chat.code': 'Code',
    'chat.send': 'Send',
    'chat.stopGenerating': 'Stop generating',
    'chat.editMessage': 'Edit message',
    'chat.cancel': 'Cancel',
    'chat.saveResend': 'Save & Resend',
    'chat.removeQuote': 'Remove quote',

    // ===== Input Area =====
    'input.placeholder': 'Type a message or drop files...',
    'input.placeholderNoProvider': 'Configure a provider in Settings...',
    'input.attachFile': 'Attach file',
    'input.uploadImage': 'Upload image',
    'input.pasteOrDrag': 'Paste or drag images here',
    'input.maxImageCount': 'Maximum {count} images',
    'input.imageTooLarge': 'Image too large (max {size}MB)',
    'input.noVisionSupport': 'Current model does not support vision',
    'input.imageOnly': 'Image only files',
    'input.fileTooLarge': 'File too large (max {size}MB)',
    'input.unsupportedFileType': 'Unsupported file type',
    'input.parsingFile': 'Parsing file...',
    'input.shortcutHint': 'Enter to send, Shift+Enter for new line',

    // ===== Share Page Content =====
    'sharePage.share': 'Share page',
    'sharePage.shared': 'Shared: {title}',
    'sharePage.sharedContent': 'Page content shared',
    'sharePage.clickToShare': 'Click to share current page with AI',

    // ===== Browser Control =====
    'browser.control': 'Browser Control',
    'browser.enable': 'Enable browser control',
    'browser.disable': 'Disable browser control',
    'browser.activeTab': 'Browser control active: {title}',
    'browser.end': 'End',

    // ===== Tool Status =====
    'tool.executing': 'Executing: {tool}',
    'tool.navigating': 'Navigating to {url}',
    'tool.clicking': 'Clicking element',
    'tool.screenshot': 'Taking screenshot...',
    'tool.extracting': 'Extracting page content...',
    'tool.extractingVideo': 'Extracting video transcript...',

    // ===== Confirmation Dialog =====
    'confirm.title': 'Confirm action',
    'confirm.sensitive': 'This action may be sensitive. Continue?',
    'confirm.confirm': 'Confirm',
    'confirm.cancel': 'Cancel',

    // ===== Script Confirmation =====
    'script.title': 'Execute Skill Script?',
    'script.wantsToRun': 'wants to run script',
    'script.viewSource': 'View script source',
    'script.runOnce': 'Run Once',
    'script.trustForever': 'Trust Forever',

    // ===== History Panel =====
    'history.title': 'Chat History',
    'history.search': 'Search chats...',
    'history.delete': 'Delete chat',
    'history.deleteConfirm': 'Delete this chat?',
    'history.export': 'Export',
    'history.exportMd': 'Markdown',
    'history.exportHtml': 'HTML',
    'history.import': 'Import',
    'history.exportCurrent': 'Export current chat',
    'history.exportAll': 'Export all chats',
    'history.loadMore': 'Load more',
    'history.noChats': 'No chat history yet.',
    'history.newChat': 'New Chat',
    'history.loading': 'Loading...',

    // ===== Session =====
    'session.newChat': 'New Chat',
    'session.untitled': 'Untitled Chat',

    // ===== Fullscreen Code =====
    'code.preview': 'Code Preview',
    'code.close': 'Close',
    'code.copyCode': 'Copy code',

    // ===== Selection Quote =====
    'selectionQuote.quote': 'Quote',

    // ===== Errors =====
    'error.noModel': 'No model configured',
    'error.sendFailed': 'Failed to send message',
    'error.generationStopped': 'Generation stopped',
    'error.general': 'Error: {message}',
    'error.auth': 'Authentication Error',
    'error.rateLimit': 'Rate Limited',
    'error.network': 'Network Error',
    'error.modelNotFound': 'Model Not Found',
    'error.contextLength': 'Context Too Long',
    'error.providerError': 'Provider Error',

    // ===== Options: Navigation =====
    'nav.providers': 'Providers',
    'nav.appearance': 'Appearance',
    'nav.aiSettings': 'AI Settings',
    'nav.mcp': 'MCP Servers',
    'nav.skills': 'Skills',
    'nav.shortcuts': 'Shortcuts',
    'nav.presets': 'Quick Actions',
    'nav.data': 'Data',
    'nav.language': 'Language',

    // ===== Options: Common =====
    'options.settings': 'Settings',
    'options.save': 'Save',
    'options.delete': 'Delete',
    'options.edit': 'Edit',
    'options.cancel': 'Cancel',
    'options.add': 'Add',
    'options.close': 'Close',
    'options.active': 'Active',
    'options.activate': 'Activate',
    'options.loading': 'Loading...',

    // ===== Options: Providers =====
    'providers.title': 'AI Providers',
    'providers.add': 'Add Provider',
    'providers.edit': 'Edit Provider',
    'providers.name': 'Name',
    'providers.namePlaceholder': 'e.g., My OpenAI',
    'providers.type': 'Type',
    'providers.baseUrl': 'Base URL',
    'providers.apiKey': 'API Key',
    'providers.models': 'Models',
    'providers.fetchModels': 'Fetch',
    'providers.selectedModel': 'Model ID (e.g., gpt-4o)',
    'providers.vision': 'Toggle vision support',
    'providers.deleteConfirm': 'Delete this provider?',
    'providers.fetchingModels': 'Loading...',
    'providers.fetchSuccess': 'Models fetched successfully',
    'providers.fetchFailed': 'Failed to fetch models',
    'providers.model': 'Model',
    'providers.none': 'None',
    'providers.noProviders': 'No providers configured. Add one to get started.',
    'providers.configured': 'Configured',
    'providers.incomplete': 'Incomplete configuration',

    // ===== Options: Appearance =====
    'appearance.title': 'Appearance',
    'appearance.theme': 'Theme',
    'appearance.light': 'Light',
    'appearance.dark': 'Dark',
    'appearance.system': 'System',
    'appearance.fontScale': 'UI Font Scale',
    'appearance.floatingBall': 'Floating Ball',
    'appearance.floatingBallDesc': 'Show floating trigger ball on pages',
    'appearance.selectionQuote': 'Selection Quote',
    'appearance.selectionQuoteDesc': 'Enable text selection quote in sidepanel',

    // ===== Options: AI Settings =====
    'aiSettings.title': 'AI Settings',
    'aiSettings.systemPrompt': 'System Prompt',
    'aiSettings.systemPromptDesc': 'Custom instructions sent to the AI with every message. Leave empty to use the default prompt.',
    'aiSettings.systemPromptPlaceholder': 'e.g., You are a helpful assistant. Always respond in Chinese.',
    'aiSettings.resetSystemPrompt': 'Reset to Default',
    'aiSettings.pageContentMax': 'Page Content Max Length',
    'aiSettings.pageContentDesc': 'Maximum characters to extract from web pages.',
    'aiSettings.maxToolCalls': 'Max Tool Calls Per Turn',
    'aiSettings.maxToolCallsDesc': 'Maximum number of tool calls the AI can make in a single response.',
    'aiSettings.rawExtractSites': 'Raw Extraction Sites',
    'aiSettings.rawExtractDesc': 'Sites where Readability is bypassed for content extraction.',
    'aiSettings.addSite': 'Add',

    // ===== Options: MCP =====
    'mcp.title': 'MCP Servers',
    'mcp.add': 'Add Server',
    'mcp.edit': 'Edit MCP Server',
    'mcp.noServers': 'No MCP servers configured.',
    'mcp.serverName': 'Name',
    'mcp.serverUrl': 'URL',
    'mcp.auth': 'Authentication',
    'mcp.authNone': 'None',
    'mcp.authBearer': 'Bearer Token',
    'mcp.authBearerToken': 'Bearer Token',
    'mcp.authOAuth': 'OAuth 2.1',
    'mcp.testConnection': 'Test Connection',
    'mcp.testing': 'Testing...',
    'mcp.connected': 'Connected successfully',
    'mcp.connectionFailed': 'Connection failed',
    'mcp.enabled': 'Enabled',
    'mcp.toolsDiscovered': '{count} tools discovered',
    'mcp.url': 'URL',

    // ===== Options: Skills =====
    'skills.title': 'Agent Skills',
    'skills.import': 'Import Skill (.zip)',
    'skills.noSkills': 'No skills installed. Import a skill to get started.',
    'skills.deleteConfirm': 'Delete this skill?',
    'skills.details': 'Details',
    'skills.instructions': 'Instructions',
    'skills.scripts': 'Scripts',
    'skills.references': 'References',
    'skills.scriptCount': '{count} script(s), {refCount} reference(s)',

    // ===== Options: Shortcuts =====
    'shortcuts.title': 'Keyboard Shortcuts',
    'shortcuts.resetDefaults': 'Reset to Defaults',
    'shortcuts.resetConfirm': 'Reset all shortcuts to defaults?',
    'shortcuts.pressKeys': 'Press keys...',

    // ===== Options: Presets =====
    'presets.title': 'Quick Action Presets',
    'presets.add': 'Add Preset',
    'presets.edit': 'Edit Preset',
    'presets.name': 'Name',
    'presets.namePlaceholder': 'e.g., Summarize',
    'presets.content': 'Prompt Content',
    'presets.contentPlaceholder': 'Enter the prompt text...',
    'presets.noPresets': 'No quick action presets configured.',
    'presets.moveUp': 'Up',
    'presets.moveDown': 'Down',

    // ===== Options: Data =====
    'data.title': 'Data Management',
    'data.export': 'Export',
    'data.exportJson': 'Export as JSON',
    'data.exportZip': 'Export as ZIP',
    'data.import': 'Import',
    'data.selectFile': 'Select JSON File',
    'data.clearAll': 'Clear All Data',
    'data.clearAllDesc': 'Permanently delete all chat history. This cannot be undone.',
    'data.clearConfirm1': 'This will permanently delete ALL your chat history. Are you sure?',
    'data.clearConfirm2': 'This action cannot be undone. Really delete everything?',
    'data.cleared': 'All chat data has been cleared.',
    'data.importPreview': 'Import preview',
    'data.sessions': 'sessions',
    'data.messages': 'messages',
    'data.merge': 'Merge',
    'data.replaceAll': 'Replace All',
    'data.importSuccess': 'Successfully imported {count} session(s)',
    'data.importFailed': 'Import failed: {error}',
    'data.exportFailed': 'Export failed: {error}',
    'data.noSessionsExport': 'No sessions to export',
    'data.invalidFile': 'Invalid import file',
    'data.failedRead': 'Failed to read import file',
    'data.replaceConfirm': 'This will DELETE all existing chats and replace with imported data. Are you sure?',
    'data.mergeConfirm': 'This will add imported chats alongside your existing ones. Continue?',

    // ===== Options: Language =====
    'language.title': 'Language',
    'language.english': 'English',
    'language.chinese': 'Chinese (Simplified)',

    // ===== Content Scripts: Selection Toolbar =====
    'selection.ask': 'Ask',
    'selection.summarize': 'Summarize',
    'selection.translate': 'Translate',
    'selection.explain': 'Explain',
    'selection.grammar': 'Grammar',

    // ===== Content Scripts: Selection Action Titles =====
    'selectionAction.ask': 'Ask AI',
    'selectionAction.summarize': 'Summarize',
    'selectionAction.translate': 'Translate',
    'selectionAction.explain': 'Explain',
    'selectionAction.grammar': 'Grammar Check',

    // ===== Content Scripts: Result Popup =====
    'popup.aiResult': 'AI Result',
    'popup.loading': 'Loading...',
    'popup.copy': 'Copy',
    'popup.copied': 'Copied!',
    'popup.continueInPanel': 'Continue in panel',
    'popup.error': 'Error',

    // ===== Content Scripts: Screenshot Overlay =====
    'overlay.dragSelect': 'Drag to select area / Press Esc to cancel',
    'overlay.dragSelectShort': 'Drag to select area',
    'overlay.pressEsc': 'Press Esc to cancel',

    // ===== Content Scripts: Floating Ball =====
    'floatingBall.openNexus': 'Open Nexus',

    // ===== Quick Actions =====
    'quickActions.summarizePage': 'Summarize this page',
    'quickActions.translate': 'Translate text',
    'quickActions.helpWrite': 'Help me write',
    'quickActions.analyzeImage': 'Analyze image',
    'quickActions.explainCode': 'Explain code',
    'quickActions.askAnything': 'Ask anything',

    // ===== Context Action Cards =====
    'context.summarizePage': 'Summarize Page',
    'context.summarizePageDesc': 'Get a quick summary of the current webpage',
    'context.analyzeImage': 'Analyze Image',
    'context.analyzeImageDesc': 'Upload or paste an image for AI vision',
    'context.helpWrite': 'Help Me Write',
    'context.helpWriteDesc': 'Draft emails, documents, posts with AI',
    'context.askAnything': 'Ask Anything',
    'context.askAnythingDesc': 'Ask any question to get help',

    // ===== Drag & Drop =====
    'dropzone.title': 'Drop file here',

    // ===== Appearance: Sound =====
    'appearance.soundEffects': 'Sound Effects',
    'appearance.soundEffectsDesc': 'Play subtle sounds on send and receive',

    // ===== Context Warning =====
    'context.nearLimit': 'Context near limit. Older messages may be trimmed.',

    // ===== Error Buttons =====
    'error.retry': 'Retry',
    'error.copyError': 'Copy error',

    // ===== Action Titles =====
    'action.regenerate': 'Regenerate',
    'action.delete': 'Delete',
    'action.goodResponse': 'Good response',
    'action.poorResponse': 'Poor response',
    'action.scrollToBottom': 'Scroll to bottom',

    // ===== Interrupted =====
    'chat.generationInterrupted': 'Generation interrupted.',

    // ===== Empty State Hint =====
    'empty.hint': 'OpenAI, Claude, Gemini, DeepSeek & more',

    // ===== Onboarding =====
    'onboarding.welcome': 'Welcome to Nexus',
    'onboarding.subtitle': 'Your AI browser assistant',
    'onboarding.step1': 'Step 1: Add an AI Provider',
    'onboarding.providerType': 'Provider',
    'onboarding.apiKey': 'API Key',
    'onboarding.baseUrl': 'Base URL',
    'onboarding.getStarted': 'Get Started',
    'onboarding.fetchingModels': 'Connecting...',
    'onboarding.success': 'Connected successfully!',
    'onboarding.error': 'Connection failed. Please check your settings.',
    'onboarding.orSettings': 'Or open Settings for more configuration options',
    'onboarding.openSettings': 'Open Settings',

    // ===== Network =====
    'network.offline': 'You are offline. Check your internet connection.',

    // ===== Header Menu =====
    'menu.shareChat': 'Copy as Markdown',
    'menu.exportChat': 'Export Chat',
    'menu.searchChat': 'Find in Chat',
    'menu.popOut': 'Pop Out Window',
    'menu.clearChat': 'Clear Conversation',

    // ===== Search =====
    'search.placeholder': 'Search in conversation...',
    'search.noResults': 'No results',

    // ===== Share =====
    'share.copied': 'Chat copied to clipboard',
    'share.copiedFailed': 'Failed to copy chat',

    // ===== Context Trimming =====
    'context.trimmed': 'Context trimmed - older messages removed',

    // ===== Pop Out =====
    'popOut.title': 'Nexus Chat',

    // ===== Keyboard Shortcuts Modal =====
    'shortcutsModal.title': 'Keyboard Shortcuts',
    'shortcutsModal.newChat': 'New chat',
    'shortcutsModal.toggleHistory': 'Toggle history',
    'shortcutsModal.openSettings': 'Open settings',
    'shortcutsModal.copyLastResponse': 'Copy last response',
    'shortcutsModal.searchChat': 'Search in conversation',
    'shortcutsModal.escape': 'Close / Cancel',
    'shortcutsModal.sendMessage': 'Send message',
    'shortcutsModal.newLine': 'New line',
    'shortcutsModal.openSidepanel': 'Open sidepanel (global)',

    // ===== Time Greeting =====
    'greeting.morning': 'Good morning! How can I help?',
    'greeting.afternoon': 'Good afternoon! What\'s on your mind?',
    'greeting.evening': 'Good evening! Need any help?',
    'greeting.night': 'Burning the midnight oil? I\'m here to help!',

    // ===== Version =====
    'version.display': 'Nexus v{version}',
  },

  'zh-CN': {
    // ===== SidePanel Header =====
    'header.history': '聊天记录',
    'header.toggleTheme': '切换主题',
    'header.lightTheme': '浅色主题',
    'header.darkTheme': '深色主题',
    'header.systemTheme': '跟随系统',
    'header.newChat': '新对话',
    'header.settings': '设置',
    'header.selectModel': '选择模型',

    // ===== Model Selector =====
    'model.noModels': '未配置模型，请在设置中添加供应商。',
    'model.noMatchingModels': '没有匹配的模型',
    'providers.noModelsHint': '点击「获取模型」或在下方手动添加',
    'model.searchPlaceholder': '搜索模型...',
    'model.notConfigured': '未配置',

    // ===== Empty State =====
    'empty.title': 'Nexus',
    'empty.subtitle': '有什么可以帮你的？',
    'empty.noProvider': '欢迎！让我们开始吧。',
    'empty.configure': '配置 AI 供应商',

    // ===== Chat Messages =====
    'chat.thinking': '思考中...',
    'chat.stopped': '已停止',
    'chat.copy': '复制',
    'chat.copied': '已复制！',
    'chat.expand': '展开',
    'chat.code': '代码',
    'chat.send': '发送',
    'chat.stopGenerating': '停止生成',
    'chat.editMessage': '编辑消息',
    'chat.cancel': '取消',
    'chat.saveResend': '保存并重新发送',
    'chat.removeQuote': '移除引用',

    // ===== Input Area =====
    'input.placeholder': '输入消息或拖拽文件...',
    'input.placeholderNoProvider': '请在设置中配置供应商...',
    'input.attachFile': '上传文件',
    'input.uploadImage': '上传图片',
    'input.pasteOrDrag': '粘贴或拖拽图片',
    'input.maxImageCount': '最多 {count} 张图片',
    'input.imageTooLarge': '图片过大（最大 {size}MB）',
    'input.noVisionSupport': '当前模型不支持图片',
    'input.imageOnly': '仅支持图片文件',
    'input.fileTooLarge': '文件过大（最大 {size}MB）',
    'input.unsupportedFileType': '不支持的文件类型',
    'input.parsingFile': '解析文件中...',
    'input.shortcutHint': '回车发送，Shift+回车换行',

    // ===== Share Page Content =====
    'sharePage.share': '共享页面',
    'sharePage.shared': '已共享: {title}',
    'sharePage.sharedContent': '已共享页面内容',
    'sharePage.clickToShare': '点击共享当前页面给 AI',

    // ===== Browser Control =====
    'browser.control': '浏览器控制',
    'browser.enable': '启用浏览器控制',
    'browser.disable': '关闭浏览器控制',
    'browser.activeTab': '当前标签: {title}',
    'browser.end': '结束',

    // ===== Tool Status =====
    'tool.executing': '执行中: {tool}',
    'tool.navigating': '正在导航到 {url}',
    'tool.clicking': '点击元素',
    'tool.screenshot': '正在截图...',
    'tool.extracting': '提取页面内容...',
    'tool.extractingVideo': '提取视频字幕...',

    // ===== Confirmation Dialog =====
    'confirm.title': '确认操作',
    'confirm.sensitive': '此操作可能涉及敏感内容，是否继续？',
    'confirm.confirm': '确认',
    'confirm.cancel': '取消',

    // ===== Script Confirmation =====
    'script.title': '执行技能脚本？',
    'script.wantsToRun': '想要运行脚本',
    'script.viewSource': '查看脚本源码',
    'script.runOnce': '仅运行一次',
    'script.trustForever': '永久信任',

    // ===== History Panel =====
    'history.title': '聊天记录',
    'history.search': '搜索对话...',
    'history.delete': '删除对话',
    'history.deleteConfirm': '确认删除此对话？',
    'history.export': '导出',
    'history.exportMd': 'Markdown',
    'history.exportHtml': 'HTML',
    'history.import': '导入',
    'history.exportCurrent': '导出当前对话',
    'history.exportAll': '导出全部对话',
    'history.loadMore': '加载更多',
    'history.noChats': '暂无对话记录。',
    'history.newChat': '新对话',
    'history.loading': '加载中...',

    // ===== Session =====
    'session.newChat': '新对话',
    'session.untitled': '未命名对话',

    // ===== Fullscreen Code =====
    'code.preview': '代码预览',
    'code.close': '关闭',
    'code.copyCode': '复制代码',

    // ===== Selection Quote =====
    'selectionQuote.quote': '引用',

    // ===== Errors =====
    'error.noModel': '未配置模型',
    'error.sendFailed': '发送失败',
    'error.generationStopped': '已停止生成',
    'error.general': '错误: {message}',
    'error.auth': '认证错误',
    'error.rateLimit': '请求过于频繁',
    'error.network': '网络错误',
    'error.modelNotFound': '模型未找到',
    'error.contextLength': '上下文过长',
    'error.providerError': '供应商错误',

    // ===== Options: Navigation =====
    'nav.providers': '供应商',
    'nav.appearance': '外观',
    'nav.aiSettings': 'AI 设置',
    'nav.mcp': 'MCP 服务器',
    'nav.skills': '技能',
    'nav.shortcuts': '快捷键',
    'nav.presets': '快捷操作',
    'nav.data': '数据管理',
    'nav.language': '语言',

    // ===== Options: Common =====
    'options.settings': '设置',
    'options.save': '保存',
    'options.delete': '删除',
    'options.edit': '编辑',
    'options.cancel': '取消',
    'options.add': '添加',
    'options.close': '关闭',
    'options.active': '活跃',
    'options.activate': '启用',
    'options.loading': '加载中...',

    // ===== Options: Providers =====
    'providers.title': 'AI 供应商',
    'providers.add': '添加供应商',
    'providers.edit': '编辑供应商',
    'providers.name': '名称',
    'providers.namePlaceholder': '例如：我的 OpenAI',
    'providers.type': '类型',
    'providers.baseUrl': '接口地址',
    'providers.apiKey': 'API 密钥',
    'providers.models': '模型',
    'providers.fetchModels': '获取模型',
    'providers.selectedModel': '模型 ID（如 gpt-4o）',
    'providers.vision': '切换图片识别支持',
    'providers.deleteConfirm': '删除此供应商？',
    'providers.fetchingModels': '获取中...',
    'providers.fetchSuccess': '模型获取成功',
    'providers.fetchFailed': '获取模型失败',
    'providers.model': '模型',
    'providers.none': '无',
    'providers.noProviders': '未配置供应商，请添加以开始使用。',
    'providers.configured': '已配置',
    'providers.incomplete': '配置不完整',

    // ===== Options: Appearance =====
    'appearance.title': '外观',
    'appearance.theme': '主题',
    'appearance.light': '浅色',
    'appearance.dark': '深色',
    'appearance.system': '跟随系统',
    'appearance.fontScale': '字体缩放',
    'appearance.floatingBall': '浮动球',
    'appearance.floatingBallDesc': '在页面上显示浮动触发球',
    'appearance.selectionQuote': '划词引用',
    'appearance.selectionQuoteDesc': '在侧边栏中启用文本选择引用',

    // ===== Options: AI Settings =====
    'aiSettings.title': 'AI 设置',
    'aiSettings.systemPrompt': '系统提示词',
    'aiSettings.systemPromptDesc': '每次发送消息时附加的自定义指令。留空则使用默认提示词。',
    'aiSettings.systemPromptPlaceholder': '例如：你是一个有用的助手。请始终用中文回答。',
    'aiSettings.resetSystemPrompt': '恢复默认',
    'aiSettings.pageContentMax': '页面内容最大长度',
    'aiSettings.pageContentDesc': '从网页中提取的最大字符数。',
    'aiSettings.maxToolCalls': '每轮最大工具调用次数',
    'aiSettings.maxToolCallsDesc': 'AI 在单次回复中可执行的最大工具调用次数。',
    'aiSettings.rawExtractSites': '原始提取站点',
    'aiSettings.rawExtractDesc': '在这些站点上绕过 Readability 进行内容提取。',
    'aiSettings.addSite': '添加',

    // ===== Options: MCP =====
    'mcp.title': 'MCP 服务器',
    'mcp.add': '添加服务器',
    'mcp.edit': '编辑 MCP 服务器',
    'mcp.noServers': '未配置 MCP 服务器。',
    'mcp.serverName': '名称',
    'mcp.serverUrl': '地址',
    'mcp.auth': '认证方式',
    'mcp.authNone': '无',
    'mcp.authBearer': 'Bearer Token',
    'mcp.authBearerToken': 'Bearer Token',
    'mcp.authOAuth': 'OAuth 2.1',
    'mcp.testConnection': '测试连接',
    'mcp.testing': '测试中...',
    'mcp.connected': '连接成功',
    'mcp.connectionFailed': '连接失败',
    'mcp.enabled': '已启用',
    'mcp.toolsDiscovered': '已发现 {count} 个工具',
    'mcp.url': 'URL',

    // ===== Options: Skills =====
    'skills.title': 'AI 技能',
    'skills.import': '导入技能 (.zip)',
    'skills.noSkills': '暂无已安装技能，导入一个技能以开始。',
    'skills.deleteConfirm': '删除此技能？',
    'skills.details': '详情',
    'skills.instructions': '指令',
    'skills.scripts': '脚本',
    'skills.references': '引用文件',
    'skills.scriptCount': '{count} 个脚本, {refCount} 个引用文件',

    // ===== Options: Shortcuts =====
    'shortcuts.title': '键盘快捷键',
    'shortcuts.resetDefaults': '恢复默认',
    'shortcuts.resetConfirm': '确认恢复所有快捷键为默认设置？',
    'shortcuts.pressKeys': '按下快捷键...',

    // ===== Options: Presets =====
    'presets.title': '快捷操作预设',
    'presets.add': '添加预设',
    'presets.edit': '编辑预设',
    'presets.name': '名称',
    'presets.namePlaceholder': '例如：总结',
    'presets.content': '预设内容',
    'presets.contentPlaceholder': '输入提示词内容...',
    'presets.noPresets': '暂无快捷操作预设。',
    'presets.moveUp': '上移',
    'presets.moveDown': '下移',

    // ===== Options: Data =====
    'data.title': '数据管理',
    'data.export': '导出',
    'data.exportJson': '导出全部 (JSON)',
    'data.exportZip': '导出全部 (ZIP)',
    'data.import': '导入',
    'data.selectFile': '选择 JSON 文件',
    'data.clearAll': '清除所有数据',
    'data.clearAllDesc': '永久删除所有聊天记录，此操作不可撤销。',
    'data.clearConfirm1': '将永久删除所有聊天记录，确认继续？',
    'data.clearConfirm2': '此操作不可撤销，确认删除所有数据？',
    'data.cleared': '所有聊天数据已清除。',
    'data.importPreview': '导入预览',
    'data.sessions': '个对话',
    'data.messages': '条消息',
    'data.merge': '合并',
    'data.replaceAll': '替换全部',
    'data.importSuccess': '成功导入 {count} 个对话',
    'data.importFailed': '导入失败: {error}',
    'data.exportFailed': '导出失败: {error}',
    'data.noSessionsExport': '没有可导出的对话',
    'data.invalidFile': '导入文件无效',
    'data.failedRead': '读取导入文件失败',
    'data.replaceConfirm': '将删除所有现有对话并替换为导入数据，确认继续？',
    'data.mergeConfirm': '将把导入的对话添加到现有对话中，确认继续？',

    // ===== Options: Language =====
    'language.title': '语言',
    'language.english': 'English',
    'language.chinese': '简体中文',

    // ===== Content Scripts: Selection Toolbar =====
    'selection.ask': '询问',
    'selection.summarize': '总结',
    'selection.translate': '翻译',
    'selection.explain': '解释',
    'selection.grammar': '语法',

    // ===== Content Scripts: Selection Action Titles =====
    'selectionAction.ask': '询问 AI',
    'selectionAction.summarize': '总结',
    'selectionAction.translate': '翻译',
    'selectionAction.explain': '解释',
    'selectionAction.grammar': '语法检查',

    // ===== Content Scripts: Result Popup =====
    'popup.aiResult': 'AI 结果',
    'popup.loading': '加载中...',
    'popup.copy': '复制',
    'popup.copied': '已复制！',
    'popup.continueInPanel': '在面板中继续',
    'popup.error': '错误',

    // ===== Content Scripts: Screenshot Overlay =====
    'overlay.dragSelect': '拖拽选择区域 / 按 Esc 取消',
    'overlay.dragSelectShort': '拖拽选择区域',
    'overlay.pressEsc': '按 Esc 取消',

    // ===== Content Scripts: Floating Ball =====
    'floatingBall.openNexus': '打开 Nexus',

    // ===== Quick Actions =====
    'quickActions.summarizePage': '总结当前页面',
    'quickActions.translate': '翻译文本',
    'quickActions.helpWrite': '帮我写',
    'quickActions.analyzeImage': '分析图片',
    'quickActions.explainCode': '解释代码',
    'quickActions.askAnything': '随便问问',

    // ===== Context Action Cards =====
    'context.summarizePage': '总结页面',
    'context.summarizePageDesc': '快速总结当前网页内容',
    'context.analyzeImage': '分析图片',
    'context.analyzeImageDesc': '上传或粘贴图片让 AI 分析',
    'context.helpWrite': '帮我写',
    'context.helpWriteDesc': '用 AI 起草邮件、文档、帖子',
    'context.askAnything': '随便问',
    'context.askAnythingDesc': '问任何问题获取帮助',

    // ===== Drag & Drop =====
    'dropzone.title': '拖放文件到这里',

    // ===== Appearance: Sound =====
    'appearance.soundEffects': '音效',
    'appearance.soundEffectsDesc': '发送和接收时播放提示音',

    // ===== Context Warning =====
    'context.nearLimit': '上下文接近上限，较早的消息可能会被裁剪。',

    // ===== Error Buttons =====
    'error.retry': '重试',
    'error.copyError': '复制错误',

    // ===== Action Titles =====
    'action.regenerate': '重新生成',
    'action.delete': '删除',
    'action.goodResponse': '好的回复',
    'action.poorResponse': '差的回复',
    'action.scrollToBottom': '滚动到底部',

    // ===== Interrupted =====
    'chat.generationInterrupted': '生成已中断。',

    // ===== Empty State Hint =====
    'empty.hint': 'OpenAI, Claude, Gemini, DeepSeek 等更多',

    // ===== Onboarding =====
    'onboarding.welcome': '欢迎使用 Nexus',
    'onboarding.subtitle': '您的 AI 浏览器助手',
    'onboarding.step1': '第 1 步：添加 AI 供应商',
    'onboarding.providerType': '供应商',
    'onboarding.apiKey': 'API 密钥',
    'onboarding.baseUrl': '基础 URL',
    'onboarding.getStarted': '开始使用',
    'onboarding.fetchingModels': '连接中...',
    'onboarding.success': '连接成功！',
    'onboarding.error': '连接失败，请检查设置。',
    'onboarding.orSettings': '或打开设置页面进行更多配置',
    'onboarding.openSettings': '打开设置',

    // ===== Network =====
    'network.offline': '当前处于离线状态，请检查网络连接。',

    // ===== Header Menu =====
    'menu.shareChat': '复制为 Markdown',
    'menu.exportChat': '导出对话',
    'menu.searchChat': '在对话中查找',
    'menu.popOut': '弹出窗口',
    'menu.clearChat': '清除对话',

    // ===== Search =====
    'search.placeholder': '在对话中搜索...',
    'search.noResults': '无结果',

    // ===== Share =====
    'share.copied': '对话已复制到剪贴板',
    'share.copiedFailed': '复制失败',

    // ===== Context Trimming =====
    'context.trimmed': '上下文已裁剪 - 较早的消息已移除',

    // ===== Pop Out =====
    'popOut.title': 'Nexus 对话',

    // ===== Keyboard Shortcuts Modal =====
    'shortcutsModal.title': '键盘快捷键',
    'shortcutsModal.newChat': '新对话',
    'shortcutsModal.toggleHistory': '切换历史记录',
    'shortcutsModal.openSettings': '打开设置',
    'shortcutsModal.copyLastResponse': '复制最后一条回复',
    'shortcutsModal.searchChat': '在对话中搜索',
    'shortcutsModal.escape': '关闭 / 取消',
    'shortcutsModal.sendMessage': '发送消息',
    'shortcutsModal.newLine': '换行',
    'shortcutsModal.openSidepanel': '打开侧边栏（全局）',

    // ===== Time Greeting =====
    'greeting.morning': '早上好！有什么可以帮你的？',
    'greeting.afternoon': '下午好！在想什么？',
    'greeting.evening': '晚上好！需要帮助吗？',
    'greeting.night': '夜深了，我还在！有什么需要？',

    // ===== Version =====
    'version.display': 'Nexus v{version}',
  },
};

/**
 * Translate a key with optional parameter interpolation.
 * Replaces {paramName} tokens with values from params.
 *
 * @example
 * t('en', 'input.maxImageCount', { count: 4 }) // "Maximum 4 images"
 * t('zh-CN', 'input.maxImageCount', { count: 4 }) // "最多 4 张图片"
 */
export function t(lang: Language, key: TranslationKey, params?: TranslationParams): string {
  const dict = translations[lang] || translations['en'];
  let text = dict[key];

  if (text === undefined) {
    // Fallback to English if key not found in current language
    text = translations['en'][key];
  }

  if (text === undefined) {
    return key;
  }

  if (params) {
    for (const [paramKey, paramValue] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue));
    }
  }

  return text;
}

/**
 * Detect language from browser settings.
 * Returns 'zh-CN' if navigator.language starts with 'zh', otherwise 'en'.
 */
export function detectLanguage(): Language {
  const browserLang = navigator.language || 'en';
  return browserLang.startsWith('zh') ? 'zh-CN' : 'en';
}

/**
 * Get a minimal t() function bound to a specific language.
 * Useful for content scripts that can't use reactive Vue refs.
 */
export function createT(lang: Language): (key: TranslationKey, params?: TranslationParams) => string {
  return (key, params) => t(lang, key, params);
}
