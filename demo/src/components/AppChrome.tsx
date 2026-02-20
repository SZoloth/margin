import type React from "react";
import { COLORS } from "../constants/colors";

const TRAFFIC_LIGHTS = [
  { color: "#FF5F57", border: "#E0443E" },
  { color: "#FEBC2E", border: "#DEA123" },
  { color: "#28C840", border: "#1AAB29" },
];

export const AppChrome: React.FC<{
  children: React.ReactNode;
  opacity?: number;
}> = ({ children, opacity = 1 }) => {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        borderRadius: 12,
        overflow: "hidden",
        boxShadow:
          "0 25px 50px -12px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)",
        opacity,
        backgroundColor: COLORS.page,
      }}
    >
      {/* Title bar */}
      <div
        style={{
          height: 52,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          paddingLeft: 20,
          paddingRight: 20,
          backgroundColor: COLORS.sidebar,
          borderBottom: `1px solid ${COLORS.border}`,
          // macOS-style draggable area
          WebkitAppRegion: "drag" as never,
        }}
      >
        {/* Traffic lights */}
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {TRAFFIC_LIGHTS.map((light) => (
            <div
              key={light.color}
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                backgroundColor: light.color,
                border: `0.5px solid ${light.border}`,
              }}
            />
          ))}
        </div>

        {/* Center title */}
        <div
          style={{
            flex: 1,
            textAlign: "center",
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 13,
            fontWeight: 500,
            color: COLORS.textSecondary,
            letterSpacing: "0.01em",
          }}
        >
          local-first-software.md
        </div>

        {/* Spacer to balance traffic lights */}
        <div style={{ width: 52, flexShrink: 0 }} />
      </div>

      {/* Content area */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
};
