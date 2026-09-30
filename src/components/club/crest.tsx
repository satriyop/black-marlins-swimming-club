import type { ClubChrome } from "@/lib/server/fns-chrome";

/** Crest photo when the club has one. Otherwise the club's letters. */
export function ClubCrest({
  chrome,
  className,
  alt,
}: {
  chrome: ClubChrome | null;
  className: string;
  alt: string;
}) {
  if (chrome?.crestSrc) {
    return <img src={chrome.crestSrc} alt={alt} className={className} />;
  }
  const mark = chrome?.mark || (chrome?.shortName || "Klub").slice(0, 3);
  return (
    <div
      className={`${className} grid place-items-center bg-muted font-display text-lg leading-none text-foreground`}
      aria-hidden="true"
    >
      {mark}
    </div>
  );
}
