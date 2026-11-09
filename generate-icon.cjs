/**
 * Script autonome qui génère :
 * 1. public/logo.svg (Logo vectoriel de Contrée Royale)
 * 2. public/icon.ico (Icône Windows 256x256 officielle pour le fichier .exe)
 *
 * Exécution : node generate-icon.cjs
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 1. GÉNÉRATION DU LOGO SVG (Pour le web / README / interface)
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <defs>
    <radialGradient id="felt" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="#059669" />
      <stop offset="70%" stop-color="#065f46" />
      <stop offset="100%" stop-color="#022c22" />
    </radialGradient>
    <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fde047" />
      <stop offset="50%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#b45309" />
    </linearGradient>
  </defs>
  <!-- Fond écusson tapis vert -->
  <rect x="12" y="12" width="232" height="232" rx="54" fill="url(#felt)" stroke="url(#gold)" stroke-width="12" />
  <rect x="26" y="26" width="204" height="204" rx="42" fill="none" stroke="#fde047" stroke-opacity="0.35" stroke-width="3" />
  
  <!-- Carte blanche centrale légèrement inclinée -->
  <g transform="translate(128, 136) rotate(-6) translate(-58, -74)">
    <rect x="0" y="0" width="116" height="148" rx="16" fill="#ffffff" stroke="#e7e5e4" stroke-width="4" />
    <!-- 4 symboles -->
    <text x="32" y="54" font-family="Arial, sans-serif" font-size="42" font-weight="bold" fill="#0f172a" text-anchor="middle">♠</text>
    <text x="84" y="54" font-family="Arial, sans-serif" font-size="42" font-weight="bold" fill="#dc2626" text-anchor="middle">♥</text>
    <text x="32" y="118" font-family="Arial, sans-serif" font-size="42" font-weight="bold" fill="#dc2626" text-anchor="middle">♦</text>
    <text x="84" y="118" font-family="Arial, sans-serif" font-size="42" font-weight="bold" fill="#0f172a" text-anchor="middle">♣</text>
  </g>

  <!-- Couronne Royale Dorée en haut -->
  <path d="M68 74 L84 40 L128 62 L172 40 L188 74 Z" fill="url(#gold)" stroke="#ffffff" stroke-width="3" stroke-linejoin="round" />
  <circle cx="84" cy="36" r="6" fill="#fde047" />
  <circle cx="128" cy="32" r="7" fill="#fde047" />
  <circle cx="172" cy="36" r="6" fill="#fde047" />
</svg>`;

fs.writeFileSync(path.join(publicDir, 'logo.svg'), svgContent, 'utf8');

// 2. GÉNÉRATION D'UNE VRAIE ICÔNE .ICO (256x256 PNG encapsulé dans ICO) SANS DÉPENDANCE EXTERNE
const W = 256;
const H = 256;
const rgba = Buffer.alloc(W * H * 4, 0);

function setPixel(x, y, r, g, b, a = 255) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const idx = (y * W + x) * 4;
  if (a < 255 && rgba[idx + 3] > 0) {
    const alpha = a / 255;
    rgba[idx] = Math.round(r * alpha + rgba[idx] * (1 - alpha));
    rgba[idx + 1] = Math.round(g * alpha + rgba[idx + 1] * (1 - alpha));
    rgba[idx + 2] = Math.round(b * alpha + rgba[idx + 2] * (1 - alpha));
    rgba[idx + 3] = 255;
  } else {
    rgba[idx] = r;
    rgba[idx + 1] = g;
    rgba[idx + 2] = b;
    rgba[idx + 3] = a;
  }
}

function insideRoundedRect(x, y, x0, y0, w, h, rad) {
  if (x < x0 || x >= x0 + w || y < y0 || y >= y0 + h) return false;
  const cx = Math.max(x0 + rad, Math.min(x, x0 + w - rad - 1));
  const cy = Math.max(y0 + rad, Math.min(y, y0 + h - rad - 1));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= rad * rad;
}

// Dessin du blason vert émeraude à bordure dorée
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (insideRoundedRect(x, y, 10, 10, 236, 236, 52)) {
      const isInner = insideRoundedRect(x, y, 22, 22, 212, 212, 42);
      if (!isInner) {
        // Bordure Or Royale
        const grad = (x + y) / 512;
        const r = Math.round(253 * (1 - grad) + 217 * grad);
        const g = Math.round(224 * (1 - grad) + 119 * grad);
        const b = Math.round(71 * (1 - grad) + 6 * grad);
        setPixel(x, y, r, g, b, 255);
      } else {
        // Tapis vert feutré dégradé radial
        const dx = (x - 128) / 128;
        const dy = (y - 128) / 128;
        const dist = Math.min(1, Math.sqrt(dx * dx + dy * dy));
        const r = Math.round(16 * (1 - dist) + 2 * dist);
        const g = Math.round(145 * (1 - dist) + 44 * dist);
        const b = Math.round(105 * (1 - dist) + 34 * dist);
        setPixel(x, y, r, g, b, 255);
      }
    }
  }
}

// Dessin de la carte centrale blanche (avec ombre douce)
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (insideRoundedRect(x, y, 68, 78, 128, 152, 20)) {
      setPixel(x, y, 0, 0, 0, 95);
    }
    if (insideRoundedRect(x, y, 64, 72, 128, 152, 20)) {
      const innerCard = insideRoundedRect(x, y, 68, 76, 120, 144, 16);
      if (!innerCard) {
        setPixel(x, y, 245, 158, 11, 255); // Liseré doré autour de la carte
      } else {
        setPixel(x, y, 255, 255, 255, 255);
      }
    }
  }
}

// Dessin d'un grand Carreau Rouge ♦ et Pique Noir ♠ stylisés au centre de la carte
for (let y = 76; y < 220; y++) {
  for (let x = 68; x < 188; x++) {
    // Grand Carreau rouge au centre (symbole emblématique des jeux de cartes)
    const dx = Math.abs(x - 128);
    const dy = Math.abs(y - 148);
    if (dx * 1.25 + dy <= 42) {
      setPixel(x, y, 220, 38, 38, 255);
    } else if (dx * 1.25 + dy <= 46) {
      setPixel(x, y, 251, 191, 36, 255);
    }
  }
}

// Dessin de la Couronne Dorée Royale au sommet (y: 30..66, x: 72..184)
for (let y = 32; y <= 66; y++) {
  for (let x = 72; x <= 184; x++) {
    const ny = (66 - y) / 34; // 0 en bas de la couronne, 1 en haut
    const nx = (x - 72) / 112; // 0 à gauche, 1 à droite
    // 3 pics de couronne (gauche, centre, droite)
    const peak1 = Math.max(0, 1 - Math.abs(nx - 0.12) * 5.5);
    const peak2 = Math.max(0, 1 - Math.abs(nx - 0.5) * 4.5);
    const peak3 = Math.max(0, 1 - Math.abs(nx - 0.88) * 5.5);
    const crownHeight = Math.max(0.28, peak1, peak2, peak3);
    if (ny <= crownHeight) {
      setPixel(x, y, 251, 191, 36, 255);
    }
  }
}

// Encodage PNG minimaliste (Chunk IHDR + IDAT + IEND) puis encapsulation ICO
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) {
    c = (c >>> 8) ^ crcTable[(c ^ buf[i]) & 0xff];
  }
  return (c ^ -1) >>> 0;
}
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const combined = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(combined), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

const rawScanlines = Buffer.alloc(H * (W * 4 + 1));
for (let y = 0; y < H; y++) {
  rawScanlines[y * (W * 4 + 1)] = 0; // Filtre None
  rgba.copy(rawScanlines, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // 8 bits
ihdr[9] = 6; // RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const idatData = zlib.deflateSync(rawScanlines);
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const pngBuffer = Buffer.concat([
  pngSignature,
  makeChunk('IHDR', ihdr),
  makeChunk('IDAT', idatData),
  makeChunk('IEND', Buffer.alloc(0))
]);

// En-tête ICO (6 octets ICONDIR + 16 octets ICONDIRENTRY)
const icoHeader = Buffer.alloc(22);
icoHeader.writeUInt16LE(0, 0); // Réservé
icoHeader.writeUInt16LE(1, 2); // Type 1 = ICO
icoHeader.writeUInt16LE(1, 4); // 1 image
icoHeader[6] = 0; // Largeur 256 (0 = 256)
icoHeader[7] = 0; // Hauteur 256 (0 = 256)
icoHeader[8] = 0;
icoHeader[9] = 0;
icoHeader.writeUInt16LE(1, 10); // Color planes
icoHeader.writeUInt16LE(32, 12); // 32 bits par pixel
icoHeader.writeUInt32LE(pngBuffer.length, 14); // Taille du PNG
icoHeader.writeUInt32LE(22, 18); // Offset du PNG

const icoBuffer = Buffer.concat([icoHeader, pngBuffer]);
fs.writeFileSync(path.join(publicDir, 'icon.ico'), icoBuffer);

console.log('✅ Logo généré avec succès dans public/icon.ico et public/logo.svg !');