import React, {useState} from 'react';
import {AlertCircle, ShieldCheck} from 'lucide-react';
import {useAuth} from '../context/AuthContext';
import {PWAInstallButton} from './PWAInstallButton';

export const LoginScreen: React.FC = () => {
  const {signInWithGoogle, errorMessage} = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async () => {
    setSubmitting(true);
    try {
      await signInWithGoogle();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/icon.svg"
              alt="Logo Presensi Generus"
              className="h-9 w-9 rounded-lg shrink-0"
            />
            <span className="text-base font-bold tracking-tight text-slate-900 truncate">
              Presensi Generus
            </span>
          </div>
          <PWAInstallButton />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <p className="text-xs font-medium text-slate-500">
            Daerah Karanganyar Barat · Sistem Absensi Pengajian
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 text-balance">
            Masuk ke Panel Pengurus &amp; Pamong
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Gunakan akun Google yang sudah didaftarkan oleh Admin wilayah Anda.
            Hak akses dan cakupan wilayah diatur otomatis berdasarkan peran.
          </p>

          {errorMessage && (
            <div
              role="alert"
              className="mt-5 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleLogin}
            disabled={submitting}
            className="mt-6 flex w-full min-h-[48px] items-center justify-center gap-3 rounded-xl bg-emerald-800 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-900 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 cursor-pointer"
          >
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27c3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10c5.35 0 9.25-3.67 9.25-9.09c0-1.15-.15-1.81-.15-1.81Z"
              />
            </svg>
            <span>{submitting ? 'Mengarahkan ke Google...' : 'Masuk dengan Google'}</span>
          </button>

          <div className="mt-6 border-t border-slate-100 pt-5 flex items-start gap-2.5 text-xs text-slate-500">
            <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-emerald-700" aria-hidden="true" />
            <span>
              Akses tertutup berbasis whitelist email. Pendaftaran mandiri ditutup
              untuk menjaga kerahasiaan data peserta dan catatan kehadiran.
            </span>
          </div>
        </div>
      </main>
    </div>
  );
};
