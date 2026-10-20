// Generates web-ready brand assets from the original logo files in design/brand/.
// Run: node scripts/brand-assets.mjs   (re-run whenever the source logos change)
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const SRC = "design/brand";
const OUT = "public/brand";
mkdirSync(OUT, { recursive: true });

/** Recolor the dark (charcoal/black) parts to white for use on dark backgrounds; keep the blue. */
async function lightVariant(input, output, width) {
  const { data, info } = await sharp(input).resize({ width }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const [r, b] = [data[i], data[i + 2]];
    const isBlue = b > r + 60 && b > 120;
    if (!isBlue) data[i] = data[i + 1] = data[i + 2] = 255;
  }
  await sharp(data, { raw: info }).png({ compressionLevel: 9 }).toFile(output);
}

const horizontal = `${SRC}/omnihack-logo-horizontal.png`;
const stacked = `${SRC}/omnihack-logo-stacked.png`;

// Horizontal lockup (header, sidebar, auth pages): 2× of the ~40px display height.
await sharp(horizontal).resize({ height: 160 }).png({ compressionLevel: 9 }).toFile(`${OUT}/omnihack-logo.png`);
await lightVariant(horizontal, `${OUT}/omnihack-logo-light.png`, Math.round((3931 / 717) * 160));

// Stacked lockup (large brand moments, e.g. empty states, documents).
await sharp(stacked).resize({ width: 640 }).png({ compressionLevel: 9 }).toFile(`${OUT}/omnihack-logo-stacked.png`);
await lightVariant(stacked, `${OUT}/omnihack-logo-stacked-light.png`, 640);

// Symbol only: the upper part of the stacked logo, trimmed and centred on a square canvas.
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
const symbol = await cropToContent(await sharp(stacked).extract({ left: 0, top: 0, width: 1720, height: 725 }).png().toBuffer());
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
