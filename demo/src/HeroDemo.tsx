import {
  AbsoluteFill,
  OffthreadVideo,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  staticFile,
} from "remotion";
import {
  HERO_WIDTH,
  HERO_HEIGHT,
  HERO_CROP,
  HERO_SOURCE_START,
  HERO_PLAYBACK_RATE,
  SOURCE_WIDTH,
  SOURCE_HEIGHT,
} from "./constants/hero-timing";

export const HeroDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Scale crop region to fill output, maintaining aspect ratio
  const scaleX = HERO_WIDTH / HERO_CROP.w;
  const scaleY = HERO_HEIGHT / HERO_CROP.h;
  const scale = Math.max(scaleX, scaleY);

  const scaledW = SOURCE_WIDTH * scale;
  const scaledH = SOURCE_HEIGHT * scale;

  const offsetX =
    -(HERO_CROP.x * scale) + (HERO_WIDTH - HERO_CROP.w * scale) / 2;
  const offsetY =
    -(HERO_CROP.y * scale) + (HERO_HEIGHT - HERO_CROP.h * scale) / 2;

  // Fade in over 0.5s, fade out over 0.5s for seamless loop
  const fadeFrames = Math.round(fps * 0.5);
  const opacity = interpolate(
    frame,
    [0, fadeFrames, durationInFrames - fadeFrames, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const startFromFrame = Math.round(HERO_SOURCE_START * fps);

  return (
    <AbsoluteFill style={{ backgroundColor: "#faf8f5" }}>
      <div
        style={{
          width: HERO_WIDTH,
          height: HERO_HEIGHT,
          overflow: "hidden",
          position: "relative",
          opacity,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: offsetX,
            top: offsetY,
            width: scaledW,
            height: scaledH,
          }}
        >
          <OffthreadVideo
            src={staticFile("screen-recording-source.mov")}
            startFrom={startFromFrame}
            playbackRate={HERO_PLAYBACK_RATE}
            muted
            style={{
              width: scaledW,
              height: scaledH,
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
