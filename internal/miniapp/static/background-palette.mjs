export const DEFAULT_BACKGROUND_MOTION = Object.freeze({
  animated: { dimming: 12, speed: 45 },
  grid: { dimming: 14, speed: 50 },
  grid2: { dimming: 14, speed: 50 },
  blocks: { dimming: 0, speed: 35 },
  morphic: { dimming: 0, speed: 42 },
  twinkle: { dimming: 0, speed: 38 },
  backtyan: { dimming: 65, speed: 50 },
  solid: { dimming: 0, speed: 50 },
});

export function backgroundNumber(value, fallback, min, max) {
  const number = Number(value ?? fallback);
  return Math.max(
    min,
    Math.min(max, Number.isFinite(number) ? number : fallback),
  );
}

function color(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(value || "") ? value : fallback;
}

export function blocksBackgroundTexture(left, right, step = 72) {
  const channels = (value) =>
    [1, 3, 5].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
  const leftColor = `rgb(${channels(color(left, "#161619")).join(",")})`;
  const rightColor = `rgb(${channels(color(right, "#0c0c0e")).join(",")})`;
  // Fixed pixel tiles with a horizontal color gradient, shared by both surfaces.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${step}"><defs><linearGradient id="color"><stop stop-color="${leftColor}"/><stop offset="1" stop-color="${rightColor}"/></linearGradient><pattern id="tiles" x="${-step / 4}" width="${step}" height="${step}" patternUnits="userSpaceOnUse"><rect x="${step * 0.06}" y="${step * 0.06}" width="${step * 0.88}" height="${step * 0.88}" rx="${step * 0.22}" fill="white"/></pattern><mask id="shape"><rect width="100%" height="100%" fill="url(#tiles)"/></mask></defs><rect width="100%" height="100%" fill="url(#color)" mask="url(#shape)"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export function presetBackgroundColors(colors = {}) {
  const result = {};
  for (const [key, variable, fallback] of [
    ["gridBackground", "grid-background", "#000000"],
    ["gridLine", "grid-line", "#ffffff"],
    ["grid2Background", "grid2-background", "#000000"],
    ["grid2Line", "grid2-line", "#ffffff"],
    ["grid2Glow", "grid2-glow", "#ff0000"],
    ["blocksBackground", "blocks-background", "#0a0a0c"],
    ["morphicBackground", "morphic-background", "#000000"],
    ["morphicBall", "morphic-ball", "#ff69b4"],
    ["twinkleBackground", "twinkle-background", "#000000"],
    ["twinkleStar", "twinkle-star", "#ffffff"],
    ["waveBackground", "wave-background", "#000000"],
    ["waveDot", "wave-dot", "#ebebeb"],
  ])
    result[`--${variable}`] = color(colors[key], fallback);
  for (const side of ["Left", "Right"]) {
    const hex = color(colors[`gridGlow${side}`], "#ffffff");
    const rgb = [1, 3, 5].map((offset) =>
      parseInt(hex.slice(offset, offset + 2), 16),
    );
    result[`--grid-glow-${side.toLowerCase()}`] = `rgba(${rgb.join(",")},0.28)`;
  }
  result["--blocks-texture"] = blocksBackgroundTexture(
    colors.blocksLeft,
    colors.blocksRight,
  );
  result["--blocks-preview-texture"] = blocksBackgroundTexture(
    colors.blocksLeft,
    colors.blocksRight,
    22,
  );
  return result;
}
