import { interpolate, useCurrentFrame } from "remotion";

type TextOverlayProps = {
  caption: string;
  subcaption?: string;
  durationInFrames: number;
};

export const TextOverlay: React.FC<TextOverlayProps> = ({
  caption,
  subcaption,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();

  if (!caption) return null;

  // Animate in over first 20 frames, hold, animate out over last 20
  const opacity = interpolate(
    frame,
    [0, 20, durationInFrames - 20, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Slight slide up on entry
  const translateY = interpolate(frame, [0, 20], [12, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        bottom: 60,
        left: 0,
        right: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        opacity,
        transform: `translateY(${translateY}px)`,
        pointerEvents: "none",
        zIndex: 10,
      }}
    >
      {/* Backdrop gradient */}
      <div
        style={{
          position: "absolute",
          bottom: -60,
          left: 0,
          right: 0,
          height: 200,
          background:
            "linear-gradient(transparent, rgba(0,0,0,0.6) 40%, rgba(0,0,0,0.8))",
          zIndex: -1,
        }}
      />
      <div
        style={{
          fontFamily: "Newsreader, serif",
          fontSize: 42,
          fontWeight: 500,
          color: "#fff",
          textShadow: "0 2px 8px rgba(0,0,0,0.5)",
          textAlign: "center",
          lineHeight: 1.3,
          padding: "0 80px",
        }}
      >
        {caption}
      </div>
      {subcaption && (
        <div
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 22,
            fontWeight: 400,
            color: "rgba(255,255,255,0.85)",
            textShadow: "0 1px 4px rgba(0,0,0,0.4)",
            textAlign: "center",
            marginTop: 8,
            padding: "0 120px",
          }}
        >
          {subcaption}
        </div>
      )}
    </div>
  );
};
