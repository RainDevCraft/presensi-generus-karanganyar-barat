import QRCode from 'qrcode';
import {createZipBlob, type ZipEntry} from './zipBuilder';

export interface QRCardPayload {
  fullName: string;
  gender: 'L' | 'P';
  desaName: string;
  kelompokName: string;
  qrToken: string;
}

export async function generateQRDataUrl(token: string, size = 320): Promise<string> {
  return QRCode.toDataURL(token, {
    width: size,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#0F172A',
      light: '#FFFFFF',
    },
  });
}

export async function renderQRCardPNGBlob(payload: QRCardPayload): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 820;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D tidak tersedia di browser.');
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#064E3B';
  ctx.fillRect(0, 0, canvas.width, 136);

  ctx.fillStyle = '#D97706';
  ctx.fillRect(0, 136, canvas.width, 6);

  ctx.fillStyle = '#A7F3D0';
  ctx.font = '600 18px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('KARTU PRESENSI GENERUS', canvas.width / 2, 54);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 28px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Karanganyar Barat', canvas.width / 2, 96);

  const qrDataUrl = await generateQRDataUrl(payload.qrToken, 360);
  const qrImg = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = qrDataUrl;
  });

  const qrSize = 340;
  const qrX = (canvas.width - qrSize) / 2;
  const qrY = 184;
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 2;
  ctx.strokeRect(qrX - 16, qrY - 16, qrSize + 32, qrSize + 32);
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  ctx.fillStyle = '#0F172A';
  ctx.font = '700 30px "Plus Jakarta Sans", sans-serif';
  const maxWidth = 540;
  ctx.fillText(payload.fullName.trim(), canvas.width / 2, 608, maxWidth);

  ctx.fillStyle = '#475569';
  ctx.font = '500 22px "Plus Jakarta Sans", sans-serif';
  const genderLabel = payload.gender === 'L' ? 'Putra (L)' : 'Putri (P)';
  ctx.fillText(`${genderLabel} · ${payload.kelompokName}`, canvas.width / 2, 652, maxWidth);
  ctx.fillText(`Desa ${payload.desaName}`, canvas.width / 2, 686, maxWidth);

  ctx.strokeStyle = '#E2E8F0';
  ctx.beginPath();
  ctx.moveTo(64, 730);
  ctx.lineTo(canvas.width - 64, 730);
  ctx.stroke();

  ctx.fillStyle = '#64748B';
  ctx.font = '500 16px "JetBrains Mono", monospace';
  ctx.fillText(`ID: ${payload.qrToken}`, canvas.width / 2, 772);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Gagal mengonversi kartu QR menjadi PNG.'));
    }, 'image/png');
  });
}

function sanitizeSegment(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'item'
  );
}

export async function downloadQRCardPNG(payload: QRCardPayload): Promise<void> {
  const blob = await renderQRCardPNGBlob(payload);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `qr-${sanitizeSegment(payload.fullName)}.png`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

export async function downloadBulkQRZip(
  items: QRCardPayload[],
  onProgress?: (current: number, total: number) => void,
): Promise<void> {
  const entries: ZipEntry[] = [];
  const usedPaths = new Set<string>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    onProgress?.(i + 1, items.length);
    const blob = await renderQRCardPNGBlob(item);
    const bytes = new Uint8Array(await blob.arrayBuffer());

    const folder = `${sanitizeSegment(item.desaName)}/${sanitizeSegment(item.kelompokName)}`;
    const baseName = sanitizeSegment(item.fullName);
    let filePath = `${folder}/${baseName}.png`;
    if (usedPaths.has(filePath)) {
      filePath = `${folder}/${baseName}-${item.qrToken.slice(0, 6)}.png`;
    }
    usedPaths.add(filePath);
    entries.push({path: filePath, data: bytes});
  }

  const zipBlob = createZipBlob(entries);
  const url = URL.createObjectURL(zipBlob);
  const link = document.createElement('a');
  link.download = `kartu-qr-generus-${new Date().toISOString().slice(0, 10)}.zip`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}
