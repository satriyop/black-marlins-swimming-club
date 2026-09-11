/** Optional Grok PWA chrome — no-op stub so Vite starts without platform files. */
export const GROK_OG_IDENTITY_ID = "virtual:grok-og-identity";
export function grokPwaPlugin() {
  return {
    name: "app-builder:grok-pwa",
    resolveId(id) {
      if (id === GROK_OG_IDENTITY_ID) return `\0${GROK_OG_IDENTITY_ID}`;
    },
    load(id) {
      if (id !== `\0${GROK_OG_IDENTITY_ID}`) return;
      return "export const grokOgIdentity = { title: 'Black Marlins Swimming Club', description: '' };";
    },
  };
}
