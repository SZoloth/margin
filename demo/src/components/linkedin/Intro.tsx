import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Outro } from "./Outro";

export const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Fade out at the end of the intro to transition into video
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 20, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <div style={{ opacity: fadeOut }}>
      <Outro />
    </div>
  );
};
