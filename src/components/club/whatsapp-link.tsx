function WhatsAppMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M17.5 14.4c-.3-.1-1.6-.8-1.8-.9-.2-.1-.4-.1-.6.1-.2.3-.7.9-.8 1-.1.2-.3.2-.6.1-.3-.2-1.2-.4-2.3-1.4-1-.8-1.6-1.8-1.8-2.1-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.1.2-.3.2-.4 0-.1 0-.3-.1-.4l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 1.9 0 1.1.8 2.2.9 2.3.1.2 1.6 2.5 3.8 3.5 1.4.6 1.9.7 2.6.6.4 0 1.3-.2 1.5-.7.2-.5.2-.9.1-1 0-.1-.2-.2-.5-.3zM12.04 21.8c-1.7 0-3.3-.4-4.8-1.3l-.3-.2-3.5.9.9-3.4-.2-.3A9.7 9.7 0 0 1 2.3 12C2.3 6.6 6.7 2.2 12 2.2c2.6 0 5 1 6.8 2.8a9.6 9.6 0 0 1 2.8 6.8c0 5.4-4.4 9.8-9.6 10zm8.3-16.1A11.3 11.3 0 0 0 12.04.5C5.7.5.6 5.6.6 12c0 2 .5 4 1.5 5.7L.1 23.5l6-1.6a11.5 11.5 0 0 0 5.9 1.6h.1c6.3 0 11.5-5.1 11.5-11.5 0-3.1-1.2-6-3.4-8.1z"
      />
    </svg>
  );
}

export function WhatsAppLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      aria-label="Hubungi klub via WhatsApp"
      className="grid size-11 place-items-center rounded-full bg-selected text-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <WhatsAppMark className="size-5" />
    </a>
  );
}
