import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { detectInstallPlatform, isStandaloneDisplay } from "../src/lib/pwa/install";
import { clubManifest } from "../src/lib/pwa/manifest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("PWA identity", () => {
  test("manifest launches at the stable authenticated home boundary", () => {
    const manifest = clubManifest({
      name: "Black Marlins Swimming Club Klaten",
      shortName: "BMSC",
      slug: "bmsc",
    });
    expect(manifest).toMatchObject({
      id: "/",
      start_url: "/",
      scope: "/",
      name: "Black Marlins Swimming Club",
      short_name: "Black Marlins",
      lang: "id",
      display: "standalone",
    });
    expect(JSON.stringify(manifest)).not.toContain("token");
    expect(JSON.stringify(manifest)).not.toContain("undangan");
  });

  test("declared PNG assets have their exact dimensions and root links", () => {
    const dimensions = new Map([
      ["icons/icon-192.png", [192, 192]],
      ["icons/icon-512.png", [512, 512]],
      ["icons/icon-maskable-512.png", [512, 512]],
      ["icons/apple-touch-icon.png", [180, 180]],
    ]);
    for (const [path, expected] of dimensions) {
      const png = readFileSync(join(root, "public", path));
      expect(png.subarray(1, 4).toString()).toBe("PNG");
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual(expected);
    }
    const rootRoute = readFileSync(join(root, "src/routes/__root.tsx"), "utf8");
    expect(rootRoute).toContain('rel: "manifest", href: "/manifest.webmanifest"');
    expect(rootRoute).toContain('rel: "apple-touch-icon"');
  });

  test("detects iPhone and touch-based iPad without classifying desktop Mac", () => {
    expect(
      detectInstallPlatform({
        userAgent: "Mozilla/5.0 (iPhone)",
        platform: "iPhone",
        maxTouchPoints: 5,
      }),
    ).toBe("ios");
    expect(
      detectInstallPlatform({
        userAgent: "Mozilla/5.0 (Macintosh)",
        platform: "MacIntel",
        maxTouchPoints: 5,
      }),
    ).toBe("ios");
    expect(
      detectInstallPlatform({
        userAgent: "Mozilla/5.0 (Macintosh)",
        platform: "MacIntel",
        maxTouchPoints: 0,
      }),
    ).toBe("other");
  });

  test("recognises browser and iOS standalone modes", () => {
    expect(isStandaloneDisplay({ displayModeStandalone: true })).toBe(true);
    expect(isStandaloneDisplay({ displayModeStandalone: false, navigatorStandalone: true })).toBe(
      true,
    );
    expect(isStandaloneDisplay({ displayModeStandalone: false, navigatorStandalone: false })).toBe(
      false,
    );
  });
});
