import { cn } from "@/lib/cn";

interface ColorOption<T extends string> {
  name: T;
  css: string;
}

interface ColorPickerProps<T extends string> {
  colors: readonly ColorOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function ColorPicker<T extends string>({
  colors,
  value,
  onChange,
}: ColorPickerProps<T>) {
  return (
    <div className="flex items-center gap-3">
      {colors.map((color) => (
        <button
          key={color.name}
          type="button"
          aria-label={color.name}
          onClick={() => onChange(color.name)}
          className={cn(
            "h-7 w-7 rounded-full hover:scale-110",
            color.name === value &&
              "ring-2 ring-[var(--color-text-primary)] ring-offset-2 ring-offset-[var(--color-sidebar)]",
          )}
          style={{
            backgroundColor: color.css,
            transition: "transform 200ms var(--ease-spring)",
          }}
        />
      ))}
    </div>
  );
}
