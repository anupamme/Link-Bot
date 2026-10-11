export const CURSOR_PRESETS = [
  ["system", "Системный"],
  ["paw", "Лапка"],
  ["arrow", "Стрелка"],
  ["ring", "Кольцо"],
  ["crosshair", "Прицел"],
  ["custom", "Свой файл"],
];
const paths = {
  paw: '<g fill="white" stroke="#15171b" stroke-width="1.3"><ellipse cx="9" cy="10" rx="3.5" ry="4.5" transform="rotate(-20 9 10)"/><ellipse cx="17" cy="7" rx="3.5" ry="4.5"/><ellipse cx="25" cy="11" rx="3.5" ry="4.5" transform="rotate(20 25 11)"/><path d="M7 25c0-4 6-12 10-12s10 8 10 12c0 6-6 3-10 3S7 31 7 25Z"/></g>',
  arrow:
    '<path d="M5 3v25l7-7 5 10 5-3-5-9h10Z" fill="white" stroke="#15171b" stroke-width="1.5"/>',
  ring: '<circle cx="16" cy="16" r="10" fill="none" stroke="#15171b" stroke-width="5"/><circle cx="16" cy="16" r="10" fill="none" stroke="white" stroke-width="2.5"/><circle cx="16" cy="16" r="2" fill="white"/>',
  crosshair:
    '<path d="M16 3v10m0 6v10M3 16h10m6 0h10" stroke="#15171b" stroke-width="5"/><path d="M16 3v10m0 6v10M3 16h10m6 0h10" stroke="white" stroke-width="2"/>',
};
export function presetCursor(mode, size = 32) {
  return paths[mode]
    ? `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">${paths[mode]}</svg>`)}`
    : "";
}
export function safeCursorURL(value) {
  if (!value) return "";
  try {
    const url = new URL(
      value,
      globalThis.location?.origin || "https://local.invalid",
    );
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}
let signature = "",
  generation = 0;
async function resizedCursor(url, size) {
  if (/\.cur(?:\?|$)/i.test(url)) return url;
  try {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, size, size);
    return canvas.toDataURL("image/png");
  } catch {
    return url;
  }
}
export async function cursorValues(settings = {}) {
  if (!settings.mode || settings.mode === "system")
    return { normal: "auto", pointer: "pointer" };
  const size = Math.max(16, Math.min(64, Number(settings.size) || 32));
  let normal = presetCursor(settings.mode, size),
    pointer = normal;
  if (settings.mode === "custom") {
    const url = safeCursorURL(settings.url);
    if (!url) return { normal: "auto", pointer: "pointer" };
    normal = await resizedCursor(url, size);
    pointer = settings.pointerUrl
      ? await resizedCursor(safeCursorURL(settings.pointerUrl), size)
      : normal;
  }
  const centered = ["paw", "ring", "crosshair"].includes(settings.mode),
    x = centered
      ? Math.round(size / 2)
      : Math.max(0, Math.min(size - 1, Number(settings.hotspotX) || 0)),
    y = centered
      ? Math.round(size / 2)
      : Math.max(0, Math.min(size - 1, Number(settings.hotspotY) || 0));
  const rule = (url, fallback) =>
    `url(${JSON.stringify(url)}) ${x} ${y}, ${fallback}`;
  return { normal: rule(normal, "auto"), pointer: rule(pointer, "pointer") };
}
export async function applyCustomCursor(settings = {}) {
  const key = JSON.stringify(settings);
  if (signature === key) return;
  signature = key;
  const current = ++generation;
  let style = document.getElementById("custom-cursor-style");
  if (!style) {
    style = document.createElement("style");
    style.id = "custom-cursor-style";
    document.head.append(style);
  }
  style.textContent = "";
  delete document.documentElement.dataset.customCursor;
  if (!settings.mode || settings.mode === "system") return;
  const values = await cursorValues(settings);
  if (current !== generation) return;
  style.textContent = `@media (hover:hover) and (pointer:fine){html,body,body *{cursor:${values.normal}!important}button,a,[role="button"],summary,label,select,input[type="checkbox"],input[type="radio"],button *,a *,[role="button"] *{cursor:${values.pointer}!important}input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="color"]):not([type="range"]),textarea,[contenteditable="true"]{cursor:text!important}[disabled],[aria-disabled="true"]{cursor:not-allowed!important}[data-resize-handle]{cursor:nwse-resize!important}}`;
  document.documentElement.dataset.customCursor = settings.mode;
}
