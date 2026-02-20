import type React from "react";
import { COLORS } from "../constants/colors";

type MarginNoteProps = {
  opacity: number;
  translateX: number;
  y: number;
};

export const MarginNote: React.FC<MarginNoteProps> = ({
  opacity,
  translateX,
  y,
}) => {
  return (
    <div
      style={{
        position: "absolute",
        right: 16,
        top: y,
        width: 200,
        opacity,
        transform: `translateX(${translateX}px)`,
        zIndex: 5,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          borderRadius: 6,
          border: `1px solid ${COLORS.border}`,
          padding: 10,
          backgroundColor: COLORS.page,
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}
      >
        <p
          style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontStyle: "italic",
            fontSize: 13,
            lineHeight: 1.5,
            color: COLORS.textSecondary,
            margin: 0,
          }}
        >
          Core insight — local-first means your data never leaves.
        </p>
      </div>
    </div>
  );
};
