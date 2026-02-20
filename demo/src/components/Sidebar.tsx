import type React from "react";
import { COLORS } from "../constants/colors";

const RECENT_FILES = [
  { name: "local-first-software.md", source: "F", active: true },
  { name: "reading-as-practice.md", source: "F", active: false },
  { name: "attention-is-all-you-need.md", source: "KL", active: false },
  { name: "why-we-sleep-notes.md", source: "F", active: false },
];

const FolderIcon = () => (
  <svg
    width={16}
    height={16}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

export const Sidebar: React.FC<{ opacity?: number }> = ({ opacity = 1 }) => {
  return (
    <div
      style={{
        width: 260,
        flexShrink: 0,
        height: "100%",
        backgroundColor: COLORS.sidebar,
        borderRight: `1px solid ${COLORS.border}`,
        display: "flex",
        flexDirection: "column",
        padding: "20px 16px",
        opacity,
      }}
    >
      {/* App name */}
      <div
        style={{
          fontSize: 18,
          fontWeight: 600,
          letterSpacing: "-0.025em",
          color: COLORS.textPrimary,
          fontFamily: "Inter, system-ui, sans-serif",
          marginBottom: 24,
        }}
      >
        Margin
      </div>

      {/* Open file button */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 24 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 500,
            color: COLORS.textPrimary,
            fontFamily: "Inter, system-ui, sans-serif",
            cursor: "pointer",
          }}
        >
          <FolderIcon />
          Open File
        </div>
      </div>

      {/* Recent section */}
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          textTransform: "uppercase" as const,
          letterSpacing: "0.05em",
          color: COLORS.textSecondary,
          marginBottom: 12,
          padding: "0 12px",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        Recent
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {RECENT_FILES.map((file) => (
          <div
            key={file.name}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "6px 12px",
              borderRadius: 6,
              fontSize: 14,
              fontFamily: "Inter, system-ui, sans-serif",
              color: file.active ? COLORS.textPrimary : COLORS.textSecondary,
              fontWeight: file.active ? 500 : 400,
              backgroundColor: file.active ? "rgba(0, 0, 0, 0.06)" : "transparent",
              overflow: "hidden",
              whiteSpace: "nowrap" as const,
              textOverflow: "ellipsis",
            }}
          >
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap" as const,
              }}
            >
              {file.name}
            </span>
            <span
              style={{
                fontSize: 11,
                opacity: 0.5,
                flexShrink: 0,
                marginLeft: 8,
              }}
            >
              {file.source}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
