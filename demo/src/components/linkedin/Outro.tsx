import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Img, staticFile } from "remotion";

const FEATURES = [
  "Highlight text and write targeted feedback",
  "Build a local log of every note you make",
  "Export to Markdown, JSON, or clipboard",
  "Feed annotations to Claude for revisions",
];

export const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Fade in
  const fadeIn = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Logo spring
  const logoScale = spring({
    frame,
    fps,
    config: { damping: 14, mass: 0.8, stiffness: 180 },
  });

  return (
    <div
      style={{
        width: 1920,
        height: 1080,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#faf8f5",
        opacity: fadeIn,
      }}
    >
      {/* Logo */}
      <div style={{ transform: `scale(${logoScale})` }}>
        <Img
          src={staticFile("icon-1024.png")}
          style={{ width: 80, height: 80, borderRadius: 18 }}
        />
      </div>

      <div
        style={{
          fontFamily: "Newsreader, serif",
          fontSize: 56,
          fontWeight: 600,
          color: "#1a1a1a",
          marginTop: 16,
        }}
      >
        Margin
      </div>

      {/* Feature list */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          marginTop: 40,
        }}
      >
        {FEATURES.map((feature, i) => {
          const featureOpacity = interpolate(
            frame,
            [40 + i * 20, 60 + i * 20],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          const featureY = interpolate(
            frame,
            [40 + i * 20, 60 + i * 20],
            [15, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          return (
            <div
              key={feature}
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 26,
                color: "#4a4a4a",
                opacity: featureOpacity,
                transform: `translateY(${featureY}px)`,
                textAlign: "center",
              }}
            >
              {feature}
            </div>
          );
        })}
      </div>

      {/* CTA */}
      <div
        style={{
          fontFamily: "Inter, sans-serif",
          fontSize: 28,
          fontWeight: 500,
          color: "#1a1a1a",
          marginTop: 60,
          opacity: interpolate(frame, [160, 180], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          padding: "16px 40px",
          borderRadius: 10,
          border: "2px solid #1a1a1a",
        }}
      >
        marginreader.app
      </div>
    </div>
  );
};
