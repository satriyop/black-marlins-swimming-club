// Production-built component fixture: no route or test identity is added to the app.
import { build, preview } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
const outDir = await mkdtemp(resolve(tmpdir(), "bmsc-visual-"));
const config = {
  configFile: false,
  root: process.cwd(),
  plugins: [react(), tailwind()],
  resolve: { alias: { "@": resolve("src") } },
  build: {
    outDir,
    emptyOutDir: true,
    rollupOptions: { input: resolve("tests/fixtures/visual.html") },
  },
};
await build(config);
const server = await preview({
  ...config,
  preview: { host: "127.0.0.1", port: 3012, strictPort: true },
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    server.httpServer.close();
    await rm(outDir, { recursive: true, force: true });
    process.exit(0);
  });
