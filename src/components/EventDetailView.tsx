import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Download,
  History,
  Lock,
  Monitor,
  QrCode,
  RefreshCw,
  Search,
  UserPlus,
  X,
} from 'lucide-react';
import {useAuth} from '../context/AuthContext';
import {supabase} from '../lib/supabase';
import {
  ROLE_LABELS,
  type Attendance,
  type AttendanceLog,
  type AttendanceStatus,
  type Desa,
  type EventItem,
  type Generus,
  type Kelompok,
} from '../types/database';
import {
  ACTION_TYPE_LABELS,
  ATTENDANCE_STATUS_LABELS,
  canOperateOpenEvent,
  formatTimeShort,
  getEventScopeLabel,
  getRegionLookup,
  isEventOwnerOrSuper,
  playFeedbackTone,
} from '../utils/attendancePermissions';
import {exportEventPDF} from '../utils/pdfReport';
import {QRScannerPanel, type ScanFeedback} from './QRScannerPanel';

interface AttendanceRow extends Attendance {
  generus: Pick<Generus, 'id' | 'full_name' | 'gender' | 'qr_token'> | null;
}

interface EventDetailViewProps {
  event: EventItem;
  desas: Desa[];
  kelompoks: Kelompok[];
  onBack: () => void;
  onEventUpdated: (updated: EventItem) => void;
}

type DetailTab = 'monitor' | 'scanner' | 'logs';

