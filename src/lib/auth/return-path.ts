const MAX_LEN = 512;

function decodedLooksUnsafe(value: string): boolean {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return true;
  }
  if (decoded.startsWith("//")) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(decoded)) return true;
  if (decoded.includes("//")) return true;
  if (decoded.includes("\\")) return true;
  return false;
}

export function safeReturnPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value || value.length > MAX_LEN) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  if (value.includes("://")) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  if (value.includes("\\")) return null;
  if (decodedLooksUnsafe(value)) return null;
  const hash = value.indexOf("#");
  const cut = hash === -1 ? value : value.slice(0, hash);
  const q = cut.indexOf("?");
  const path = q === -1 ? cut : cut.slice(0, q);
  if (path === "/login" || path.startsWith("/login/")) return null;
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  return cut;
}

export function returnPathForLocation(pathname: string, searchStr = ""): string | null {
  if (pathname === "/login" || pathname.startsWith("/login/")) return null;
  if (pathname === "/terima" || pathname.startsWith("/terima/")) return null;
  const search = searchStr.startsWith("?") ? searchStr : searchStr ? `?${searchStr}` : "";
  return safeReturnPath(`${pathname}${search}`);
}
