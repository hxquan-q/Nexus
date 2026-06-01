# Privacy Policy for Tactus

**Last updated: March 18, 2026**

## Overview

Tactus is a browser extension that provides AI chat, page understanding, user-imported skills, and user-configured MCP (Model Context Protocol) connections.

Tactus processes certain user data locally in the browser and, when you choose to use external services, sends data directly from your browser to the third-party services that you configure. The developer does not operate a backend service for Tactus and does not receive a copy of your chats, page content, API keys, MCP credentials, or OAuth tokens through any developer-controlled server.

## Data Tactus Handles

Tactus may collect, access, process, store, or transmit the following categories of data:

| Data category | Examples | Why Tactus handles it | Shared with |
| --- | --- | --- | --- |
| User-provided content | Chat prompts, follow-up messages, selected quotes, pasted or uploaded images, preset actions | To generate AI responses and support chat features | The AI provider you configure; MCP servers you configure if tool calls require it |
| Website content and browsing-related data | Current tab title, domain, URL, selected text, extracted page content, content from the active webpage that you ask Tactus to analyze | To provide page understanding, quoting, current-tab context, and skill execution on the page | The AI provider you configure when you choose to send that context; MCP servers you configure if tool calls require it; websites that user-run page scripts interact with |
| Authentication information | AI provider API keys, MCP Bearer tokens, MCP OAuth access tokens, refresh tokens, client metadata, PKCE code verifier | To authenticate requests to third-party AI providers and MCP servers that you choose to connect | The relevant AI provider, MCP server, and OAuth/authorization service used for that connection |
| Conversation records | Chat history, AI responses, reasoning text returned by providers, tool call records, tool outputs, message timestamps | To display, resume, edit, debug, export, and manage conversations locally on your device | The AI provider you configure for active requests; MCP servers you configure when tools are called |
| Imported skills and local automation data | Imported skill folders, skill files, JavaScript skill scripts, trust decisions for scripts | To let you import, read, and run user-selected skills | Not shared with the developer; may interact with the current website or third-party services when you execute a skill |
| MCP configuration data | MCP server names, URLs, descriptions, enabled state, auth type, auth tokens | To connect to external MCP servers you configure | The MCP servers and related OAuth services you configure |
| Local settings and identifiers | Theme, language, floating ball setting, selection quote setting, raw extraction site list, page content limits, tool call limits, active provider selection, temporary pending quote, generated IDs | To operate and personalize the extension | Not shared with the developer; only shared externally when necessary to provide a feature you choose to use |
| Exported backup data | Export files containing providers, conversations, skills, MCP settings, and related local data | To let you export and import your extension data | Saved locally by you; not sent to the developer |

## How Tactus Collects Data

Tactus collects or accesses data in the following ways:

1. Data you enter directly in the extension, such as prompts, API keys, provider settings, MCP settings, and imported files.
2. Data from the active webpage only when you explicitly use features such as sharing page content, quoting selected text, or running a skill/script against the current page.
3. Data from your clipboard only when you paste images or copy content using the extension's UI.
4. Data returned by the AI providers and MCP servers that you configure.
5. Data generated during OAuth flows when you choose to authorize an MCP connection.

## How Tactus Uses Data

Tactus uses handled data to:

1. Send your prompts, images, and optional page context to the AI provider you selected.
2. Display AI responses, maintain local conversation history, and support message editing and export/import.
3. Extract page content, attach selected text, and provide current-tab context when you choose those features.
4. Connect to MCP servers you configure, discover tools, authenticate requests, and execute tool calls.
5. Import, store, read, and execute user-selected skill files and scripts after your action and, where applicable, your trust confirmation.
6. Save your settings and preferences locally on your device.

Tactus does not sell user data. Tactus does not send analytics, advertising identifiers, or crash-reporting data to the developer.

## Permissions and Related Data Access

Tactus requests the following browser permissions and uses them as follows:

| Permission | Purpose |
| --- | --- |
| `storage` / `unlimitedStorage` | Store your local settings, provider configuration, MCP configuration, chat history, imported skills, trust decisions, and related extension data on your device |
| `activeTab` / `scripting` | Access and process the current page only when you use features such as page extraction, selected-text quoting, or skill execution on the active tab |
| `identity` | Complete OAuth authorization flows for MCP servers that you choose to connect |
| `sidePanel` | Display the extension user interface in the browser side panel |
| Host permissions (`<all_urls>`) | Allow page extraction and user-triggered skill execution on websites that you choose to use with Tactus |

## Who User Data Is Shared With

Tactus may share user data only with the following parties, depending on the features you choose to use:

1. **AI providers that you configure**
   Examples include OpenAI-compatible providers, Anthropic, and Google Gemini.
   Data shared may include prompts, conversation context, selected quotes, uploaded or pasted images, extracted page content, model selection, and authentication credentials needed for the request.

2. **MCP servers that you configure**
   Data shared may include MCP connection details, tool invocation payloads, prompts or page context needed for a tool call, and authentication credentials needed for the connection.

3. **OAuth or authorization services related to MCP servers that you configure**
   Data shared may include OAuth authorization request data, redirect information, client metadata, authorization codes, access tokens, and refresh tokens needed to complete and maintain the connection.

4. **Websites that you choose to interact with through Tactus**
   When you run an imported skill script in the current page, the script may interact with the page or make requests from the page context. In those cases, the website may receive requests initiated from your browser. Depending on browser behavior and the website context, same-origin requests may automatically include the website session state managed by your browser.

5. **No developer-controlled servers**
   Tactus does not transmit your data to the developer or any developer-controlled backend service.

## Local Storage and Retention

Tactus stores data locally on your device using browser-managed storage, including local extension storage and IndexedDB.

This local data can include:

- provider configuration
- API keys
- MCP configuration
- OAuth data for MCP connections
- chat history
- imported skills and skill files
- trust decisions
- extension settings

Tactus keeps local data until you delete it from the extension, overwrite it by importing new data, clear your browser extension storage, or uninstall the extension. Temporary values, such as a pending selected quote, may be removed automatically after use.

If you export your data, the exported file is stored wherever you choose to save it. Third-party AI providers, MCP servers, and OAuth services may retain data according to their own terms and privacy policies.

## Your Choices and Controls

You control whether to:

- configure an AI provider
- send prompts, images, or page content to an AI provider
- configure and enable an MCP server
- authorize an MCP server with OAuth
- import a skill
- trust and run a skill script
- export or import your local data

You can also delete local conversations, providers, MCP settings, and imported skills from the extension, or uninstall the extension to remove its local storage from your browser profile.

## Security

Tactus is designed so that requests to third-party services are made directly from your browser rather than relayed through a developer-controlled server. You are responsible for the third-party services and endpoints that you choose to configure and use with Tactus.

Because Tactus can send data to third-party AI providers, MCP servers, OAuth services, and websites at your direction, you should review the privacy and security practices of those third parties before using them with sensitive data.

## Changes to This Policy

This Privacy Policy may be updated from time to time. Any updates will be published in this document with a revised "Last updated" date.

## Contact

If you have questions about this Privacy Policy, please open an issue at:

https://github.com/Castor6/tactus/issues
