import { OffthreadVideo, interpolate, useCurrentFrame } from "remotion";
import { staticFile } from "remotion";
import {
  ZOOM_REGIONS,
  TRANSITION_FRAMES,
  type ZoomRegion,
} from "../../constants/linkedin-timing";

const OUTPUT_WIDTH = 1920;
const OUTPUT_HEIGHT = 1080;

type VideoSegmentProps = {
  sourceStart: number;
  sourceEnd: number;
  speed: number;
  zoomFrom: string;
  zoomTo: string;
  durationInFrames: number;
};

function lerpRegion(a: ZoomRegion, b: ZoomRegion, t: number): ZoomRegion {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    w: a.w + (b.w - a.w) * t,
    h: a.h + (b.h - a.h) * t,
  };
}

export const VideoSegment: React.FC<VideoSegmentProps> = ({
  sourceStart,
  sourceEnd,
  speed,
  zoomFrom,
  zoomTo,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();

  const regionA = ZOOM_REGIONS[zoomFrom] ?? ZOOM_REGIONS.full;
  const regionB = ZOOM_REGIONS[zoomTo] ?? ZOOM_REGIONS.full;

  // Zoom animates over the full scene duration with ease-in-out
  const zoomProgress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Ease in-out cubic
  const eased =
    zoomProgress < 0.5
      ? 4 * zoomProgress * zoomProgress * zoomProgress
      : 1 - Math.pow(-2 * zoomProgress + 2, 3) / 2;

  const region = lerpRegion(regionA, regionB, eased);

  // Scale so the crop region fills the output width, maintaining 16:9
  const scaleX = OUTPUT_WIDTH / region.w;
  const scaleY = OUTPUT_HEIGHT / region.h;
  const scale = Math.max(scaleX, scaleY);

  // Source video dimensions (retina)
  const sourceWidth = 2932;
  const sourceHeight = 1838;

  const scaledW = sourceWidth * scale;
  const scaledH = sourceHeight * scale;

  // Position: offset so crop region is centered in output
  const offsetX = -(region.x * scale) + (OUTPUT_WIDTH - region.w * scale) / 2;
  const offsetY = -(region.y * scale) + (OUTPUT_HEIGHT - region.h * scale) / 2;

  // Fade in/out for cross-fade transitions
  const opacity = interpolate(
    frame,
    [0, TRANSITION_FRAMES, durationInFrames - TRANSITION_FRAMES, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Playback rate applied via OffthreadVideo's playbackRate prop
  // startFrom is in frames (at 30fps)
  const startFromFrame = Math.round(sourceStart * 30);

  return (
    <div
      style={{
        width: OUTPUT_WIDTH,
        height: OUTPUT_HEIGHT,
        overflow: "hidden",
        position: "relative",
        opacity,
        backgroundColor: "#000",
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
          src={staticFile("screen-recording.mov")}
          startFrom={startFromFrame}
          playbackRate={speed}
          muted
          style={{
            width: scaledW,
            height: scaledH,
          }}
        />
      </div>
    </div>
  );
};
