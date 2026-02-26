import { Composition } from "remotion";
import { loadFont as loadNewsreader } from "@remotion/google-fonts/Newsreader";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { MarginDemo } from "./MarginDemo";
import { LinkedInDemo } from "./LinkedInDemo";
import { HeroDemo } from "./HeroDemo";
import { FPS, TOTAL_FRAMES } from "./constants/timing";
import {
  LINKEDIN_FPS,
  LINKEDIN_TOTAL_FRAMES,
} from "./constants/linkedin-timing";
import {
  HERO_FPS,
  HERO_TOTAL_FRAMES,
  HERO_WIDTH,
  HERO_HEIGHT,
} from "./constants/hero-timing";

loadNewsreader();
loadInter();

const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="MarginDemo"
        component={MarginDemo}
        durationInFrames={TOTAL_FRAMES}
        fps={FPS}
        width={1280}
        height={720}
      />
      <Composition
        id="LinkedInDemo"
        component={LinkedInDemo}
        durationInFrames={LINKEDIN_TOTAL_FRAMES}
        fps={LINKEDIN_FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="HeroDemo"
        component={HeroDemo}
        durationInFrames={HERO_TOTAL_FRAMES}
        fps={HERO_FPS}
        width={HERO_WIDTH}
        height={HERO_HEIGHT}
      />
    </>
  );
};

export default Root;
