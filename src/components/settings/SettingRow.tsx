interface SettingRowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
}

export function SettingRow({ label, description, children }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div className="flex flex-col">
        <span className="text-[length:var(--text-base)] font-medium text-[var(--color-text-primary)]">
          {label}
        </span>
        {description && (
          <span className="mt-0.5 text-[length:var(--text-sm)] text-[var(--color-text-secondary)]">
            {description}
          </span>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}
