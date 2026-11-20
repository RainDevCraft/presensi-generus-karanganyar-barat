import React, {useEffect, useRef, useState} from 'react';
import {AlertCircle, Camera, CameraOff, CheckCircle2, Keyboard, QrCode} from 'lucide-react';
import type {Html5Qrcode} from 'html5-qrcode';

export interface ScanFeedback {
  kind: 'success' | 'duplicate' | 'error';
  title: string;
  detail: string;
  timestamp: string;
}

interface QRScannerPanelProps {
  onScanToken: (token: string) => Promise<ScanFeedback>;
  recentScans: ScanFeedback[];
}

export const QRScannerPanel: React.FC<QRScannerPanelProps> = ({onScanToken, recentScans}) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanRef = useRef<{token: string; time: number}>({token: '', time: 0});
  const processingRef = useRef(false);
  const onScanTokenRef = useRef(onScanToken);
  onScanTokenRef.current = onScanToken;

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualToken, setManualToken] = useState('');
  const [submittingManual, setSubmittingManual] = useState(false);
  const [lastFeedback, setLastFeedback] = useState<ScanFeedback | null>(null);

  const stopCamera = async () => {
    const instance = scannerRef.current;
    scannerRef.current = null;
    if (instance) {
      try {
        if (instance.isScanning) {
          await instance.stop();
        }
        instance.clear();
      } catch {
        // Ignore cleanup errors
      }
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => {
      void stopCamera();
    };
  }, []);

  const handleDecodedToken = async (rawText: string) => {
    const token = rawText.trim();
    if (!token) return;

    const now = Date.now();
    if (lastScanRef.current.token === token && now - lastScanRef.current.time < 2500) {
      return;
    }
    if (processingRef.current) return;

    processingRef.current = true;
    lastScanRef.current = {token, time: now};

    try {
      const result = await onScanTokenRef.current(token);
      setLastFeedback(result);
    } finally {
      processingRef.current = false;
    }
  };

  const startCamera = async () => {
    if (cameraBusy || cameraActive) return;
    setCameraBusy(true);
    setCameraError(null);

    try {
      const {Html5Qrcode: Html5QrcodeClass} = await import('html5-qrcode');
      const instance = new Html5QrcodeClass('qr-reader-viewport');
      scannerRef.current = instance;

      await instance.start(
        {facingMode: 'environment'},
        {
          fps: 10,
          qrbox: {width: 240, height: 240},
          aspectRatio: 1.0,
        },
        (decodedText) => {
          void handleDecodedToken(decodedText);
        },
        () => {
          // Ignore frame-by-frame no-QR decode noise
        },
      );

      setCameraActive(true);
    } catch (err) {
      await stopCamera();
      const message =
        err instanceof Error
          ? err.message
          : 'Kamera tidak dapat diakses. Pastikan izin kamera aktif dan dibuka lewat HTTPS.';
      setCameraError(message);
    } finally {
      setCameraBusy(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = manualToken.trim();
    if (!token || submittingManual) return;

    setSubmittingManual(true);
    try {
      const result = await onScanTokenRef.current(token);
      setLastFeedback(result);
      if (result.kind !== 'error') {
        setManualToken('');
      }
    } finally {
      setSubmittingManual(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Scanner Viewport */}
      <section className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Mode Scanner Kamera (HP 1)
            </h3>
            <p className="text-xs text-slate-500">
              Arahkan kamera ke kartu QR generus. Scan langsung tercatat real-time ke HP pemantau.
            </p>
          </div>

          {!cameraActive ? (
            <button
              type="button"
              onClick={startCamera}
              disabled={cameraBusy}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-60 cursor-pointer"
            >
              <Camera className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{cameraBusy ? 'Membuka Kamera...' : 'Mulai Kamera Scan'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={stopCamera}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-800 hover:bg-red-100 cursor-pointer"
            >
              <CameraOff className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Hentikan Kamera</span>
            </button>
          )}
        </div>

        {cameraError && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" aria-hidden="true" />
            <span>{cameraError}</span>
          </div>
        )}

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
          <div id="qr-reader-viewport" className="w-full min-h-[260px]" />
          {!cameraActive && (
            <div className="flex flex-col items-center justify-center px-6 py-10 text-center text-slate-300">
              <QrCode className="h-10 w-10 text-emerald-400" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-white">
                Kamera Scanner Belum Aktif
              </p>
              <p className="mt-1 max-w-xs text-xs text-slate-400">
                Tekan tombol Mulai Kamera Scan di atas dan izinkan akses kamera pada browser HP.
              </p>
            </div>
          )}
        </div>

        {/* Last Scan Result Banner */}
        {lastFeedback && (
          <div
            role="status"
            aria-live="polite"
            className={`mt-4 flex items-start gap-3 rounded-xl border p-4 ${
              lastFeedback.kind === 'success'
                ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
                : lastFeedback.kind === 'duplicate'
                  ? 'border-amber-300 bg-amber-50 text-amber-950'
                  : 'border-red-300 bg-red-50 text-red-950'
            }`}
          >
            {lastFeedback.kind === 'error' ? (
              <AlertCircle className="h-5 w-5 shrink-0 text-red-600 mt-0.5" aria-hidden="true" />
            ) : (
              <CheckCircle2
                className={`h-5 w-5 shrink-0 mt-0.5 ${
                  lastFeedback.kind === 'success' ? 'text-emerald-700' : 'text-amber-700'
                }`}
                aria-hidden="true"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{lastFeedback.title}</p>
              <p className="mt-0.5 text-xs opacity-90">{lastFeedback.detail}</p>
            </div>
            <span className="font-mono text-[11px] opacity-75 shrink-0">
              {lastFeedback.timestamp}
            </span>
          </div>
        )}

        {/* Manual Fallback Input */}
        <form onSubmit={handleManualSubmit} className="mt-5 border-t border-slate-100 pt-4">
          <label
            htmlFor="manual-qr-token"
            className="flex items-center gap-1.5 text-xs font-medium text-slate-600"
          >
            <Keyboard className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Input Manual ID QR (jika kamera terkendala pencahayaan)</span>
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="manual-qr-token"
              type="text"
              value={manualToken}
              onChange={(e) => setManualToken(e.target.value)}
              placeholder="Tempel atau ketik ID token QR..."
              className="flex-1 min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-emerald-700 focus:outline-none"
            />
            <button
              type="submit"
              disabled={submittingManual || !manualToken.trim()}
              className="inline-flex min-h-[42px] items-center rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              {submittingManual ? 'Memproses...' : 'Catat Hadir'}
            </button>
          </div>
        </form>
      </section>

      {/* Recent Scans Feed */}
      <section className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <h3 className="text-base font-semibold text-slate-900">
          Riwayat Scan Sesi Ini
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Menampilkan hasil scan terbaru pada perangkat ini untuk memastikan data masuk.
        </p>

        {recentScans.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
            Belum ada kartu QR yang di-scan pada sesi ini.
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {recentScans.map((scan, idx) => (
              <li key={`${scan.timestamp}-${idx}`} className="py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p
                    className={`text-sm font-semibold truncate ${
                      scan.kind === 'success'
                        ? 'text-emerald-900'
                        : scan.kind === 'duplicate'
                          ? 'text-amber-900'
                          : 'text-red-800'
                    }`}
                  >
                    {scan.title}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600">{scan.detail}</p>
                </div>
                <span className="font-mono text-[11px] text-slate-400 shrink-0">
                  {scan.timestamp}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
