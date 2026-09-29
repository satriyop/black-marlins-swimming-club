import type { ClubChrome } from "@/lib/server/fns-chrome";

/** Marlins keeps the crest photo. Every other club gets a three-letter monogram. */
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
  const mark = (chrome?.shortName || "Klub").slice(0, 3);
  return (
    <div
      className={`${className} grid place-items-center bg-muted font-display text-lg leading-none text-foreground`}
      aria-hidden="true"
    >
      {mark}
    </div>
  );
}
