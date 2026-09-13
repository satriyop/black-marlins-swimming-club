import { test as base } from "@playwright/test";
export { expect } from "@playwright/test";

// UI assertions must not wait for the external font CDN. The app retains its
// production font stack; deterministic browser evidence exercises its fallback.
export const test = base.extend({
  page: async ({ page }, providePage) => {
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
    await providePage(page);
  },
});
