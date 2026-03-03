import { cn } from "@/lib/cn";

interface ColorOption {
  value: string;
  css: string;
}

interface ColorPickerProps {
  colors: ColorOption[];
  value: string;
  onChange: (value: string) => void;
}

export function ColorPicker({ colors, value, onChange }: ColorPickerProps) {
  return (
    <div className="flex items-center gap-3">
      {colors.map((color) => (
        <button
          key={color.value}
          type="button"
          aria-label={color.value}
          onClick={() => onChange(color.value)}
          className={cn(
            "h-7 w-7 rounded-full hover:scale-110",
            color.value === value &&
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
