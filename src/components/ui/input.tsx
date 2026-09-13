import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cloneElement, isValidElement, useId } from "react";
import { cn } from "@/lib/utils";

const fieldClass =
  "min-h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground outline-none transition-[box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-ring";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClass, className)} {...props} />;
}

export function SelectNative({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldClass, "pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldClass, "h-auto min-h-24 py-2.5", className)} {...props} />;
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const generatedId = useId();
  const control = isValidElement<{ id?: string; "aria-describedby"?: string }>(children)
    ? children
    : null;
  const id = control?.props.id ?? generatedId;
  const hintId = `${id}-hint`;
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5 text-sm [overflow-wrap:anywhere]">
      <label htmlFor={id} className="font-semibold text-foreground">
        {label}
      </label>
      {control
        ? cloneElement(control, {
            id,
            "aria-describedby":
              [control.props["aria-describedby"], hint ? hintId : undefined]
                .filter(Boolean)
                .join(" ") || undefined,
          })
        : children}
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
