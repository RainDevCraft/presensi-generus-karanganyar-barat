import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ChevronRight,
  Download,
  FileText,
  Search,
} from 'lucide-react';
import {useAuth} from '../context/AuthContext';
import {supabase} from '../lib/supabase';
import {
  ROLE_LABELS,
  type AttendanceLog,
  type Desa,
  type EventItem,
  type Kelompok,
} from '../types/database';
import {
  ATTENDANCE_STATUS_LABELS,
  getEventScopeLabel,
  getRegionLookup,
  isEventOwnerOrSuper,
} from '../utils/attendancePermissions';
import {
  buildRegionBreakdown,
  exportEventPDF,
  type AttendanceReportRow,
} from '../utils/pdfReport';

export const ReportsManager: React.FC = () => {
  const {profile} = useAuth();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [desas, setDesas] = useState<Desa[]>([]);
  const [kelompoks, setKelompoks] = useState<Kelompok[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Selected event recap state
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [attendances, setAttendances] = useState<AttendanceReportRow[]>([]);
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    if (!supabase || !profile) return;
    setLoading(true);
    setError(null);

    const [evRes, desaRes, kelRes] = await Promise.all([
      supabase
        .from('events')
        .select('*')
        .order('event_date', {ascending: false})
        .order('created_at', {ascending: false}),
      supabase.from('desas').select('*').order('name'),
      supabase.from('kelompoks').select('*').order('name'),
    ]);

    if (evRes.error || desaRes.error || kelRes.error) {
      setError(
        evRes.error?.message ??
          desaRes.error?.message ??
          kelRes.error?.message ??
          'Gagal memuat daftar laporan acara.',
      );
      setLoading(false);
      return;
    }

    setEvents((evRes.data ?? []) as EventItem[]);
    setDesas((desaRes.data ?? []) as Desa[]);
    setKelompoks((kelRes.data ?? []) as Kelompok[]);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const {desaMap, kelompokMap} = useMemo(
    () => getRegionLookup(desas, kelompoks),
    [desas, kelompoks],
  );

  const fetchEventReportPayload = async (ev: EventItem) => {
    if (!supabase) return null;
    const [attRes, logRes] = await Promise.all([
      supabase
        .from('attendances')
        .select('*, generus:generus_id(id, full_name, gender, qr_token)')
        .eq('event_id', ev.id),
      supabase
        .from('attendance_logs')
        .select('*')
        .eq('event_id', ev.id)
        .order('created_at', {ascending: false}),
    ]);

    if (attRes.error || logRes.error) {
      throw new Error(attRes.error?.message ?? logRes.error?.message ?? 'Gagal memuat data rekap.');
    }

    const sortedAtt = ((attRes.data ?? []) as AttendanceReportRow[]).sort((a, b) =>
      (a.generus?.full_name ?? '').localeCompare(b.generus?.full_name ?? '', 'id'),
    );
    return {
      attendances: sortedAtt,
      logs: (logRes.data ?? []) as AttendanceLog[],
    };
  };

  const handleOpenEventRecap = async (ev: EventItem) => {
    setSelectedEvent(ev);
    setLoadingDetail(true);
    setError(null);
    try {
      const payload = await fetchEventReportPayload(ev);
      if (payload) {
        setAttendances(payload.attendances);
        setLogs(payload.logs);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat rincian rekap.');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleQuickExportPDF = async (ev: EventItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!profile || exportingId) return;
    setExportingId(ev.id);
    setError(null);

    try {
      const payload =
        selectedEvent?.id === ev.id && !loadingDetail
          ? {attendances, logs}
          : await fetchEventReportPayload(ev);

      if (!payload) return;

      await exportEventPDF({
        event: ev,
        attendances: payload.attendances,
        logs: payload.logs,
        desas,
        kelompoks,
        viewerLabel: `${profile.full_name} (${ROLE_LABELS[profile.role]})`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengekspor PDF.');
    } finally {
      setExportingId(null);
    }
  };

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return events;
    return events.filter((ev) => ev.title.toLowerCase().includes(q));
  }, [events, search]);

  const stats = useMemo(() => {
    const total = attendances.length;
    const hadir = attendances.filter((a) => a.status === 'hadir').length;
    const izin = attendances.filter((a) => a.status === 'izin').length;
    const alfa = attendances.filter((a) => a.status === 'alfa').length;
    const belumHadir = attendances.filter((a) => a.status === 'belum_hadir').length;
    const pct = total > 0 ? Math.round((hadir / total) * 100) : 0;
    return {total, hadir, izin, alfa, belumHadir, pct};
  }, [attendances]);

  const breakdown = useMemo(() => {
    if (!selectedEvent) return [];
    const mode = selectedEvent.level === 'daerah' ? 'desa' : 'kelompok';
    return buildRegionBreakdown(attendances, desas, kelompoks, mode);
  }, [selectedEvent, attendances, desas, kelompoks]);

  if (!profile || profile.role === 'pamong') return null;

  if (selectedEvent) {
    const isReadOnlyRecap = !isEventOwnerOrSuper(profile, selectedEvent);
    return (
      <div className="space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="inline-flex min-h-[36px] items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                <span>Kembali ke Daftar Rekap</span>
              </button>

              <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                {selectedEvent.title}
              </h2>
              <p className="mt-1 text-xs text-slate-600 sm:text-sm">
                {getEventScopeLabel(selectedEvent, desaMap, kelompokMap)} ·{' '}
                <span className="tabular-nums">{selectedEvent.event_date}</span> ·{' '}
                {selectedEvent.status === 'open' ? 'Berlangsung' : 'Ditutup'}
                {isReadOnlyRecap && ' · Data Anggota Wilayah Anda (Read-Only)'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void handleQuickExportPDF(selectedEvent)}
              disabled={loadingDetail || exportingId === selectedEvent.id}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-800 px-5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-900 disabled:opacity-60 whitespace-nowrap cursor-pointer"
            >
              <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {exportingId === selectedEvent.id ? 'Membuat PDF...' : 'Unduh PDF Acara Ini'}
              </span>
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-5 sm:grid-cols-6">
            <div>
              <p className="text-xs text-slate-500">Target</p>
              <p className="mt-1 text-xl font-bold text-slate-900 tabular-nums">{stats.total}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Hadir</p>
              <p className="mt-1 text-xl font-bold text-emerald-800 tabular-nums">{stats.hadir}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Izin</p>
              <p className="mt-1 text-xl font-bold text-amber-700 tabular-nums">{stats.izin}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Alfa</p>
              <p className="mt-1 text-xl font-bold text-red-700 tabular-nums">{stats.alfa}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Belum Hadir</p>
              <p className="mt-1 text-xl font-bold text-slate-700 tabular-nums">
                {stats.belumHadir}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Persentase Hadir</p>
              <p className="mt-1 text-xl font-bold text-emerald-900 tabular-nums">{stats.pct}%</p>
            </div>
          </div>
        </section>

        {loadingDetail ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            Menyusun rekap kehadiran acara...
          </div>
        ) : (
          <>
            {/* Breakdown Table */}
            <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="border-b border-slate-200 px-5 py-4">
                <h3 className="text-base font-semibold text-slate-900">
                  {selectedEvent.level === 'daerah'
                    ? 'Rekapitulasi per Desa'
                    : 'Rekapitulasi per Kelompok'}
                </h3>
              </div>
              {breakdown.length === 0 ? (
                <div className="p-6 text-sm text-slate-500">Belum ada data peserta.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                      <tr>
                        <th className="px-5 py-3">Wilayah</th>
                        <th className="px-4 py-3 text-right">Target</th>
                        <th className="px-4 py-3 text-right">Hadir</th>
                        <th className="px-4 py-3 text-right">Izin</th>
                        <th className="px-4 py-3 text-right">Alfa</th>
                        <th className="px-4 py-3 text-right">Belum</th>
                        <th className="px-5 py-3 text-right">% Hadir</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 tabular-nums">
                      {breakdown.map((b) => (
                        <tr key={b.regionLabel} className="hover:bg-slate-50/70">
                          <td className="px-5 py-3 font-medium text-slate-900">{b.regionLabel}</td>
                          <td className="px-4 py-3 text-right text-slate-700">{b.total}</td>
                          <td className="px-4 py-3 text-right font-semibold text-emerald-800">
                            {b.hadir}
                          </td>
                          <td className="px-4 py-3 text-right text-amber-700">{b.izin}</td>
                          <td className="px-4 py-3 text-right text-red-700">{b.alfa}</td>
                          <td className="px-4 py-3 text-right text-slate-500">{b.belumHadir}</td>
                          <td className="px-5 py-3 text-right font-bold text-slate-900">
                            {b.percentage}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Individual List */}
            <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="border-b border-slate-200 px-5 py-4">
                <h3 className="text-base font-semibold text-slate-900">
                  Rincian Kehadiran Generus ({attendances.length})
                </h3>
              </div>
              {attendances.length === 0 ? (
                <div className="p-6 text-sm text-slate-500">
                  Tidak ada peserta dalam cakupan wilayah Anda pada acara ini.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                      <tr>
                        <th className="px-5 py-3">Nama Generus</th>
                        <th className="px-5 py-3">L/P</th>
                        <th className="px-5 py-3">Kelompok · Desa</th>
                        <th className="px-5 py-3">Status Akhir</th>
                        <th className="px-5 py-3">Pencatat</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {attendances.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50/70">
                          <td className="px-5 py-3 font-medium text-slate-900">
                            {row.generus?.full_name ?? 'Generus'}
                          </td>
                          <td className="px-5 py-3 text-slate-600">
                            {row.generus?.gender ?? '-'}
                          </td>
                          <td className="px-5 py-3 text-slate-600">
                            {kelompokMap.get(row.kelompok_id) ?? '-'} · Desa{' '}
                            {desaMap.get(row.desa_id) ?? '-'}
                          </td>
                          <td className="px-5 py-3 text-xs font-semibold">
                            <span
                              className={
                                row.status === 'hadir'
                                  ? 'text-emerald-800'
                                  : row.status === 'izin'
                                    ? 'text-amber-700'
                                    : row.status === 'alfa'
                                      ? 'text-red-700'
                                      : 'text-slate-600'
                              }
                            >
                              {ATTENDANCE_STATUS_LABELS[row.status]}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-xs text-slate-500">
                            {row.updated_by_name
                              ? `${row.updated_by_name} (${row.updated_by_role ?? '-'})`
                              : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <FileText className="h-4 w-4 text-emerald-800 shrink-0" aria-hidden="true" />
              <h2 className="text-base font-semibold text-slate-900">
                Rekap &amp; Ekspor PDF per Acara
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Setiap acara memiliki laporan rekapitulasi dan file PDF resmi tersendiri. Admin Desa/Kelompok juga dapat melihat hasil anggotanya di acara tingkat atas.
            </p>
          </div>

          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama acara..."
              className="w-full sm:w-64 min-h-[40px] rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-1.5 text-xs text-slate-900 focus:border-emerald-700 focus:outline-none"
            />
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-slate-500">Memuat daftar acara...</div>
        ) : filteredEvents.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Belum ada acara yang dapat direkap.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredEvents.map((ev) => {
              const isReadOnlyRecap = !isEventOwnerOrSuper(profile, ev);
              return (
                <div
                  key={ev.id}
                  onClick={() => void handleOpenEventRecap(ev)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      void handleOpenEventRecap(ev);
                    }
                  }}
                  className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span
                        className={`font-semibold ${
                          ev.status === 'open' ? 'text-emerald-800' : 'text-slate-600'
                        }`}
                      >
                        {ev.status === 'open' ? 'Berlangsung' : 'Ditutup'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{ev.event_date}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {getEventScopeLabel(ev, desaMap, kelompokMap)}
                        {isReadOnlyRecap ? ' · Read-Only' : ''}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-base font-semibold text-slate-900">
                      {ev.title}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => void handleQuickExportPDF(ev, e)}
                      disabled={exportingId === ev.id}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-60 whitespace-nowrap cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>{exportingId === ev.id ? 'Menyiapkan...' : 'Ekspor PDF'}</span>
                    </button>
                    <ChevronRight className="h-5 w-5 text-slate-400" aria-hidden="true" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
