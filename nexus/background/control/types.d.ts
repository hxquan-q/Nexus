/**
 * Type declarations for Chrome extension APIs used in background scripts.
 * These are available when running inside the chrome extension background context.
 */

// Declare the chrome global for background/control files
// WXT provides these through the @wxt-dev/module-vue and chrome-types
declare const chrome: typeof globalThis.chrome;
