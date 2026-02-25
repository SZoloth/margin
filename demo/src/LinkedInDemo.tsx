import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import { SCENES, TRANSITION_FRAMES } from "./constants/linkedin-timing";
import { VideoSegment } from "./components/linkedin/VideoSegment";
import { TextOverlay } from "./components/linkedin/TextOverlay";
import { Intro } from "./components/linkedin/Intro";
import { Outro } from "./components/linkedin/Outro";

const PREMOUNT = 30; // 1s premount for smooth transitions

export const LinkedInDemo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Background music — "Okey Dokey Smokey" by Jason Shaw (audionautix.com, CC BY 3.0) */}
      <Audio src={staticFile("background-music.mp3")} volume={0.3} loop />
      {SCENES.map((scene) => {
        if (scene.id === "intro") {
          return (
            <Sequence
              key={scene.id}
              from={scene.from}
              durationInFrames={scene.duration}
              premountFor={PREMOUNT}
            >
              <Intro />
            </Sequence>
          );
        }

        if (scene.id === "outro") {
          return (
            <Sequence
              key={scene.id}
              from={scene.from}
              durationInFrames={scene.duration}
              premountFor={PREMOUNT}
            >
              <Outro />
            </Sequence>
          );
        }

        // Video scenes
        return (
          <Sequence
            key={scene.id}
            from={scene.from - TRANSITION_FRAMES}
            durationInFrames={scene.duration + TRANSITION_FRAMES * 2}
            premountFor={PREMOUNT}
          >
            <VideoSegment
              sourceStart={scene.sourceStart!}
              speed={scene.speed}
              zoomFrom={scene.zoomFrom}
              zoomTo={scene.zoomTo}
              durationInFrames={scene.duration + TRANSITION_FRAMES * 2}
            />
            <TextOverlay
              caption={scene.caption}
              subcaption={scene.subcaption}
              durationInFrames={scene.duration + TRANSITION_FRAMES * 2}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
