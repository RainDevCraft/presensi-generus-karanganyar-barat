import React, {useEffect, useState} from 'react';
import {
  CalendarCheck,
  FileText,
  LayoutDashboard,
  LogOut,
  MapPin,
  QrCode,
  ShieldCheck,
  Users,
} from 'lucide-react';
import {useAuth} from '../context/AuthContext';
import {supabase} from '../lib/supabase';
import {ROLE_LABELS} from '../types/database';
import {EventsManager} from './EventsManager';
import {GenerusManager} from './GenerusManager';
import {PWAInstallButton} from './PWAInstallButton';
import {RegionManager} from './RegionManager';
import {ReportsManager} from './ReportsManager';
import {WhitelistManager} from './WhitelistManager';

type NavKey = 'overview' | 'events' | 'generus' | 'admin' | 'reports';

interface NavItem {
  key: NavKey;
  label: string;
  mobileLabel: string;
  icon: React.ComponentType<{className?: string}>;
  phaseNote?: string;
}

export const AppShell: React.FC = () => {
  const {profile, desaName, kelompokName, signOut} = useAuth();
  const [activeTab, setActiveTab] = useState<NavKey>('overview');
  const [adminSubTab, setAdminSubTab] = useState<'whitelist' | 'regions'>('whitelist');
  const [regionStats, setRegionStats] = useState<{
    desaCount: number;
    kelompokCount: number;
    generusCount: number;
    desaNames: string[];
  } | null>(null);
  const [regionError, setRegionError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || !profile) return;
    let active = true;

    async function fetchStats() {
      if (!supabase) return;
      const [desaRes, kelompokRes, generusRes] = await Promise.all([
        supabase.from('desas').select('id, name').order('name'),
        supabase.from('kelompoks').select('id'),
        supabase.from('generus').select('id'),
      ]);
      if (!active) return;

      if (desaRes.error || kelompokRes.error || generusRes.error) {
        setRegionError(
          desaRes.error?.message ??
            kelompokRes.error?.message ??
            generusRes.error?.message ??
            'Gagal memuat data wilayah.',
        );
        return;
      }

      setRegionError(null);
      setRegionStats({
        desaCount: desaRes.data?.length ?? 0,
        kelompokCount: kelompokRes.data?.length ?? 0,
        generusCount: generusRes.data?.length ?? 0,
        desaNames: (desaRes.data ?? []).map((d) => d.name),
      });
    }

    void fetchStats();
    return () => {
      active = false;
    };
  }, [profile, activeTab]);

  if (!profile) return null;

  const isPamong = profile.role === 'pamong';
  const canManageUsersOrRegions =
    profile.role === 'super_admin' ||
    profile.role === 'admin_daerah' ||
    profile.role === 'admin_desa';

  const navItems: NavItem[] = [
    {
      key: 'overview',
      label: 'Ringkasan',
      mobileLabel: 'Beranda',
      icon: LayoutDashboard,
    },
    {
      key: 'events',
      label: isPamong ? 'Scan & Monitor' : 'Acara & Absen',
      mobileLabel: isPamong ? 'Scan' : 'Acara',
      icon: QrCode,
      phaseNote: 'Fase 3: Buat/Tutup Acara, Scan QR HP 1, Monitor Real-time HP 2, dan Audit Log.',
    },
    ...(!isPamong
      ? [
          {
            key: 'generus' as NavKey,
            label: 'Generus & QR',
            mobileLabel: 'Generus',
            icon: Users,
          },
          {
            key: 'reports' as NavKey,
            label: 'Rekap & PDF',
            mobileLabel: 'Rekap',
            icon: FileText,
            phaseNote: 'Fase 4: Rekap Kehadiran Wilayah & Export PDF per Acara.',
          },
        ]
      : []),
    ...(canManageUsersOrRegions
      ? [
          {
            key: 'admin' as NavKey,
            label: 'Pengurus & Wilayah',
            mobileLabel: 'Pengurus',
            icon: ShieldCheck,
          },
        ]
      : []),
  ];

  const scopeText = (() => {
    if (profile.role === 'super_admin') return 'Semua Wilayah · Karanganyar Barat';
    if (profile.scope_level === 'daerah') return 'Daerah Karanganyar Barat';
    if (profile.scope_level === 'desa') return `Desa ${desaName ?? '-'}`;
    return `${kelompokName ?? '-'}, Desa ${desaName ?? '-'}`;
  })();

  const roleCapabilities: string[] = (() => {
    switch (profile.role) {
      case 'super_admin':
        return [
          'Kendali penuh seluruh Daerah, Desa, dan Kelompok',
          'Mengelola semua role RBAC dan Audit Log tanpa batas',
          'Membuat, menutup, dan mengoreksi acara di semua tingkatan',
        ];
      case 'admin_daerah':
        return [
          'Mengelola wilayah Daerah Karanganyar Barat dan daftar kelompok',
          'Mendaftarkan akun Admin Desa dan Pamong tingkat Daerah',
          'Membuat, menutup, dan mengoreksi acara tingkat Daerah',
        ];
      case 'admin_desa':
        return [
          `Mengelola kelompok dan data generus di Desa ${desaName ?? '-'}`,
          'Mendaftarkan Admin Kelompok dan Pamong tingkat Desa',
          'Membuat/tutup acara Desa & melihat rekap anggota di acara Daerah (read-only)',
        ];
      case 'admin_kelompok':
        return [
          `Mengelola data generus khusus Kelompok ${kelompokName ?? '-'}`,
          'Membuat, menutup, klik hadir/izin, dan rekap acara Kelompok sendiri',
          'Melihat hasil anggota kelompok di acara Desa/Daerah (read-only) · Tidak dapat membuat Pamong',
        ];
      case 'pamong':
        return [
          `Bertugas pada acara aktif tingkat ${profile.scope_level === 'daerah' ? 'Daerah' : `Desa ${desaName ?? '-'}`}`,
          'Mode Scanner QR kamera (HP 1) dan Mode Monitor Real-time (HP 2)',
          'Setiap aksi scan atau hadir/izin tercatat otomatis pada Audit Log',
        ];
    }
  })();

  const activeNav = navItems.find((item) => item.key === activeTab) ?? navItems[0];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-200 bg-white print:hidden">
        <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-5">
          <img src="/icon.svg" alt="Presensi Generus" className="h-8 w-8 rounded-lg shrink-0" />
          <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
            Presensi Generus
          </span>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto" aria-label="Menu utama">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.key === activeTab;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveTab(item.key)}
                className={`flex w-full min-h-[42px] items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-900'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-emerald-800' : 'text-slate-500'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-4 space-y-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{profile.full_name}</p>
            <p className="truncate text-xs text-slate-500">
              {ROLE_LABELS[profile.role]} · {scopeText}
            </p>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="flex w-full min-h-[40px] items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0 pb-20 lg:pb-0 print:pl-0 print:pb-0">
        {/* Compact Top Bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-sm sm:px-6 print:hidden">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="/icon.svg"
              alt="Logo"
              className="h-7 w-7 rounded-md shrink-0 lg:hidden"
            />
            <h1 className="text-sm font-semibold text-slate-900 truncate sm:text-base">
              {activeNav.label}
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton compact />
            <button
              type="button"
              onClick={signOut}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 lg:hidden cursor-pointer"
              aria-label="Keluar"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span>Keluar</span>
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Identity & Scope Summary */}
              <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
                <p className="text-xs font-medium text-emerald-800">
                  Sesi Aktif Terverifikasi · Seluruh Fitur Aktif
                </p>
                <h2 className="mt-1.5 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl text-balance">
                  Selamat datang, {profile.full_name}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {ROLE_LABELS[profile.role]} · {scopeText} ·{' '}
                  <span className="font-mono text-xs text-slate-500">{profile.email}</span>
                </p>

                {regionError && (
                  <div
                    role="alert"
                    className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800"
                  >
                    Gagal membaca data wilayah dari Supabase:{' '}
                    <span className="font-mono">{regionError}</span>
                  </div>
                )}

                <div className="mt-5 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-slate-500">Wilayah Terdaftar</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">
                      {regionStats ? `${regionStats.desaCount} Desa` : 'Memuat...'}
                    </p>
                    {regionStats && regionStats.desaNames.length > 0 && (
                      <p className="mt-0.5 text-xs text-slate-500 truncate">
                        {regionStats.desaNames.join(' · ')}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Kelompok Terdaftar</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">
                      {regionStats ? `${regionStats.kelompokCount} Kelompok` : 'Memuat...'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Data Generus (Sesuai Scope)</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">
                      {regionStats ? `${regionStats.generusCount} Generus` : 'Memuat...'}
                    </p>
                  </div>
                </div>
              </section>

              {/* Quick Actions */}
              <section className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('events')}
                  className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-emerald-800 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-900 cursor-pointer"
                >
                  <QrCode className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{isPamong ? 'Buka Scan & Monitor Acara' : 'Kelola Acara & Presensi'}</span>
                </button>
                {!isPamong && (
                  <>
                    <button
                      type="button"
                      onClick={() => setActiveTab('generus')}
                      className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>Kelola Generus &amp; QR</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('reports')}
                      className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>Rekap &amp; Ekspor PDF</span>
                    </button>
                  </>
                )}
                {canManageUsersOrRegions && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setAdminSubTab('whitelist');
                        setActiveTab('admin');
                      }}
                      className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>Daftarkan Pengurus / Pamong</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAdminSubTab('regions');
                        setActiveTab('admin');
                      }}
                      className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>Kelola Kelompok</span>
                    </button>
                  </>
                )}
              </section>

              {/* Capabilities & Next Phases */}
              <div className="grid gap-6 lg:grid-cols-2">
                <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
                  <div className="flex items-center gap-2.5">
                    <MapPin className="h-4 w-4 text-emerald-800 shrink-0" aria-hidden="true" />
                    <h3 className="text-base font-semibold text-slate-900">
                      Hak Akses &amp; Batas Wilayah Anda
                    </h3>
                  </div>
                  <ul className="mt-4 space-y-2.5 text-sm text-slate-600 list-disc pl-5">
                    {roleCapabilities.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
                  <div className="flex items-center gap-2.5">
                    <CalendarCheck className="h-4 w-4 text-emerald-800 shrink-0" aria-hidden="true" />
                    <h3 className="text-base font-semibold text-slate-900">
                      Status Pembangunan Bertahap
                    </h3>
                  </div>
                  <ol className="mt-4 space-y-2.5 text-sm text-slate-600">
                    <li className="flex items-baseline justify-between gap-4 border-b border-slate-100 pb-2">
                      <span className="font-medium text-slate-900">
                        01. Fondasi PWA, Skema SQL &amp; Login Google RBAC
                      </span>
                      <span className="text-xs font-semibold text-emerald-800 whitespace-nowrap">
                        Selesai
                      </span>
                    </li>
                    <li className="flex items-baseline justify-between gap-4 border-b border-slate-100 pb-2">
                      <span className="font-medium text-slate-900">
                        02. Kelola Kelompok, Pengurus, Generus &amp; QR
                      </span>
                      <span className="text-xs font-semibold text-emerald-800 whitespace-nowrap">
                        Selesai
                      </span>
                    </li>
                    <li className="flex items-baseline justify-between gap-4 border-b border-slate-100 pb-2">
                      <span className="font-medium text-slate-900">
                        03. Acara, Scan HP 1, Monitor HP 2 &amp; Audit Log
                      </span>
                      <span className="text-xs font-semibold text-emerald-800 whitespace-nowrap">
                        Selesai
                      </span>
                    </li>
                    <li className="flex items-baseline justify-between gap-4">
                      <span className="font-medium text-slate-900">
                        04. Rekap Kehadiran &amp; Export PDF per Acara
                      </span>
                      <span className="text-xs font-semibold text-emerald-800 whitespace-nowrap">
                        Selesai
                      </span>
                    </li>
                  </ol>
                </section>
              </div>
            </div>
          )}

          {activeTab === 'events' && <EventsManager />}

          {activeTab === 'generus' && <GenerusManager />}

          {activeTab === 'admin' && canManageUsersOrRegions && (
            <div className="space-y-6">
              <div className="inline-flex items-center gap-1 rounded-lg bg-slate-200/70 p-1">
                <button
                  type="button"
                  onClick={() => setAdminSubTab('whitelist')}
                  className={`min-h-[38px] rounded-md px-4 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    adminSubTab === 'whitelist'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Akun Pengurus (RBAC)
                </button>
                <button
                  type="button"
                  onClick={() => setAdminSubTab('regions')}
                  className={`min-h-[38px] rounded-md px-4 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    adminSubTab === 'regions'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Wilayah &amp; Kelompok
                </button>
              </div>

              {adminSubTab === 'whitelist' ? <WhitelistManager /> : <RegionManager />}
            </div>
          )}

          {activeTab === 'reports' && <ReportsManager />}
        </main>
      </div>

      {/* Mobile Fixed Bottom Navigation */}
      <nav
        aria-label="Navigasi bawah"
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md lg:hidden print:hidden"
      >
        <div
          className="grid h-16 items-center"
          style={{gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))`}}
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.key === activeTab;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveTab(item.key)}
                className={`flex min-h-[48px] flex-col items-center justify-center gap-1 px-1 transition-colors cursor-pointer ${
                  isActive ? 'text-emerald-800' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="text-[11px] font-medium tracking-tight truncate max-w-full">
                  {item.mobileLabel}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