export const EventDetailView: React.FC<EventDetailViewProps> = ({
  event: initialEvent,
  desas,
  kelompoks,
  onBack,
  onEventUpdated,
}) => {
  const {profile} = useAuth();
  const [event, setEvent] = useState<EventItem>(initialEvent);
  const [attendances, setAttendances] = useState<AttendanceRow[]>([]);
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [realtimeLive, setRealtimeLive] = useState(false);

  const canOperate = profile ? canOperateOpenEvent(profile, event) : false;
  const isOwnerOrSuper = profile ? isEventOwnerOrSuper(profile, event) : false;
  const isReadOnly = !canOperate && !(event.status === 'closed' && isOwnerOrSuper);

  const [activeTab, setActiveTab] = useState<DetailTab>(
    profile?.role === 'pamong' && initialEvent.status === 'open' ? 'scanner' : 'monitor',
  );

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | AttendanceStatus>('all');
  const [desaFilter, setDesaFilter] = useState<string>('all');
  const [kelompokFilter, setKelompokFilter] = useState<string>('all');
  const [logSearch, setLogSearch] = useState('');

  // Close Event & Correction states
  const [confirmClose, setConfirmClose] = useState(false);
  const [closingEvent, setClosingEvent] = useState(false);
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  const [syncingNewGenerus, setSyncingNewGenerus] = useState(false);

  const [correctingRow, setCorrectingRow] = useState<AttendanceRow | null>(null);
  const [correctionStatus, setCorrectionStatus] = useState<AttendanceStatus>('hadir');
  const [correctionNote, setCorrectionNote] = useState('');
  const [exportingPdf, setExportingPdf] = useState(false);

  const [recentScans, setRecentScans] = useState<ScanFeedback[]>([]);

  const {desaMap, kelompokMap} = useMemo(
    () => getRegionLookup(desas, kelompoks),
    [desas, kelompoks],
  );

  const loadDetailData = useCallback(async () => {
    if (!supabase) return;
    setError(null);

    const [eventRes, attRes, logRes] = await Promise.all([
      supabase.from('events').select('*').eq('id', initialEvent.id).single(),
      supabase
        .from('attendances')
        .select('*, generus:generus_id(id, full_name, gender, qr_token)')
        .eq('event_id', initialEvent.id),
      supabase
        .from('attendance_logs')
        .select('*')
        .eq('event_id', initialEvent.id)
        .order('created_at', {ascending: false}),
    ]);

    if (eventRes.error || attRes.error || logRes.error) {
      setError(
        eventRes.error?.message ??
          attRes.error?.message ??
          logRes.error?.message ??
          'Gagal memuat data acara.',
      );
      setLoading(false);
      return;
    }

    if (eventRes.data) {
      const latestEvent = eventRes.data as EventItem;
      setEvent(latestEvent);
      onEventUpdated(latestEvent);
    }

    const sortedAttendances = ((attRes.data ?? []) as AttendanceRow[]).sort((a, b) =>
      (a.generus?.full_name ?? '').localeCompare(b.generus?.full_name ?? '', 'id'),
    );
    setAttendances(sortedAttendances);
    setLogs((logRes.data ?? []) as AttendanceLog[]);
    setLoading(false);
  }, [initialEvent.id, onEventUpdated]);

  useEffect(() => {
    void loadDetailData();
  }, [loadDetailData]);

  // Realtime sync for HP 1 & HP 2
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;

    const channel = client
      .channel(`event-live-${initialEvent.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'attendances',
          filter: `event_id=eq.${initialEvent.id}`,
        },
        () => {
          void loadDetailData();
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'events',
          filter: `id=eq.${initialEvent.id}`,
        },
        () => {
          void loadDetailData();
        },
      )
      .subscribe((status) => {
        setRealtimeLive(status === 'SUBSCRIBED');
      });

    return () => {
      setRealtimeLive(false);
      void client.removeChannel(channel);
    };
  }, [initialEvent.id, loadDetailData]);

  const counts = useMemo(() => {
    const summary = {
      total: attendances.length,
      hadir: 0,
      izin: 0,
      belum_hadir: 0,
      alfa: 0,
    };
    for (const row of attendances) {
      summary[row.status] += 1;
    }
    return summary;
  }, [attendances]);

  const availableDesasInEvent = useMemo(() => {
    const ids = new Set(attendances.map((a) => a.desa_id));
    return desas.filter((d) => ids.has(d.id));
  }, [attendances, desas]);

  const availableKelompoksInEvent = useMemo(() => {
    const ids = new Set(
      attendances
        .filter((a) => desaFilter === 'all' || a.desa_id === desaFilter)
        .map((a) => a.kelompok_id),
    );
    return kelompoks.filter((k) => ids.has(k.id));
  }, [attendances, kelompoks, desaFilter]);

  const filteredAttendances = useMemo(() => {
    const q = search.trim().toLowerCase();
    return attendances.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (desaFilter !== 'all' && row.desa_id !== desaFilter) return false;
      if (kelompokFilter !== 'all' && row.kelompok_id !== kelompokFilter) return false;
      if (!q) return true;
      return (row.generus?.full_name ?? '').toLowerCase().includes(q);
    });
  }, [attendances, statusFilter, desaFilter, kelompokFilter, search]);

  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter(
      (l) =>
        l.generus_name.toLowerCase().includes(q) ||
        l.actor_name.toLowerCase().includes(q) ||
        (l.note ?? '').toLowerCase().includes(q),
    );
  }, [logs, logSearch]);

  const updateAttendanceWithLog = async (
    row: AttendanceRow,
    nextStatus: AttendanceStatus,
    actionType: 'qr_scan' | 'manual_hadir' | 'manual_izin' | 'correction',
    note: string | null,
  ) => {
    if (!supabase || !profile) return;
    const nowIso = new Date().toISOString();
    const roleLabel = ROLE_LABELS[profile.role];
    const method =
      actionType === 'qr_scan'
        ? 'qr_scan'
        : actionType === 'correction'
          ? 'correction'
          : 'manual';

    const {error: updErr} = await supabase
      .from('attendances')
      .update({
        status: nextStatus,
        method,
        updated_by: profile.id,
        updated_by_name: profile.full_name,
        updated_by_role: roleLabel,
        updated_at: nowIso,
      })
      .eq('id', row.id);

    if (updErr) {
      throw new Error(updErr.message);
    }

    const {error: logErr} = await supabase.from('attendance_logs').insert({
      attendance_id: row.id,
      event_id: event.id,
      generus_id: row.generus_id,
      generus_name: row.generus?.full_name ?? 'Generus',
      previous_status: row.status,
      new_status: nextStatus,
      action_type: actionType,
      actor_id: profile.id,
      actor_name: profile.full_name,
      actor_role: roleLabel,
      note,
    });

    if (logErr) {
      throw new Error(logErr.message);
    }
  };

  const handleManualMark = async (row: AttendanceRow, nextStatus: 'hadir' | 'izin') => {
    if (!canOperate || busyRowId) return;
    setBusyRowId(row.id);
    setError(null);
    try {
      await updateAttendanceWithLog(
        row,
        nextStatus,
        nextStatus === 'hadir' ? 'manual_hadir' : 'manual_izin',
        nextStatus === 'hadir' ? 'Klik hadir manual' : 'Klik izin manual',
      );
      await loadDetailData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memperbarui kehadiran.');
    } finally {
      setBusyRowId(null);
    }
  };

  const handleConfirmCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctingRow || !isOwnerOrSuper || event.status !== 'closed') return;
    setBusyRowId(correctingRow.id);
    setError(null);

    try {
      await updateAttendanceWithLog(
        correctingRow,
        correctionStatus,
        'correction',
        correctionNote.trim() || 'Koreksi kesalahan input pasca-tutup acara',
      );
      setFeedback(`Status ${correctingRow.generus?.full_name ?? ''} dikoreksi ke ${ATTENDANCE_STATUS_LABELS[correctionStatus]}.`);
      setCorrectingRow(null);
      setCorrectionNote('');
      await loadDetailData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan koreksi.');
    } finally {
      setBusyRowId(null);
    }
  };

  const handleCloseEvent = async () => {
    if (!supabase || !profile || !isOwnerOrSuper || event.status !== 'open') return;
    setClosingEvent(true);
    setError(null);
    setFeedback(null);

    try {
      const nowIso = new Date().toISOString();
      const roleLabel = ROLE_LABELS[profile.role];
      const pendingRows = attendances.filter((a) => a.status === 'belum_hadir');

      if (pendingRows.length > 0) {
        const pendingIds = pendingRows.map((p) => p.id);
        const {error: batchUpdErr} = await supabase
          .from('attendances')
          .update({
            status: 'alfa',
            method: 'auto_close',
            updated_by: profile.id,
            updated_by_name: profile.full_name,
            updated_by_role: roleLabel,
            updated_at: nowIso,
          })
          .in('id', pendingIds);

        if (batchUpdErr) throw new Error(batchUpdErr.message);

        const logPayload = pendingRows.map((p) => ({
          attendance_id: p.id,
          event_id: event.id,
          generus_id: p.generus_id,
          generus_name: p.generus?.full_name ?? 'Generus',
          previous_status: 'belum_hadir',
          new_status: 'alfa',
          action_type: 'auto_alfa_close',
          actor_id: profile.id,
          actor_name: profile.full_name,
          actor_role: roleLabel,
          note: 'Otomatis menjadi Alfa saat acara ditutup',
        }));

        const {error: batchLogErr} = await supabase.from('attendance_logs').insert(logPayload);
        if (batchLogErr) throw new Error(batchLogErr.message);
      }

      const {error: closeErr} = await supabase
        .from('events')
        .update({
          status: 'closed',
          closed_by: profile.id,
          closed_by_name: profile.full_name,
          closed_at: nowIso,
        })
        .eq('id', event.id);

      if (closeErr) throw new Error(closeErr.message);

      setConfirmClose(false);
      setActiveTab('monitor');
      setFeedback(
        `Acara ditutup. ${pendingRows.length} peserta yang belum hadir otomatis berstatus Alfa.`,
      );
      await loadDetailData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menutup acara.');
    } finally {
      setClosingEvent(false);
    }
  };

  const handleSyncNewGenerus = async () => {
    if (!supabase || !isOwnerOrSuper || event.status !== 'open') return;
    setSyncingNewGenerus(true);
    setError(null);
    setFeedback(null);

    try {
      let query = supabase.from('generus').select('id, desa_id, kelompok_id').eq('is_active', true);
      if (event.level === 'desa' && event.desa_id) {
        query = query.eq('desa_id', event.desa_id);
      } else if (event.level === 'kelompok' && event.kelompok_id) {
        query = query.eq('kelompok_id', event.kelompok_id);
      }
      const {data: scopedGenerus, error: gErr} = await query;
      if (gErr) throw new Error(gErr.message);

      const existingIds = new Set(attendances.map((a) => a.generus_id));
      const missing = (scopedGenerus ?? []).filter((g) => !existingIds.has(g.id));

      if (missing.length === 0) {
        setFeedback('Semua generus aktif di wilayah ini sudah masuk dalam daftar acara.');
        setSyncingNewGenerus(false);
        return;
      }

      const insertRows = missing.map((g) => ({
        event_id: event.id,
        generus_id: g.id,
        desa_id: g.desa_id,
        kelompok_id: g.kelompok_id,
        status: 'belum_hadir',
        method: 'initial',
      }));

      const {error: insErr} = await supabase.from('attendances').insert(insertRows);
      if (insErr) throw new Error(insErr.message);

      setFeedback(`${missing.length} generus baru berhasil ditambahkan ke daftar acara.`);
      await loadDetailData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyinkronkan generus baru.');
    } finally {
      setSyncingNewGenerus(false);
    }
  };

  const pushRecentScan = (item: ScanFeedback) => {
    setRecentScans((prev) => [item, ...prev].slice(0, 8));
  };

  const handleScanToken = async (token: string): Promise<ScanFeedback> => {
    const nowTime = new Date().toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    if (event.status !== 'open' || !canOperate) {
      playFeedbackTone('error');
      const fb: ScanFeedback = {
        kind: 'error',
        title: 'Acara Sudah Ditutup',
        detail: 'Scan QR tidak dapat diproses karena acara telah ditutup.',
        timestamp: nowTime,
      };
      pushRecentScan(fb);
      return fb;
    }

    const matchedRow = attendances.find(
      (row) => row.generus?.qr_token?.toLowerCase() === token.toLowerCase(),
    );

    if (matchedRow) {
      const name = matchedRow.generus?.full_name ?? 'Generus';
      const kel = kelompokMap.get(matchedRow.kelompok_id) ?? '-';
      const desa = desaMap.get(matchedRow.desa_id) ?? '-';

      if (matchedRow.status === 'hadir') {
        playFeedbackTone('duplicate');
        const fb: ScanFeedback = {
          kind: 'duplicate',
          title: `${name} · Sudah Hadir`,
          detail: `Sudah tercatat hadir sebelumnya oleh ${matchedRow.updated_by_name ?? 'petugas'}.`,
          timestamp: nowTime,
        };
        pushRecentScan(fb);
        return fb;
      }

      try {
        await updateAttendanceWithLog(
          matchedRow,
          'hadir',
          'qr_scan',
          `Scan QR oleh ${profile?.full_name ?? 'Pamong'}`,
        );
        playFeedbackTone('success');
        const fb: ScanFeedback = {
          kind: 'success',
          title: `${name} · Hadir Tercatat`,
          detail: `${kel}, Desa ${desa}`,
          timestamp: nowTime,
        };
        pushRecentScan(fb);
        await loadDetailData();
        return fb;
      } catch (err) {
        playFeedbackTone('error');
        const fb: ScanFeedback = {
          kind: 'error',
          title: 'Gagal Menyimpan Scan',
          detail: err instanceof Error ? err.message : 'Terjadi kesalahan saat menyimpan data.',
          timestamp: nowTime,
        };
        pushRecentScan(fb);
        return fb;
      }
    }

    // Check if QR exists outside this event scope
    if (supabase) {
      const {data: foundGenerus} = await supabase
        .from('generus')
        .select('id, full_name, desa_id, kelompok_id, is_active')
        .eq('qr_token', token)
        .maybeSingle();

      if (foundGenerus) {
        const gDesa = desaMap.get(foundGenerus.desa_id) ?? '-';
        const gKel = kelompokMap.get(foundGenerus.kelompok_id) ?? '-';

        if (
          (event.level === 'desa' && foundGenerus.desa_id !== event.desa_id) ||
          (event.level === 'kelompok' && foundGenerus.kelompok_id !== event.kelompok_id)
        ) {
          playFeedbackTone('error');
          const fb: ScanFeedback = {
            kind: 'error',
            title: `Ditolak · Di Luar Cakupan Wilayah`,
            detail: `${foundGenerus.full_name} terdaftar di ${gKel}, Desa ${gDesa}.`,
            timestamp: nowTime,
          };
          pushRecentScan(fb);
          return fb;
        }

        if (!foundGenerus.is_active) {
          playFeedbackTone('error');
          const fb: ScanFeedback = {
            kind: 'error',
            title: `${foundGenerus.full_name} · Nonaktif`,
            detail: 'Status peserta ini sedang dinonaktifkan.',
            timestamp: nowTime,
          };
          pushRecentScan(fb);
          return fb;
        }

        playFeedbackTone('error');
        const fb: ScanFeedback = {
          kind: 'error',
          title: `${foundGenerus.full_name} · Belum Masuk Daftar Acara`,
          detail: 'Generus baru ini ditambahkan setelah acara dibuka. Minta Admin klik Sinkronkan Generus.',
          timestamp: nowTime,
        };
        pushRecentScan(fb);
        return fb;
      }
    }

    playFeedbackTone('error');
    const fb: ScanFeedback = {
      kind: 'error',
      title: 'QR Ditolak / Tidak Dikenal',
      detail: 'QR Code tidak terdaftar dalam cakupan wilayah acara ini.',
      timestamp: nowTime,
    };
    pushRecentScan(fb);
    return fb;
  };

  return (
    <div className="space-y-6">
      {/* Header Event Card */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-[36px] items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Kembali ke Daftar Acara</span>
            </button>

            <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              {event.title}
            </h2>
            <p className="mt-1 text-xs text-slate-600 sm:text-sm">
              {getEventScopeLabel(event, desaMap, kelompokMap)} · Tanggal{' '}
              <span className="tabular-nums font-medium">{event.event_date}</span> ·{' '}
              <span
                className={`font-semibold ${
                  event.status === 'open' ? 'text-emerald-800' : 'text-slate-700'
                }`}
              >
                {event.status === 'open' ? 'Acara Berlangsung' : 'Acara Ditutup'}
              </span>
              {isReadOnly && ' · Mode Lihat Saja (Read-Only)'}
            </p>
            {event.status === 'closed' && event.closed_by_name && (
              <p className="mt-1 text-xs text-slate-500">
                Ditutup oleh {event.closed_by_name}
                {event.closed_at ? ` pada ${new Date(event.closed_at).toLocaleString('id-ID')}` : ''}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {realtimeLive && event.status === 'open' && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-800 px-2">
                <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
                Live Sync Aktif
              </span>
            )}

            <button
              type="button"
              onClick={() => void loadDetailData()}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Segarkan</span>
            </button>

            {profile && profile.role !== 'pamong' && (
              <button
                type="button"
                disabled={loading || exportingPdf}
                onClick={async () => {
                  setExportingPdf(true);
                  try {
                    await exportEventPDF({
                      event,
                      attendances,
                      logs,
                      desas,
                      kelompoks,
                      viewerLabel: `${profile.full_name} (${ROLE_LABELS[profile.role]})`,
                    });
                  } finally {
                    setExportingPdf(false);
                  }
                }}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-60 whitespace-nowrap cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{exportingPdf ? 'Membuat PDF...' : 'Ekspor PDF'}</span>
              </button>
            )}

            {isOwnerOrSuper && event.status === 'open' && (
              <>
                <button
                  type="button"
                  onClick={handleSyncNewGenerus}
                  disabled={syncingNewGenerus}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap cursor-pointer"
                >
                  <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{syncingNewGenerus ? 'Menyinkronkan...' : 'Sinkron Generus'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClose(true)}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap cursor-pointer"
                >
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Tutup Acara</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Inline Close Event Confirmation */}
        {confirmClose && (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-950">
              Konfirmasi Penutupan Acara
            </p>
            <p className="mt-1 text-xs leading-relaxed text-amber-900">
              Sebanyak <strong className="tabular-nums">{counts.belum_hadir}</strong> peserta yang masih
              berstatus <strong>Belum Hadir</strong> akan otomatis diubah menjadi{' '}
              <strong>Alfa</strong> dan dicatat ke Audit Log. Status masih dapat dikoreksi oleh Admin penyelenggara jika ada kesalahan input.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCloseEvent}
                disabled={closingEvent}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                <span>{closingEvent ? 'Menutup Acara...' : 'Ya, Tutup Acara Sekarang'}</span>
              </button>
              <button
                type="button"
                onClick={() => setConfirmClose(false)}
                disabled={closingEvent}
                className="inline-flex min-h-[40px] items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
            </div>
          </div>
        )}

        {/* Live Counters */}
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-5 sm:grid-cols-5">
          <div>
            <p className="text-xs text-slate-500">Total Target</p>
            <p className="mt-1 text-xl font-bold text-slate-900 tabular-nums">{counts.total}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Hadir</p>
            <p className="mt-1 text-xl font-bold text-emerald-800 tabular-nums">{counts.hadir}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Izin</p>
            <p className="mt-1 text-xl font-bold text-amber-700 tabular-nums">{counts.izin}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Belum Hadir</p>
            <p className="mt-1 text-xl font-bold text-slate-700 tabular-nums">
              {counts.belum_hadir}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Alfa</p>
            <p className="mt-1 text-xl font-bold text-red-700 tabular-nums">{counts.alfa}</p>
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

        {feedback && (
          <div
            role="status"
            className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-900"
          >
            <Check className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
            <span>{feedback}</span>
          </div>
        )}
      </section>

      {/* Mode Switcher (Monitor HP 2 / Scanner HP 1 / Audit Log) */}
      <div className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-200/70 p-1">
        <button
          type="button"
          onClick={() => setActiveTab('monitor')}
          className={`inline-flex min-h-[40px] items-center gap-2 rounded-md px-4 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'monitor'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Monitor className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Monitor &amp; Daftar Hadir</span>
        </button>

        {canOperate && (
          <button
            type="button"
            onClick={() => setActiveTab('scanner')}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-md px-4 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'scanner'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <QrCode className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Scan QR (HP 1)</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setActiveTab('logs')}
          className={`inline-flex min-h-[40px] items-center gap-2 rounded-md px-4 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'logs'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <History className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="tabular-nums">Audit Log ({logs.length})</span>
        </button>
      </div>

      {/* Tab 1: Monitor & Daftar Hadir */}
      {activeTab === 'monitor' && (
        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
              {(['all', 'belum_hadir', 'hadir', 'izin', 'alfa'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`min-h-[34px] rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    statusFilter === st
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {st === 'all' ? 'Semua' : ATTENDANCE_STATUS_LABELS[st]}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 sm:flex-initial">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari nama generus..."
                  className="w-full sm:w-52 min-h-[38px] rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-1.5 text-xs text-slate-900 focus:border-emerald-700 focus:outline-none"
                />
              </div>

              {availableDesasInEvent.length > 1 && (
                <select
                  value={desaFilter}
                  onChange={(e) => {
                    setDesaFilter(e.target.value);
                    setKelompokFilter('all');
                  }}
                  aria-label="Filter desa"
                  className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 focus:border-emerald-700 focus:outline-none"
                >
                  <option value="all">Semua Desa</option>
                  {availableDesasInEvent.map((d) => (
                    <option key={d.id} value={d.id}>
                      Desa {d.name}
                    </option>
                  ))}
                </select>
              )}

              {availableKelompoksInEvent.length > 1 && (
                <select
                  value={kelompokFilter}
                  onChange={(e) => setKelompokFilter(e.target.value)}
                  aria-label="Filter kelompok"
                  className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 focus:border-emerald-700 focus:outline-none"
                >
                  <option value="all">Semua Kelompok</option>
                  {availableKelompoksInEvent.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {loading ? (
            <div className="p-6 text-sm text-slate-500">Memuat daftar peserta acara...</div>
          ) : filteredAttendances.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Tidak ada peserta yang sesuai dengan filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-5 py-3">Nama Generus</th>
                    <th className="px-5 py-3">Wilayah</th>
                    <th className="px-5 py-3">Status &amp; Pencatat</th>
                    {!isReadOnly && <th className="px-5 py-3 text-right">Aksi</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAttendances.map((row) => {
                    const statusColor =
                      row.status === 'hadir'
                        ? 'text-emerald-800'
                        : row.status === 'izin'
                          ? 'text-amber-700'
                          : row.status === 'alfa'
                            ? 'text-red-700'
                            : 'text-slate-600';

                    return (
                      <tr key={row.id} className="hover:bg-slate-50/70">
                        <td className="px-5 py-3">
                          <p className="font-medium text-slate-900">
                            {row.generus?.full_name ?? 'Generus'}
                          </p>
                          <p className="text-xs text-slate-500">
                            {row.generus?.gender === 'L' ? 'Putra (L)' : 'Putri (P)'}
                          </p>
                        </td>
                        <td className="px-5 py-3">
                          <p className="text-slate-900">
                            {kelompokMap.get(row.kelompok_id) ?? '-'}
                          </p>
                          <p className="text-xs text-slate-500">
                            Desa {desaMap.get(row.desa_id) ?? '-'}
                          </p>
                        </td>
                        <td className="px-5 py-3">
                          <p className={`text-xs font-semibold ${statusColor}`}>
                            {ATTENDANCE_STATUS_LABELS[row.status]}
                          </p>
                          {row.updated_by_name ? (
                            <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                              {row.updated_by_name} ({row.updated_by_role ?? '-'}) ·{' '}
                              {formatTimeShort(row.updated_at)}
                            </p>
                          ) : (
                            <p className="mt-0.5 text-xs text-slate-400">Belum diproses</p>
                          )}
                        </td>
                        {!isReadOnly && (
                          <td className="px-5 py-3 text-right">
                            {event.status === 'open' && canOperate ? (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={busyRowId === row.id || row.status === 'hadir'}
                                  onClick={() => handleManualMark(row, 'hadir')}
                                  className={`inline-flex min-h-[38px] items-center rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                                    row.status === 'hadir'
                                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 cursor-default'
                                      : 'bg-emerald-800 text-white hover:bg-emerald-900 disabled:opacity-50'
                                  }`}
                                >
                                  Hadir
                                </button>
                                <button
                                  type="button"
                                  disabled={busyRowId === row.id || row.status === 'izin'}
                                  onClick={() => handleManualMark(row, 'izin')}
                                  className={`inline-flex min-h-[38px] items-center rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                                    row.status === 'izin'
                                      ? 'bg-amber-50 text-amber-800 border border-amber-200 cursor-default'
                                      : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50'
                                  }`}
                                >
                                  Izin
                                </button>
                              </div>
                            ) : event.status === 'closed' && isOwnerOrSuper ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setCorrectingRow(row);
                                  setCorrectionStatus(row.status === 'alfa' ? 'hadir' : row.status);
                                  setCorrectionNote('');
                                }}
                                className="inline-flex min-h-[38px] items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                              >
                                Koreksi
                              </button>
                            ) : null}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Tab 2: Camera QR Scanner (HP 1) */}
      {activeTab === 'scanner' && canOperate && (
        <QRScannerPanel onScanToken={handleScanToken} recentScans={recentScans} />
      )}

      {/* Tab 3: Audit Trail Logs */}
      {activeTab === 'logs' && (
        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Jejak Audit Perubahan Kehadiran
              </h3>
              <p className="text-xs text-slate-500">
                Mencatat setiap aksi scan, klik manual, penutupan otomatis Alfa, dan koreksi admin.
              </p>
            </div>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                placeholder="Cari generus atau petugas..."
                className="w-full sm:w-64 min-h-[38px] rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-1.5 text-xs text-slate-900 focus:border-emerald-700 focus:outline-none"
              />
            </div>
          </div>

          {filteredLogs.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Belum ada aktivitas perubahan status pada acara ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-5 py-3">Waktu</th>
                    <th className="px-5 py-3">Generus</th>
                    <th className="px-5 py-3">Perubahan Status</th>
                    <th className="px-5 py-3">Pelaku &amp; Metode</th>
                    <th className="px-5 py-3">Catatan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3 font-mono text-xs text-slate-500 whitespace-nowrap tabular-nums">
                        {formatTimeShort(log.created_at)}
                      </td>
                      <td className="px-5 py-3 font-medium text-slate-900">
                        {log.generus_name}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        <span className="text-slate-500">
                          {ATTENDANCE_STATUS_LABELS[log.previous_status]}
                        </span>
                        <span className="mx-1.5 text-slate-400">→</span>
                        <span className="font-semibold text-slate-900">
                          {ATTENDANCE_STATUS_LABELS[log.new_status]}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-900">
                          {log.actor_name}{' '}
                          <span className="font-normal text-slate-500">({log.actor_role})</span>
                        </p>
                        <p className="text-xs text-slate-500">
                          {ACTION_TYPE_LABELS[log.action_type] ?? log.action_type}
                        </p>
                      </td>
                      <td className="px-5 py-3 text-slate-600">{log.note ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Post-Close Correction Modal */}
      {correctingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Koreksi Status Kehadiran
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {correctingRow.generus?.full_name ?? 'Generus'} · Status saat ini:{' '}
                  <strong>{ATTENDANCE_STATUS_LABELS[correctingRow.status]}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCorrectingRow(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
                aria-label="Tutup"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmCorrection} className="mt-4 space-y-4">
              <div>
                <label htmlFor="corr-status" className="block text-xs font-medium text-slate-700">
                  Status Baru
                </label>
                <select
                  id="corr-status"
                  value={correctionStatus}
                  onChange={(e) => setCorrectionStatus(e.target.value as AttendanceStatus)}
                  className="mt-1 block w-full min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none"
                >
                  <option value="hadir">Hadir</option>
                  <option value="izin">Izin</option>
                  <option value="alfa">Alfa</option>
                </select>
              </div>

              <div>
                <label htmlFor="corr-note" className="block text-xs font-medium text-slate-700">
                  Alasan Koreksi (Tercatat di Audit Log)
                </label>
                <input
                  id="corr-note"
                  type="text"
                  value={correctionNote}
                  onChange={(e) => setCorrectionNote(e.target.value)}
                  placeholder="Contoh: Salah input / peserta datang terlambat"
                  className="mt-1 block w-full min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCorrectingRow(null)}
                  className="inline-flex min-h-[40px] items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={busyRowId === correctingRow.id}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-emerald-800 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-900 disabled:opacity-60 cursor-pointer"
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  <span>{busyRowId === correctingRow.id ? 'Menyimpan...' : 'Simpan Koreksi'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
