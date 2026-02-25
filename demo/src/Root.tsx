import { Composition } from "remotion";
import { loadFont as loadNewsreader } from "@remotion/google-fonts/Newsreader";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { MarginDemo } from "./MarginDemo";
import { LinkedInDemo } from "./LinkedInDemo";
import { FPS, TOTAL_FRAMES } from "./constants/timing";
import {
  LINKEDIN_FPS,
  LINKEDIN_TOTAL_FRAMES,
} from "./constants/linkedin-timing";

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
    </>
  );
};

export default Root;
