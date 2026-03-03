import { cn } from "@/lib/cn";

interface SettingsButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

export function SettingsButton({
  children,
  onClick,
  disabled,
  className,
}: SettingsButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "shrink-0 cursor-pointer rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3.5 py-1.5 text-[length:var(--text-xs)] font-medium text-[var(--color-text-primary)] transition-colors duration-150 hover:bg-[var(--color-surface-muted)] disabled:cursor-default disabled:opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}
