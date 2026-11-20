// Generates PNG app icons from the NEXUS mark. Run: node scripts/icons.mjs
// - icon-192/512: standard ("any") icons
// - maskable-512: extra padding so Android's circle/squircle masks never crop the mark
// - apple-touch-icon: 180 px, opaque background (iOS ignores transparency)
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const BG = '#0d0e11';
const ACCENT = '#d9a54a';

const mark = (size, inset) => {
  // The "N" path scaled into a box of `size` with `inset` padding on each side.
  const s = (size - inset * 2) / 512;
  const t = (x, y) => `${(inset + x * s).toFixed(2)} ${(inset + y * s).toFixed(2)}`;
  const stroke = (44 * s).toFixed(2);
  return `<path d="M${t(156, 360)}V${(inset + 152 * s).toFixed(2)}L${t(356, 360)}V${(inset + 152 * s).toFixed(2)}" fill="none" stroke="${ACCENT}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>`;
};

const rounded = (size) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${BG}"/>${mark(size, 0)}</svg>`;
const fullBleed = (size, inset) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${BG}"/>${mark(size, inset)}</svg>`;

mkdirSync('public/icons', { recursive: true });
const jobs = [
  ['public/icons/icon-192.png', rounded(192)],
  ['public/icons/icon-512.png', rounded(512)],
  // Maskable safe zone is the central 80% circle → keep the mark well inside it.
  ['public/icons/maskable-512.png', fullBleed(512, 512 * 0.14)],
  ['public/icons/apple-touch-icon.png', fullBleed(180, 180 * 0.08)],
];
for (const [file, svg] of jobs) {
  await sharp(Buffer.from(svg)).png().toFile(file);
  console.log('wrote', file);
}
