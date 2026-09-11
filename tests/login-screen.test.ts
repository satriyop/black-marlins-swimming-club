import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { emailAndPasswordEnabled } from "../src/lib/auth/email-password";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("Masuk source has Google and password sign-in and no public register", () => {
  const src = readFileSync(join(root, "src/components/auth/login-screen.tsx"), "utf8");
  const client = readFileSync(join(root, "src/lib/auth/client.ts"), "utf8");
  const auth = readFileSync(join(root, "src/lib/auth/server.ts"), "utf8");
  expect(src).toContain("Masuk dengan Google");
  expect(src).toContain('type="password"');
  expect(src).toContain("signInWithPassword");
  expect(src.toLowerCase()).not.toContain("daftar akun");
  expect(src.toLowerCase()).not.toContain("sign up");
  expect(client).toContain("signInWithPassword");
  expect(client).toContain("authClient.signIn.email");
  expect(auth).toContain("disableSignUp: true");
  expect(emailAndPasswordEnabled).toBe(true);
});

test("undangan route file exists", () => {
  const src = readFileSync(join(root, "src/routes/undangan.tsx"), "utf8");
  expect(src).toContain('createFileRoute("/undangan")');
});
