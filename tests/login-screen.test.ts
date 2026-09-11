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

test("detail route files are flattened siblings", () => {
  const event = readFileSync(join(root, "src/routes/event_.$id.tsx"), "utf8");
  const latihan = readFileSync(join(root, "src/routes/latihan_.$id.tsx"), "utf8");
  const perenang = readFileSync(join(root, "src/routes/perenang_.$id.tsx"), "utf8");
  expect(event).toContain('createFileRoute("/event_/$id")');
  expect(latihan).toContain('createFileRoute("/latihan_/$id")');
  expect(perenang).toContain('createFileRoute("/perenang_/$id")');
});

test("undangan route file exists", () => {
  const src = readFileSync(join(root, "src/routes/undangan.tsx"), "utf8");
  expect(src).toContain('createFileRoute("/undangan")');
  expect(src).toContain("acceptPath");
});

test("accept invite is a server function and /terima exists", () => {
  const fns = readFileSync(join(root, "src/lib/server/fns-invites.ts"), "utf8");
  const terima = readFileSync(join(root, "src/routes/terima.tsx"), "utf8");
  const dockerignore = readFileSync(join(root, ".dockerignore"), "utf8");
  expect(fns).toContain("export const acceptClubInvite");
  expect(terima).toContain('createFileRoute("/terima")');
  expect(dockerignore).toMatch(/^node_modules$/m);
  expect(dockerignore).toMatch(/^\.env$/m);
});
