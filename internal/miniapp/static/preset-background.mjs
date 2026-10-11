import { syncCustomBackground } from "./custom-background.mjs";
import { createMorphicBackground } from "./morphic-background.js";
import { createTwinkleBackground } from "./twinkle-background.js";
import {
  DEFAULT_BACKGROUND_MOTION,
  backgroundNumber,
  presetBackgroundColors,
} from "./background-palette.mjs";

const controllers = new Map();
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let filterId = 0,
  waveModule;
const modes = new Set([...Object.keys(DEFAULT_BACKGROUND_MOTION), "custom"]);

function createFilter(layer, name, body) {
  const id = `preset-${name}-${++filterId}`;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("preset-background__filters");
  svg.innerHTML = `<defs><filter id="${id}" x="-30%" y="-30%" width="160%" height="160%">${body}</filter></defs>`;
  layer.append(svg);
  return id;
}

class PresetBackground {
  constructor(host) {
    this.host = host;
    this.visible = true;
    this.generation = 0;
    this.observer = new IntersectionObserver(
      (entries) => {
        this.visible = entries.at(-1)?.isIntersecting !== false;
        this.playback();
      },
      { rootMargin: "150px" },
    );
    this.observer.observe(host);
  }
  update(selection, appearance, options) {
    this.appearance = appearance;
    this.options = options;
    const mode = modes.has(selection?.mode) ? selection.mode : "solid";
    if (this.mode !== mode) {
      this.generation++;
      this.engine?.destroy();
      this.engine = null;
      syncCustomBackground(this.host, null);
      this.host.replaceChildren();
      this.host.style.removeProperty("--custom-dimming");
      this.matrix = null;
      delete this.host.dataset.renderer;
      this.mode = mode;
      this.host.dataset.mode = mode;
      this.mount();
    }
    const variables = presetBackgroundColors(appearance.colors);
    for (const [name, value] of Object.entries(variables))
      this.host.style.setProperty(name, value);
    const fallback =
      DEFAULT_BACKGROUND_MOTION[mode] || DEFAULT_BACKGROUND_MOTION.solid;
    const motion = appearance.backgroundMotion?.[mode] || fallback;
    this.speed = backgroundNumber(motion.speed, fallback.speed, 10, 100);
    const dimming = backgroundNumber(motion.dimming, fallback.dimming, 0, 80);
    const duration = 9.2 - ((this.speed - 10) / 90) * 6.7;
    this.host.style.setProperty("--background-dimming", String(dimming / 100));
    this.host.style.setProperty(
      "--background-animation-duration",
      `${duration.toFixed(2)}s`,
    );
    this.host.style.setProperty(
      "--blocks-duration",
      `${(duration * 1.6).toFixed(2)}s`,
    );
    this.custom =
      mode === "custom"
        ? appearance.customBackgrounds?.find(
            (bg) => bg.id === selection?.backgroundId,
          )
        : mode === "backtyan"
          ? {
              url: "/mini-app/assets/background-backtyan.mp4",
              poster: "/mini-app/assets/background-backtyan-poster.jpg",
              type: "video",
              fit: "cover",
              scale: 100,
              positionX: 50,
              positionY: 50,
              speed: Math.max(0.5, Math.min(1.5, this.speed / 50)) * 100,
              dimming,
            }
          : null;
    this.configure(variables);
    this.playback();
  }
  mount() {
    if (["solid", "custom", "backtyan"].includes(this.mode)) return;
    const layer = document.createElement("div");
    this.layer = layer;
    layer.className = `bg-media__${this.mode === "animated" ? "waves" : this.mode}`;
    this.host.append(layer);
    if (this.mode === "morphic") {
      const particles = document.createElement("div");
      particles.className = "bg-media__morphic-particles";
      const id = createFilter(
        layer,
        "goo",
        '<feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur"/><feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 24 -12" result="goo"/><feComposite in="SourceGraphic" in2="goo" operator="atop"/>',
      );
      particles.style.filter = `url("#${id}")`;
      layer.append(particles);
      this.engine = createMorphicBackground(particles);
    } else if (this.mode === "twinkle") {
      const canvas = document.createElement("canvas");
      canvas.className = "bg-media__twinkle-canvas";
      layer.append(canvas);
      this.engine = createTwinkleBackground(canvas);
    } else if (this.mode === "animated") {
      const id = createFilter(layer, "wave", '<feColorMatrix type="matrix"/>');
      this.matrix = layer.querySelector("feColorMatrix");
      const canvas = document.createElement("canvas");
      canvas.className = "preset-background__canvas";
      canvas.style.filter = `url("#${id}")`;
      layer.append(canvas);
      const generation = this.generation;
      waveModule ||= import("./preset-wave.mjs");
      const mountWave = (createPresetWave) => {
        if (this.generation !== generation || !this.host.isConnected) return;
        try {
          this.engine = createPresetWave(canvas);
          this.host.dataset.renderer = "webgl";
        } catch {
          // A static dot wave remains readable on browsers without WebGL.
          canvas.remove();
          const fallback = document.createElement("canvas");
          fallback.className = "preset-background__canvas";
          fallback.style.filter = `url("#${id}")`;
          layer.append(fallback);
          this.engine = createFallbackWave(fallback);
          this.host.dataset.renderer = "canvas";
        }
        this.configure(presetBackgroundColors(this.appearance.colors));
        this.playback();
      };
      void waveModule.then(
        ({ createPresetWave }) => mountWave(createPresetWave),
        () => mountWave(null),
      );
    }
  }
  configure(variables) {
    this.engine?.setConfig({
      speed: this.speed,
      color:
        variables[
          this.mode === "morphic" ? "--morphic-ball" : "--twinkle-star"
        ],
    });
    if (this.matrix) {
      const channels = (hex) =>
        [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
      const bg = channels(variables["--wave-background"]),
        dot = channels(variables["--wave-dot"]);
      const rows = bg.map((base, index) => {
        const delta = (dot[index] - base) / 255;
        return [delta * 0.2126, delta * 0.7152, delta * 0.0722, 0, base / 255];
      });
      this.matrix.setAttribute(
        "values",
        [...rows.flat(), 0, 0, 0, 1, 0].join(" "),
      );
    }
  }
  playback() {
    const paused =
      document.hidden ||
      reducedMotion.matches ||
      !this.visible ||
      this.options?.hidden;
    this.host.dataset.paused = String(Boolean(paused));
    this.engine?.setPaused(Boolean(paused));
    syncCustomBackground(this.host, this.custom, { paused: Boolean(paused) });
  }
  destroy() {
    this.generation++;
    this.engine?.destroy();
    this.observer.disconnect();
    syncCustomBackground(this.host, null);
    this.host.replaceChildren();
  }
}

function createFallbackWave(canvas) {
  const context = canvas.getContext("2d");
  function draw() {
    const width = canvas.parentElement.clientWidth,
      height = canvas.parentElement.clientHeight;
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    if (!context) return;
    context.fillStyle = "#000";
    context.fillRect(0, 0, width, height);
    for (let y = -20; y < height + 20; y += 15)
      for (let x = 0; x < width; x += 15) {
        const wave = Math.sin(x / 95) + Math.cos(y / 110);
        context.fillStyle = `rgba(235,235,235,${0.18 + (wave + 2) * 0.065})`;
        context.beginPath();
        context.arc(x, y + wave * 7, 1, 0, Math.PI * 2);
        context.fill();
      }
  }
  const observer = new ResizeObserver(draw);
  observer.observe(canvas.parentElement);
  draw();
  return {
    setConfig: draw,
    setPaused() {},
    destroy() {
      observer.disconnect();
    },
  };
}

export function syncPresetBackground(
  host,
  selection,
  appearance = {},
  options = {},
) {
  for (const [old, controller] of controllers)
    if (!old.isConnected) {
      controller.destroy();
      controllers.delete(old);
    }
  if (!host) return;
  let controller = controllers.get(host);
  if (!controller) {
    controller = new PresetBackground(host);
    controllers.set(host, controller);
  }
  controller.update(selection, appearance, options);
}

const playback = () =>
  controllers.forEach((controller) => controller.playback());
document.addEventListener("visibilitychange", playback);
reducedMotion.addEventListener("change", playback);
