import { Composition } from "remotion";
import { loadFont as loadNewsreader } from "@remotion/google-fonts/Newsreader";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { MarginDemo } from "./MarginDemo";
import { FPS, TOTAL_FRAMES } from "./constants/timing";

loadNewsreader();
loadInter();

const Root: React.FC = () => {
  return (
    <Composition
      id="MarginDemo"
      component={MarginDemo}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={1280}
      height={720}
    />
  );
};

export default Root;
