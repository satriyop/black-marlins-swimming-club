import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { clubManifest } from "@/lib/pwa/manifest";
import { loadClubChrome } from "@/lib/server/fns-chrome";

export const Route = createFileRoute("/manifest.webmanifest")({
  server: {
    handlers: {
      GET: async () => {
        const chrome = await loadClubChrome(await getSql());
        const body = clubManifest(
          chrome
            ? { name: chrome.name, shortName: chrome.shortName, slug: chrome.slug }
            : null,
        );
        return new Response(JSON.stringify(body), {
          headers: {
            "content-type": "application/manifest+json; charset=utf-8",
            "cache-control": "private, max-age=300",
          },
        });
      },
    },
  },
});
