import { expect, test } from "vitest";
import { ADULT_PROVIDERS } from "../src/lib/auth/providers";
import { assertProductionAuthEnv } from "../src/lib/auth/production";

test("adult sign-in offers Google and not X", () => {
  expect(ADULT_PROVIDERS.map((p) => p.idp)).toEqual(["google"]);
  expect(ADULT_PROVIDERS.some((p) => p.idp === "twitter" || p.providerId.includes("x"))).toBe(false);
});

test("production boot refuses missing BETTER_AUTH_SECRET", () => {
  expect(() =>
    assertProductionAuthEnv({
      NODE_ENV: "production",
      GOOGLE_CLIENT_ID: "id",
      GOOGLE_CLIENT_SECRET: "secret",
      BETTER_AUTH_URL: "https://club.example",
      DATABASE_URL: "postgres://x",
    }),
  ).toThrow(/BETTER_AUTH_SECRET/);
});

test("production boot refuses missing Google client", () => {
  expect(() =>
    assertProductionAuthEnv({
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: "secret",
      BETTER_AUTH_URL: "https://club.example",
      DATABASE_URL: "postgres://x",
    }),
  ).toThrow(/GOOGLE_CLIENT/);
});

test("non-production does not require secrets", () => {
  expect(() => assertProductionAuthEnv({ NODE_ENV: "test" })).not.toThrow();
});

test("production boot refuses missing DATABASE_URL", () => {
  expect(() =>
    assertProductionAuthEnv({
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: "secret",
      BETTER_AUTH_URL: "https://club.example",
      GOOGLE_CLIENT_ID: "id",
      GOOGLE_CLIENT_SECRET: "secret",
    }),
  ).toThrow(/DATABASE_URL/);
});
