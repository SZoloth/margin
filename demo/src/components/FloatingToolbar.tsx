import type React from "react";
import { COLORS } from "../constants/colors";

const SWATCH_COLORS = [
  COLORS.swatches.yellow,
  COLORS.swatches.green,
  COLORS.swatches.blue,
  COLORS.swatches.pink,
  COLORS.swatches.orange,
];

const CommentIcon = () => (
  <svg
    width={16}
    height={16}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

type FloatingToolbarProps = {
  opacity: number;
  scale: number;
  x: number;
  y: number;
  activeSwatchIndex?: number;
};

export const FloatingToolbar: React.FC<FloatingToolbarProps> = ({
  opacity,
  scale,
  x,
  y,
  activeSwatchIndex,
}) => {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `translate(-50%, -100%) scale(${scale})`,
        transformOrigin: "center bottom",
        opacity,
        display: "flex",
        alignItems: "center",
        gap: 8,
        borderRadius: 8,
        border: `1px solid ${COLORS.border}`,
        padding: "8px 12px",
        boxShadow:
          "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
        backgroundColor: COLORS.page,
        zIndex: 10,
        pointerEvents: "none",
      }}
    >
      {/* Color swatches */}
      <div style={{ display: "flex", gap: 6 }}>
        {SWATCH_COLORS.map((color, i) => (
          <div
            key={color}
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              backgroundColor: color,
              border:
                activeSwatchIndex === i
                  ? `2px solid ${color}`
                  : "2px solid transparent",
              boxShadow:
                activeSwatchIndex === i
                  ? `0 0 0 2px ${color}40`
                  : "none",
            }}
          />
        ))}
      </div>

      {/* Divider */}
      <div
        style={{
          width: 1,
          height: 20,
          margin: "0 4px",
          backgroundColor: COLORS.border,
        }}
      />

      {/* Comment button */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          borderRadius: 4,
          padding: "4px 8px",
          fontSize: 14,
          fontFamily: "Inter, system-ui, sans-serif",
          color: COLORS.textSecondary,
        }}
      >
        <CommentIcon />
        Comment
      </div>
    </div>
  );
};
