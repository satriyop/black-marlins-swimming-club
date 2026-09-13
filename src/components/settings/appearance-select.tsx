import { useId } from "react";
import { SelectNative } from "@/components/ui/input";
import { setAppearance, useAppearance, type Appearance } from "@/lib/appearance";

export function AppearanceSelect() {
  const id = useId();
  const appearance = useAppearance();
  return (
    <div className="grid min-w-0 gap-1">
      <label htmlFor={id} className="text-sm font-semibold">
        Tampilan
      </label>
      <SelectNative
        id={id}
        value={appearance}
        onChange={(e) => setAppearance(e.target.value as Appearance)}
      >
        <option value="dark">Gelap</option>
        <option value="light">Terang</option>
        <option value="system">Ikuti perangkat</option>
      </SelectNative>
    </div>
  );
}
