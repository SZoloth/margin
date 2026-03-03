import { cn } from "@/lib/cn";

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  ariaLabelledBy?: string;
}

export function ToggleSwitch({
  checked,
  onChange,
  ariaLabelledBy,
}: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={ariaLabelledBy}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200",
        checked
          ? "bg-[var(--color-accent)]"
          : "bg-[var(--color-border)]",
      )}
    >
      <span
        className={cn(
          "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-[var(--shadow-sm)]",
          checked ? "translate-x-[22px]" : "translate-x-[2px]",
        )}
        style={{
          transition: "transform 250ms var(--ease-spring)",
        }}
      />
    </button>
  );
}
