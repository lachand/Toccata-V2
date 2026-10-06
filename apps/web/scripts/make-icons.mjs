// Génère les PNG de l'application à partir des SVG (outil ponctuel : nécessite `playwright-core` et un Chromium).
// Usage : CHROME=/chemin/vers/chrome node scripts/make-icons.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const dir = new URL("../public/icons/", import.meta.url);
const jobs = [
  ["icon.svg", "icon-192.png", 192],
  ["icon.svg", "icon-512.png", 512],
  ["icon-maskable.svg", "icon-maskable-512.png", 512],
];
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ["--no-sandbox"] });
for (const [src, out, size] of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const svg = readFileSync(new URL(src, dir), "utf8");
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  writeFileSync(new URL(out, dir), await page.screenshot({ omitBackground: true, type: "png" }));
  await page.close();
}
await browser.close();
