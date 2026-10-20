// Generates web-ready brand assets from the original logo file in design/brand/.
// Run: node scripts/brand-assets.mjs   (re-run whenever the source logo changes)
// Source: omnihack-logo-horizontal.png (purple + charcoal, transparent; supplied 2026-10-21).
// The older blue logos are kept in design/brand/archive-* for reference only.
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const SRC = "design/brand";
const OUT = "public/brand";
mkdirSync(OUT, { recursive: true });

/** Recolor the neutral (charcoal/black) parts to white for use on dark backgrounds; keep the brand colour. */
async function lightVariant(input, output, width) {
  const { data, info } = await sharp(input).resize({ width }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    // Saturated pixels (the purple, including its anti-aliased edges) keep their colour; greys become white.
    const isBrand = Math.max(r, g, b) - Math.min(r, g, b) > 40;
    if (!isBrand) data[i] = data[i + 1] = data[i + 2] = 255;
  }
  await sharp(data, { raw: info }).png({ compressionLevel: 9 }).toFile(output);
}

const horizontal = `${SRC}/omnihack-logo-horizontal.png`;
const { width: srcW, height: srcH } = await sharp(horizontal).metadata();

// Horizontal lockup (header, sidebar, auth pages, certificates): 2× of the ~40px display height.
await sharp(horizontal).resize({ height: 160 }).png({ compressionLevel: 9 }).toFile(`${OUT}/omnihack-logo.png`);
await lightVariant(horizontal, `${OUT}/omnihack-logo-light.png`, Math.round((srcW / srcH) * 160));

// Symbol only: the bracketed "hi" diamond at the left of the horizontal logo, trimmed and centred on a square canvas.
async function cropToContent(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let [x0, y0, x1, y1] = [info.width, info.height, 0, 0];
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++)
      if (data[(y * info.width + x) * 4 + 3] > 16) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  return sharp(buf)
    .extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 })
    .png()
    .toBuffer();
}
// The symbol ends at ~26% of the width; the "O" of the wordmark starts at ~27%.
const symbolWidth = Math.round(srcW * 0.265);
const symbol = await cropToContent(await sharp(horizontal).extract({ left: 0, top: 0, width: symbolWidth, height: srcH }).png().toBuffer());
const square = async (size, pad, background) =>
  sharp(symbol)
    .resize({ width: size - pad * 2, height: size - pad * 2, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background })
    .png({ compressionLevel: 9 });

const clear = { r: 0, g: 0, b: 0, alpha: 0 };
await (await square(512, 24, clear)).toFile(`${OUT}/omnihack-mark.png`);
await (await square(512, 24, clear)).toFile("src/app/icon.png");
await (await square(180, 18, { r: 255, g: 255, b: 255, alpha: 1 })).flatten({ background: "#ffffff" }).toFile("src/app/apple-icon.png");
console.log("Brand assets written to", OUT, "and src/app/{icon,apple-icon}.png");
