import { useEffect } from "react";

const timing = {
  fast: 100,
  normal: 200,
  slow: 300,
  page: 250,
};

const highlights = {
  yellow: "#f5edd2",
  green: "#dce8d5",
  blue: "#d8e2eb",
  pink: "#ecdde3",
  orange: "#f0e2cf",
};

const easing = {
  springOvershoot: 1.56,
};

function setVar(name: string, value: string) {
  document.documentElement.style.setProperty(name, value);
}

export function useDesignDials() {
  useEffect(() => {
    setVar("--duration-fast", `${timing.fast}ms`);
    setVar("--duration-normal", `${timing.normal}ms`);
    setVar("--duration-slow", `${timing.slow}ms`);
    setVar("--duration-page", `${timing.page}ms`);
  }, []);

  useEffect(() => {
    setVar("--color-highlight-yellow", highlights.yellow);
    setVar("--color-highlight-green", highlights.green);
    setVar("--color-highlight-blue", highlights.blue);
    setVar("--color-highlight-pink", highlights.pink);
    setVar("--color-highlight-orange", highlights.orange);
  }, []);

  useEffect(() => {
    setVar(
      "--ease-spring",
      `cubic-bezier(0.34, ${easing.springOvershoot}, 0.64, 1)`
    );
  }, []);
}
