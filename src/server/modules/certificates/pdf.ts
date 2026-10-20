// Certificate PDF rendering with pdf-lib (pure JS) and an embedded QR code linking to /verify/<code>.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import QRCode from "qrcode";
import { brand } from "@/config/brand";

const CATEGORY_TEXT: Record<string, string> = {
  PARTICIPANT: "for participating in",
  FINALIST: "for being selected as a finalist in",
  WINNER: "for winning",
  MENTOR: "for mentoring participants in",
  JUDGE: "for serving on the jury of",
  VOLUNTEER: "for volunteering at",
  ORGANIZER: "for organizing",
};

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

let logoPng: Promise<Uint8Array | null> | null = null;
/** The official horizontal logo (public/brand); null if the file is missing so certificates still render. */
function loadLogo() {
  logoPng ??= readFile(path.join(process.cwd(), "public", "brand", "omnihack-logo.png")).catch(() => null);
  return logoPng;
}

export type CertificatePdfInput = {
  code: string;
  recipientName: string;
  category: string;
  distinction: string;
  competitionTitle: string;
  organizerName: string;
  issuedAt: Date;
  revoked: boolean;
  template?: { heading: string; bodyText: string; signatoryName: string; signatoryTitle: string; accentColor: string } | null;
  appUrl: string;
};

export async function renderCertificatePdf(input: CertificatePdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${brand.name} certificate ${input.code}`);
  doc.setAuthor(brand.name);
  doc.setSubject(input.competitionTitle);
  const page = doc.addPage([842, 595]); // A4 landscape
  const { width, height } = page.getSize();
  const serif = await doc.embedFont(StandardFonts.TimesRomanBold);
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const sansBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const accent = hexToRgb(input.template?.accentColor ?? brand.colors.primary);
  const ink = rgb(0.043, 0.063, 0.125);
  const muted = rgb(0.42, 0.44, 0.52);

  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: 24, y: 24, width: width - 48, height: height - 48, borderColor: accent, borderWidth: 2 });
  page.drawRectangle({ x: 32, y: 32, width: width - 64, height: height - 64, borderColor: rgb(0.85, 0.86, 0.92), borderWidth: 0.75 });
  page.drawRectangle({ x: 24, y: height - 34, width: width - 48, height: 10, color: accent });

  // Official logo (horizontal lockup), falling back to the plain name
  const logoBytes = await loadLogo();
  if (logoBytes) {
    const logo = await doc.embedPng(logoBytes);
    const h = 30;
    page.drawImage(logo, { x: 58, y: height - 88, width: (logo.width / logo.height) * h, height: h });
  } else {
    page.drawText(brand.name, { x: 58, y: height - 82, size: 18, font: sansBold, color: ink });
  }

  const center = (text: string, y: number, size: number, font = sans, color = ink) => {
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (width - w) / 2, y, size, font, color });
  };
  const fit = (text: string, maxWidth: number, size: number, font = sans) => {
    let s = size;
    while (s > 10 && font.widthOfTextAtSize(text, s) > maxWidth) s -= 1;
    return s;
  };

  center((input.template?.heading || "Certificate of Achievement").toUpperCase(), height - 150, 26, serif, ink);
  center("This certifies that", height - 195, 13, sans, muted);
  center(input.recipientName, height - 245, fit(input.recipientName, width - 200, 36, serif), serif, accent);
  page.drawLine({ start: { x: width / 2 - 180, y: height - 258 }, end: { x: width / 2 + 180, y: height - 258 }, thickness: 0.75, color: rgb(0.8, 0.81, 0.88) });
  const line = `${CATEGORY_TEXT[input.category] ?? "for taking part in"}${input.distinction ? ` ${input.distinction} in` : ""}`;
  center(line, height - 290, 13, sans, muted);
  center(input.competitionTitle, height - 320, fit(input.competitionTitle, width - 200, 20, sansBold), sansBold, ink);
  center(`organized by ${input.organizerName}`, height - 344, 12, sans, muted);
  if (input.template?.bodyText)
    center(input.template.bodyText.slice(0, 140), height - 372, fit(input.template.bodyText.slice(0, 140), width - 220, 11), sans, muted);

  // Footer: issue date, signatory, QR + code
  const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(input.issuedAt);
  page.drawText("Issued", { x: 80, y: 120, size: 9, font: sans, color: muted });
  page.drawText(date, { x: 80, y: 104, size: 12, font: sansBold, color: ink });
  if (input.template?.signatoryName) {
    page.drawLine({ start: { x: 300, y: 118 }, end: { x: 520, y: 118 }, thickness: 0.75, color: muted });
    page.drawText(input.template.signatoryName, { x: 300, y: 102, size: 11, font: sansBold, color: ink });
    if (input.template.signatoryTitle) page.drawText(input.template.signatoryTitle, { x: 300, y: 88, size: 9, font: sans, color: muted });
  }
  const verifyUrl = `${input.appUrl.replace(/\/$/, "")}/verify/${input.code}`;
  const qrPng = await QRCode.toBuffer(verifyUrl, { margin: 1, width: 240, errorCorrectionLevel: "M" });
  const qr = await doc.embedPng(qrPng);
  page.drawImage(qr, { x: width - 170, y: 70, width: 92, height: 92 });
  page.drawText(`ID ${input.code}`, { x: width - 300, y: 112, size: 10, font: sansBold, color: ink });
  page.drawText("Verify at", { x: width - 300, y: 96, size: 8, font: sans, color: muted });
  page.drawText(verifyUrl.replace(/^https?:\/\//, "").slice(0, 40), { x: width - 300, y: 84, size: 8, font: sans, color: muted });

  if (input.revoked) {
    page.drawText("REVOKED", { x: width / 2 - 170, y: height / 2 - 40, size: 90, font: sansBold, color: rgb(0.86, 0.15, 0.15), opacity: 0.25 });
  }
  return doc.save();
}
