import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/lib/auth/provider";
import { AppToaster } from "@/components/ui/app-toaster";
import { useState, type ReactNode } from "react";
import appCss from "../styles.css?url";

import { APPEARANCE_SCRIPT } from "@/lib/appearance";
import { InstallPromptProvider } from "@/components/pwa/install-app";
import { PwaUpdateManager } from "@/components/pwa/update-manager";
import { getClubChrome } from "@/lib/server/fns";

function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 8_000, retry: 1 } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <PwaUpdateManager />
      {children}
    </QueryClientProvider>
  );
}

export const Route = createRootRoute({
  loader: () => getClubChrome(),
  head: ({ loaderData }) => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: loaderData?.title ?? "Klub tidak ditemukan" },
      { name: "theme-color", content: "#061018" },
      {
        name: "description",
        content: loaderData
          ? `${loaderData.title} — perenang, latihan, prestasi, dan event.`
          : "Klub tidak ditemukan.",
      },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/icons/apple-touch-icon.png" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  component: () => (
    <html lang="id" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_SCRIPT }} />
      </head>
      <body>
        <AuthProvider>
          <InstallPromptProvider>
            <Providers>
              <Outlet />
              <AppToaster />
            </Providers>
          </InstallPromptProvider>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
