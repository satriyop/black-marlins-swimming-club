import * as Popover from "@radix-ui/react-popover";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { setAppearance, useAppearance, type Appearance } from "@/lib/appearance";

const CHOICES: { value: Appearance; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "Ikuti perangkat", Icon: Monitor },
  { value: "light", label: "Terang", Icon: Sun },
  { value: "dark", label: "Gelap", Icon: Moon },
];

export function AppearanceSelect() {
  const appearance = useAppearance();
  const Current = CHOICES.find((choice) => choice.value === appearance)?.Icon ?? Monitor;
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button type="button" size="icon" variant="ghost" aria-label="Tampilan">
          <Current />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          role="menu"
          aria-label="Tampilan"
          className="z-50 grid min-w-52 gap-1 rounded-xl border border-input bg-popover p-1 text-popover-foreground shadow-elevated"
        >
          {CHOICES.map(({ value, label, Icon }) => (
            <Popover.Close asChild key={value}>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={appearance === value}
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-muted",
                  appearance === value && "bg-selected font-semibold text-primary",
                )}
                onClick={() => setAppearance(value)}
              >
                <Icon />
                {label}
              </button>
            </Popover.Close>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
