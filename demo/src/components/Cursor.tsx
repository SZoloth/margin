import type React from "react";

type CursorProps = {
  x: number;
  y: number;
  opacity: number;
};

export const Cursor: React.FC<CursorProps> = ({ x, y, opacity }) => {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        opacity,
        zIndex: 20,
        pointerEvents: "none",
        filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.15))",
      }}
    >
      <svg width={20} height={24} viewBox="0 0 20 24" fill="none">
        <path
          d="M2 1L2 18L6.5 13.5L11 21L14 19.5L9.5 12L16 11L2 1Z"
          fill="white"
          stroke="black"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};
