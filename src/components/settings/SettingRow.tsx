import { Children, cloneElement, isValidElement } from "react";

interface SettingRowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
  id?: string;
}

function kebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function SettingRow({ label, description, children, id }: SettingRowProps) {
  const labelId = `settings-${id || kebabCase(label)}`;

  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div className="flex flex-col">
        <span
          id={labelId}
          className="text-[length:var(--text-base)] font-medium text-[var(--color-text-primary)]"
        >
          {label}
        </span>
        {description && (
          <span className="mt-0.5 text-[length:var(--text-sm)] text-[var(--color-text-secondary)]">
            {description}
          </span>
        )}
      </div>
      <div>
        {Children.map(children, (child) =>
          isValidElement(child)
            ? cloneElement(child as React.ReactElement<Record<string, unknown>>, {
                "aria-labelledby": labelId,
              })
            : child,
        )}
      </div>
    </div>
  );
}
