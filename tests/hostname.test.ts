import { expect, test } from "vitest";
import { auth, authBaseURL } from "../src/lib/auth/server";
import { listSwimmers } from "../src/lib/club/swimmers";
import {
  clubIdForHost,
  hostnameFromHost,
  isLocalDevHost,
  UnknownClubHostError,
} from "../src/lib/club/hostname";
import { CLUB_NOT_CHOSEN } from "../src/lib/club/membership";
import { clubManifest } from "../src/lib/pwa/manifest";
import { createClubHarness } from "./harness";

test("hostname drops the port and ignores a local address", () => {
  expect(hostnameFromHost("bmsc.klaten.org:443")).toBe("bmsc.klaten.org");
  expect(hostnameFromHost("LocalHost:8080")).toBe("localhost");
  expect(isLocalDevHost("localhost")).toBe(true);
  expect(isLocalDevHost("bmsc.klaten.org")).toBe(false);
});

test("the request host selects that club and an unknown host selects none", async () => {
  const h = await createClubHarness();
  await h.sql.query(
    `insert into clubs (name, short_name, city, province, coach_name, slug, hostname, sport)
     values
      ('Black Marlins Swimming Club Klaten', 'BMSC', 'Klaten', 'Jawa Tengah', 'Coach', 'bmsc', 'bmsc.klaten.org', 'renang'),
      ('Apta Swimming', 'Apta', 'Klaten', 'Jawa Tengah', 'Ketua', 'apta', 'apta.klaten.org', 'renang')`,
  );
  const bmsc = (await h.sql.query<{ id: number }>("select id from clubs where slug = 'bmsc'"))[0]!.id;
  const apta = (await h.sql.query<{ id: number }>("select id from clubs where slug = 'apta'"))[0]!.id;
  await h.sql.query(
    `insert into swimmers (club_id, full_name, date_of_birth, gender) values
      ($1, 'Bima Marlin', '2014-03-02', 'putra'),
      ($2, 'Alya Apta', '2015-04-05', 'putri')`,
    [bmsc, apta],
  );
  await h.sql.query(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     values ('usr_both', 'Both', 'both@example.test', true, now(), now())`,
  );
  await h.sql.query(
    `insert into club_staff (club_id, user_id, role) values ($1, 'usr_both', 'coach'), ($2, 'usr_both', 'club_admin')`,
    [bmsc, apta],
  );

  expect(await clubIdForHost(h.sql, "bmsc.klaten.org")).toBe(bmsc);
  expect(await clubIdForHost(h.sql, "https://apta.klaten.org")).toBe(apta);
  expect(await clubIdForHost(h.sql, "evil.example")).toBeNull();
  expect(await clubIdForHost(h.sql, "APTA.KLATEN.ORG")).toBe(apta);
  await expect(clubIdForHost(h.sql, "localhost")).rejects.toThrow(CLUB_NOT_CHOSEN);

  expect((await listSwimmers(h.actor("usr_both", await clubIdForHost(h.sql, "apta.klaten.org") ?? 0))).map((s) => s.fullName)).toEqual([
    "Alya Apta",
  ]);
  expect(new UnknownClubHostError().message).toBe("Klub tidak ditemukan");
});

test("local dev with one club uses that club", async () => {
  const h = await createClubHarness();
  const rows = await h.sql.query<{ id: number }>(
    `insert into clubs (name, short_name, city, province, coach_name, slug, hostname)
     values ('Black Marlins', 'BMSC', 'Klaten', 'Jateng', 'Coach', 'bmsc', 'bmsc.klaten.org')
     returning id`,
  );
  expect(await clubIdForHost(h.sql, "localhost:8080")).toBe(rows[0]!.id);
  expect(await clubIdForHost(h.sql, null)).toBe(rows[0]!.id);
});

test("session cookies stay on the host and login does not fall back to another origin", () => {
  expect(authBaseURL.allowedHosts).toContain("bmsc.klaten.org");
  expect(authBaseURL.allowedHosts).toContain("localhost");
  expect(authBaseURL).not.toHaveProperty("fallback");
  expect(auth.options.advanced?.defaultCookieAttributes?.domain).toBeUndefined();
  expect(auth.options.advanced?.crossSubDomainCookies?.enabled).toBe(false);
});

test("the install manifest names the club on that hostname", () => {
  expect(clubManifest({ name: "Black Marlins Swimming Club Klaten", shortName: "BMSC", slug: "bmsc" })).toMatchObject({
    name: "Black Marlins Swimming Club",
    short_name: "Black Marlins",
    start_url: "/",
  });
  const apta = clubManifest({ name: "Apta Swimming", shortName: "Apta", slug: "apta" });
  expect(apta.name).toBe("Apta Swimming");
  expect(apta.short_name).toBe("Apta");
  expect(JSON.stringify(clubManifest(null))).not.toContain("Black Marlins");
  expect(JSON.stringify(apta)).not.toContain("token");
});
