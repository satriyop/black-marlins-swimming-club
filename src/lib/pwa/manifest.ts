import { crestSrcFor, isMarlinsBrand } from "@/lib/club/hostname";

const ICONS = [
  { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
];

export type ManifestClub = { name: string; shortName: string; slug: string | null } | null;

export function clubManifest(club: ManifestClub) {
  const marlins = club != null && isMarlinsBrand(club);
  const crest = club != null ? crestSrcFor(club) : null;
  const icons = crest && !marlins
    ? [
        { src: crest, sizes: "192x192", type: "image/jpeg", purpose: "any" },
        { src: crest, sizes: "512x512", type: "image/jpeg", purpose: "any" },
      ]
    : ICONS;
  const name = club == null ? "Klub" : marlins ? "Black Marlins Swimming Club" : club.name;
  const shortName = club == null ? "Klub" : marlins ? "Black Marlins" : club.shortName;
  return {
    id: "/",
    name,
    short_name: shortName,
    description: club == null
      ? "Klub tidak ditemukan."
      : marlins
        ? "Jadwal, latihan, kehadiran, dan perkembangan perenang Black Marlins Swimming Club."
        : `Jadwal, latihan, kehadiran, dan perkembangan perenang ${club.name}.`,
    start_url: "/",
    scope: "/",
    lang: "id",
    dir: "ltr",
    display: "standalone",
    background_color: "#061018",
    theme_color: "#061018",
    icons,
  };
}
