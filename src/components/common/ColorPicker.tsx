import { useState } from "react";
import type { HighlightColor } from "@/types/annotations";

interface ColorPickerProps {
  colors: HighlightColor[];
  activeColor: HighlightColor | null;
  onSelect: (color: HighlightColor) => void;
  size?: "sm" | "md";
}

const COLOR_VALUES: Record<HighlightColor, string> = {
  yellow: "#fde68a",
  green: "#bbf7d0",
  blue: "#bfdbfe",
  pink: "#fbcfe8",
  orange: "#fed7aa",
};

const COLOR_RING: Record<HighlightColor, string> = {
  yellow: "#f59e0b",
  green: "#22c55e",
  blue: "#3b82f6",
  pink: "#ec4899",
  orange: "#f97316",
};

export function ColorPicker({ colors, activeColor, onSelect, size = "md" }: ColorPickerProps) {
  const [hoveredColor, setHoveredColor] = useState<HighlightColor | null>(null);

  const dimension = size === "sm" ? 20 : 28;

  return (
    <div className="flex items-center gap-1.5">
      {colors.map((color) => {
        const isActive = activeColor === color;
        return (
          <div
            key={color}
            className="relative"
            onMouseEnter={() => setHoveredColor(color)}
            onMouseLeave={() => setHoveredColor(null)}
          >
            <button
              type="button"
              onClick={() => onSelect(color)}
              className="rounded-full border-2 transition-transform hover:scale-110 focus:outline-none"
              style={{
                width: dimension,
                height: dimension,
                backgroundColor: COLOR_VALUES[color],
                borderColor: isActive ? COLOR_RING[color] : "transparent",
                boxShadow: isActive
                  ? `0 0 0 2px ${COLOR_RING[color]}40`
                  : "none",
              }}
              aria-label={`Highlight ${color}`}
            />
            {hoveredColor === color && (
              <div
                className="absolute left-1/2 -translate-x-1/2 rounded px-1.5 py-0.5 text-xs text-white whitespace-nowrap pointer-events-none"
                style={{
                  bottom: dimension + 6,
                  backgroundColor: "#374151",
                }}
              >
                {color.charAt(0).toUpperCase() + color.slice(1)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
