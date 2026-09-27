import { createFileRoute } from "@tanstack/react-router";
import { allowRequestHost, auth } from "@/lib/auth/server";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        await allowRequestHost(request);
        return auth.handler(request);
      },
      POST: async ({ request }) => {
        await allowRequestHost(request);
        return auth.handler(request);
      },
    },
  },
});
