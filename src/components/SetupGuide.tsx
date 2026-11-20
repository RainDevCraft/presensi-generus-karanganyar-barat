import React, {useState} from 'react';
import {Check, Copy, Database, Download, ExternalLink, KeyRound, ShieldCheck} from 'lucide-react';
import schemaSql from '../../supabase/schema.sql?raw';
import {PWAInstallButton} from './PWAInstallButton';

export const SetupGuide: React.FC = () => {
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedRedirect, setCopiedRedirect] = useState(false);

  const originUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const handleCopySql = async () => {
    await navigator.clipboard.writeText(schemaSql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  const handleDownloadSql = () => {
    const blob = new Blob([schemaSql], {type: 'text/sql;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'schema.sql';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyRedirect = async () => {
    await navigator.clipboard.writeText(originUrl);
    setCopiedRedirect(true);
    setTimeout(() => setCopiedRedirect(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
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

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold tracking-wide text-emerald-800">
            Fase 1 · Pengaturan Awal Supabase &amp; Google Auth
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl text-balance">
            Hubungkan Project Supabase untuk Mengaktifkan Aplikasi
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
            Fondasi PWA dan skema database sudah siap. Aplikasi mendeteksi bahwa
            variabel lingkungan <code className="rounded bg-slate-200/70 px-1.5 py-0.5 text-xs">VITE_SUPABASE_URL</code> dan{' '}
            <code className="rounded bg-slate-200/70 px-1.5 py-0.5 text-xs">VITE_SUPABASE_ANON_KEY</code> belum diatur.
            Ikuti 4 langkah gratis berikut untuk menghubungkannya.
          </p>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800 shrink-0">
                <Database className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  1. Buat Project &amp; Jalankan Skema SQL
                </h2>
                <p className="text-xs text-slate-500">
                  Gratis di Supabase Free Plan
                </p>
              </div>
            </div>
            <ol className="mt-4 space-y-2.5 text-sm text-slate-600 list-decimal pl-5">
              <li>
                Buat project baru di{' '}
                <a
                  href="https://supabase.com/dashboard"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-emerald-800 underline underline-offset-2"
                >
                  Supabase Dashboard
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
                .
              </li>
              <li>
                Buka menu <strong>SQL Editor</strong> → <strong>New Query</strong>.
              </li>
              <li>
                Salin atau unduh skrip <code className="text-xs">schema.sql</code> di bawah, ganti bagian email{' '}
                <strong>Super Admin</strong> di baris paling bawah dengan email Google Anda, lalu klik{' '}
                <strong>Run</strong>.
              </li>
            </ol>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleCopySql}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-emerald-800 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-900 whitespace-nowrap cursor-pointer"
              >
                {copiedSql ? (
                  <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4 shrink-0" aria-hidden="true" />
                )}
                <span>{copiedSql ? 'Skrip SQL Tersalin' : 'Salin schema.sql'}</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadSql}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap cursor-pointer"
              >
                <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Unduh schema.sql</span>
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800 shrink-0">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  2. Aktifkan Google Sign-In (Opsi A)
                </h2>
                <p className="text-xs text-slate-500">
                  100% gratis lewat Google Cloud Console
                </p>
              </div>
            </div>
            <ol className="mt-4 space-y-2.5 text-sm text-slate-600 list-decimal pl-5">
              <li>
                Di Supabase, buka <strong>Authentication → Providers → Google</strong> dan aktifkan.
              </li>
              <li>
                Salin <strong>Callback URL</strong> dari Supabase ke <em>Authorized redirect URIs</em> di Google Cloud OAuth Client, lalu tempel Client ID &amp; Secret ke Supabase.
              </li>
              <li>
                Di Supabase <strong>Authentication → URL Configuration</strong>, masukkan URL aplikasi ini ke <em>Site URL</em> &amp; <em>Redirect URLs</em>:
              </li>
            </ol>

            {originUrl && (
              <div className="mt-4 flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <code className="truncate text-xs text-slate-800">{originUrl}</code>
                <button
                  type="button"
                  onClick={handleCopyRedirect}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 shrink-0 cursor-pointer"
                >
                  {copiedRedirect ? (
                    <Check className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  <span>{copiedRedirect ? 'Tersalin' : 'Salin URL'}</span>
                </button>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800 shrink-0">
                <KeyRound className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  3. Pasang Environment Variables (.env / Secrets)
                </h2>
                <p className="text-xs text-slate-500">
                  Ambil dari Supabase → Project Settings → API (Project URL &amp; anon public key)
                </p>
              </div>
            </div>
            <pre className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
{`VITE_SUPABASE_URL="https://PROJECT_ID_ANDA.supabase.co"
VITE_SUPABASE_ANON_KEY="eyJ..."`}
            </pre>
            <p className="mt-3 text-xs text-slate-500">
              Untuk menjaga keamanan repository GitHub, pastikan hanya menyalin kunci{' '}
              <strong className="text-slate-700">anon public</strong> ke <code className="text-slate-700">.env</code> lokal atau Secrets platform hosting, dan jangan pernah melakukan commit file <code className="text-slate-700">.env</code>.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
};
