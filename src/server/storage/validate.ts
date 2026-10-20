// Upload validation: extension allow-list, declared size limit, and magic-byte sniffing so a
// renamed executable cannot pass as a PDF. Uploaded files are always treated as untrusted and are
// served with Content-Disposition: attachment and X-Content-Type-Options: nosniff.

type FileKind = { mime: string; magic?: (b: Buffer) => boolean; image?: boolean };

const isZip = (b: Buffer) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5 || b[2] === 7);
const isPdf = (b: Buffer) => b.subarray(0, 5).toString("latin1") === "%PDF-";
const isPng = (b: Buffer) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
const isJpg = (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const isWebp = (b: Buffer) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP";
const isText = (b: Buffer) => !b.subarray(0, 4096).includes(0);

export const ALLOWED: Record<string, FileKind> = {
  pdf: { mime: "application/pdf", magic: isPdf },
  pptx: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", magic: isZip },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", magic: isZip },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", magic: isZip },
  zip: { mime: "application/zip", magic: isZip },
  png: { mime: "image/png", magic: isPng, image: true },
  jpg: { mime: "image/jpeg", magic: isJpg, image: true },
  jpeg: { mime: "image/jpeg", magic: isJpg, image: true },
  webp: { mime: "image/webp", magic: isWebp, image: true },
  txt: { mime: "text/plain", magic: isText },
  md: { mime: "text/markdown", magic: isText },
};

export const ACCEPT_ATTR = Object.keys(ALLOWED)
  .map((e) => `.${e}`)
  .join(",");

export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  return base.replace(/[^\w.\- ()]+/g, "_").slice(0, 120) || "file";
}

export function validateUpload(
  fileName: string,
  data: Buffer,
  maxBytes: number,
  opts: { imagesOnly?: boolean } = {},
): { ok: true; mime: string; ext: string } | { ok: false; error: string } {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  const kind = ALLOWED[ext];
  if (!kind) return { ok: false, error: `File type .${ext || "?"} is not allowed.` };
  if (opts.imagesOnly && !kind.image) return { ok: false, error: "Only PNG, JPG or WebP images are allowed here." };
  if (data.length === 0) return { ok: false, error: `${fileName} is empty or the upload was interrupted.` };
  if (data.length > maxBytes) return { ok: false, error: `${fileName} exceeds the ${Math.round(maxBytes / 1048576)} MB limit.` };
  if (kind.magic && !kind.magic(data)) return { ok: false, error: `${fileName} does not match its file type.` };
  return { ok: true, mime: kind.mime, ext };
}
