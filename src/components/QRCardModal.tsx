import React, {useEffect, useState} from 'react';
import {Download, Printer, X} from 'lucide-react';
import {downloadQRCardPNG, generateQRDataUrl, type QRCardPayload} from '../utils/qrCard';

interface QRCardModalProps {
  payload: QRCardPayload | null;
  onClose: () => void;
}

export const QRCardModal: React.FC<QRCardModalProps> = ({payload, onClose}) => {
  const [qrUrl, setQrUrl] = useState<string>('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!payload) return;
    let active = true;
    generateQRDataUrl(payload.qrToken, 280).then((url) => {
      if (active) setQrUrl(url);
    });
    return () => {
      active = false;
    };
  }, [payload]);

  if (!payload) return null;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadQRCardPNG(payload);
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs print:static print:bg-white print:p-0">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xl print:border-slate-300 print:shadow-none">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 print:hidden">
          <h3 className="text-sm font-semibold text-slate-900">Kartu QR Generus</h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
            aria-label="Tutup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="bg-emerald-900 px-5 py-4 text-center text-white border-b-4 border-amber-500">
          <p className="text-[11px] font-semibold tracking-wider text-emerald-200">
            KARTU PRESENSI GENERUS
          </p>
          <p className="mt-0.5 text-base font-bold">Karanganyar Barat</p>
        </div>

        <div className="p-6 text-center">
          <div className="mx-auto inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white p-3">
            {qrUrl ? (
              <img
                src={qrUrl}
                alt={`QR Code ${payload.fullName}`}
                className="h-52 w-52 object-contain"
              />
            ) : (
              <div className="h-52 w-52 animate-pulse rounded bg-slate-100" />
            )}
          </div>

          <h4 className="mt-4 text-lg font-bold text-slate-900">{payload.fullName}</h4>
          <p className="mt-1 text-sm text-slate-600">
            {payload.gender === 'L' ? 'Putra (L)' : 'Putri (P)'} · {payload.kelompokName}
          </p>
          <p className="text-xs text-slate-500">Desa {payload.desaName}</p>

          <p className="mt-4 border-t border-slate-100 pt-3 font-mono text-xs text-slate-500">
            ID: {payload.qrToken}
          </p>
        </div>

        <div className="flex items-center gap-2.5 border-t border-slate-200 bg-slate-50 px-5 py-3.5 print:hidden">
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex flex-1 min-h-[42px] items-center justify-center gap-2 rounded-lg bg-emerald-800 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-900 disabled:opacity-60 whitespace-nowrap cursor-pointer"
          >
            <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{downloading ? 'Menyimpan...' : 'Unduh PNG'}</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap cursor-pointer"
          >
            <Printer className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Cetak</span>
          </button>
        </div>
      </div>
    </div>
  );
};

interface BulkQRPrintModalProps {
  items: QRCardPayload[];
  onClose: () => void;
}

export const BulkQRPrintModal: React.FC<BulkQRPrintModalProps> = ({items, onClose}) => {
  const [qrMap, setQrMap] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    Promise.all(
      items.map(async (item) => [item.qrToken, await generateQRDataUrl(item.qrToken, 180)] as const),
    ).then((entries) => {
      if (active) {
        setQrMap(Object.fromEntries(entries));
      }
    });
    return () => {
      active = false;
    };
  }, [items]);

  if (items.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-xs print:static print:overflow-visible print:bg-white print:p-0">
      <div className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white shadow-xl print:max-w-none print:border-none print:shadow-none">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-3.5 print:hidden">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Cetak Massal Kartu QR ({items.length} Generus)
            </h3>
            <p className="text-xs text-slate-500">
              Siap dicetak pada kertas A4 atau disimpan sebagai PDF dari dialog print browser.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-emerald-800 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-900 whitespace-nowrap cursor-pointer"
            >
              <Printer className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Cetak Semua</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
              aria-label="Tutup"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 md:grid-cols-3 print:grid-cols-3 print:gap-3 print:p-2">
          {items.map((item) => (
            <div
              key={item.qrToken}
              className="break-inside-avoid rounded-xl border border-slate-300 bg-white p-4 text-center"
            >
              <p className="text-[10px] font-semibold tracking-wider text-emerald-800">
                PRESENSI GENERUS · KARANGANYAR BARAT
              </p>
              <div className="my-2.5 flex justify-center">
                {qrMap[item.qrToken] ? (
                  <img
                    src={qrMap[item.qrToken]}
                    alt={`QR ${item.fullName}`}
                    className="h-32 w-32 object-contain"
                  />
                ) : (
                  <div className="h-32 w-32 bg-slate-100" />
                )}
              </div>
              <p className="text-sm font-bold text-slate-900 truncate">{item.fullName}</p>
              <p className="text-xs text-slate-600 truncate">
                {item.gender === 'L' ? 'Putra' : 'Putri'} · {item.kelompokName}
              </p>
              <p className="text-[11px] text-slate-500 truncate">Desa {item.desaName}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
