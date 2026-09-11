const REQUIRED = [
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
] as const;

export function assertProductionAuthEnv(env: Record<string, string | undefined>): void {
  if (env.NODE_ENV !== "production") return;
  for (const key of REQUIRED) {
    if (!env[key]?.trim()) throw new Error(`Missing ${key}`);
  }
}
