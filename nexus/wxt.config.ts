import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: '__MSG_appName__',
    description: '__MSG_appDescription__',
    version: '0.3.1',
    minimum_chrome_version: '120',
    default_locale: 'en',
    permissions: [
      'storage',
      'activeTab',
      'scripting',
      'sidePanel',
      'tabs',
      'tabGroups',
      'debugger',
      'contextMenus',
    ],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: 'Nexus',
      default_icon: {
        16: '/icon/16.png',
        32: '/icon/32.png',
        48: '/icon/48.png',
        128: '/icon/128.png',
      },
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    sandbox: {
      pages: ['sandbox/index.html'],
    },
    web_accessible_resources: [
      {
        resources: ['sandbox.html'],
        matches: ['<all_urls>'],
      },
    ],
    commands: {
      '_execute_action': {
        suggested_key: {
          default: 'Alt+S',
        },
        description: 'Open Nexus sidepanel',
      },
    },
  },
});
