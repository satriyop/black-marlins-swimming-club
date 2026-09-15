import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("a release preserves only recorded assets from retained builds", () => {
  const temp = mkdtempSync(join(tmpdir(), "bmsc-release-assets-"));
  const oldRelease = join(temp, "releases", "old");
  const newRelease = join(temp, "releases", "new");
  const oldAssets = join(oldRelease, ".output", "public", "assets");
  const newAssets = join(newRelease, ".output", "public", "assets");
  mkdirSync(oldAssets, { recursive: true });
  mkdirSync(newAssets, { recursive: true });
  writeFileSync(join(oldAssets, "old.js"), "old-native");
  writeFileSync(join(oldAssets, "same.js"), "old-version");
  writeFileSync(join(newAssets, "new.js"), "new-native");
  writeFileSync(join(newAssets, "same.js"), "new-version");

  try {
    execFileSync(
      "bash",
      [
        "-c",
        'source "$1"; record_release_assets "$2"; printf carried >"$2/.output/public/assets/carried.js"; record_release_assets "$3"; preserve_retained_client_assets "$4" "$3"',
        "bash",
        join(root, "scripts", "release-assets.sh"),
        oldRelease,
        newRelease,
        join(temp, "releases"),
      ],
      { stdio: "pipe" },
    );

    expect(readFileSync(join(newAssets, "old.js"), "utf8")).toBe("old-native");
    expect(readFileSync(join(newAssets, "same.js"), "utf8")).toBe("new-version");
    expect(() => readFileSync(join(newAssets, "carried.js"), "utf8")).toThrow();
    expect(readFileSync(join(newRelease, "RELEASE_ASSETS"), "utf8")).toContain("./new.js");
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
