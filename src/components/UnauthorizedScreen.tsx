import React, {useState} from 'react';
import {LogOut, RefreshCw, ShieldAlert} from 'lucide-react';
import {useAuth} from '../context/AuthContext';

export const UnauthorizedScreen: React.FC = () => {
  const {unauthorizedEmail, unauthorizedReason, signOut, refreshProfile} = useAuth();
  const [checking, setChecking] = useState(false);

  const handleRecheck = async () => {
    setChecking(true);
    try {
      await refreshProfile();
    } finally {
      setChecking(false);
    }
  };

  const isInactive = unauthorizedReason === 'inactive';

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
          <ShieldAlert className="h-6 w-6" aria-hidden="true" />
        </div>

        <h1 className="mt-4 text-xl font-bold tracking-tight text-slate-900">
          {isInactive ? 'Akun Sedang Dinonaktifkan' : 'Email Belum Terdaftar'}
        </h1>

        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          {isInactive
            ? 'Akses untuk akun ini sedang dinonaktifkan oleh Admin atasan.'
            : 'Email Google Anda belum dimasukkan ke daftar pengurus oleh Super Admin, Admin Daerah, atau Admin Desa.'}
        </p>

        {unauthorizedEmail && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5">
            <p className="text-xs text-slate-500">Email yang digunakan saat ini</p>
            <p className="mt-0.5 font-mono text-xs font-medium text-slate-900 break-all">
              {unauthorizedEmail}
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
          <button
            type="button"
            onClick={handleRecheck}
            disabled={checking}
            className="inline-flex flex-1 min-h-[44px] items-center justify-center gap-2 rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-60 cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>{checking ? 'Memeriksa...' : 'Periksa Ulang'}</span>
          </button>
          <button
            type="button"
            onClick={signOut}
            className="inline-flex flex-1 min-h-[44px] items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span>Ganti Akun</span>
          </button>
        </div>
      </div>
    </div>
  );
};
