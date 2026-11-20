import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  AlertCircle,
  Calendar,
  CalendarPlus,
  Check,
  ChevronRight,
  Plus,
  X,
} from 'lucide-react';
import {useAuth} from '../context/AuthContext';
import {supabase} from '../lib/supabase';
import type {Desa, EventItem, Kelompok, ScopeLevel} from '../types/database';
import {
  canCreateEvent,
  canOperateOpenEvent,
  getAllowedCreateLevels,
  getEventScopeLabel,
  getRegionLookup,
  isEventOwnerOrSuper,
} from '../utils/attendancePermissions';
import {EventDetailView} from './EventDetailView';

export const EventsManager: React.FC = () => {
  const {profile} = useAuth();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [desas, setDesas] = useState<Desa[]>([]);
  const [kelompoks, setKelompoks] = useState<Kelompok[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');

  // Create Event Form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [createLevel, setCreateLevel] = useState<ScopeLevel>('kelompok');
  const [createDesaId, setCreateDesaId] = useState('');
  const [createKelompokId, setCreateKelompokId] = useState('');
  const [creating, setCreating] = useState(false);

  const allowedLevels = useMemo(
    () => (profile ? getAllowedCreateLevels(profile) : []),
    [profile],
  );

  const loadData = useCallback(async () => {
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
          'Gagal memuat daftar acara.',
      );
      setLoading(false);
      return;
    }

    const loadedDesas = (desaRes.data ?? []) as Desa[];
    const loadedKelompoks = (kelRes.data ?? []) as Kelompok[];
    setEvents((evRes.data ?? []) as EventItem[]);
    setDesas(loadedDesas);
    setKelompoks(loadedKelompoks);

    if (allowedLevels.length > 0) {
      setCreateLevel((prev) => (allowedLevels.includes(prev) ? prev : allowedLevels[0]));
    }
    if (profile.desa_id) {
      setCreateDesaId(profile.desa_id);
    } else if (loadedDesas.length > 0) {
      setCreateDesaId((prev) => prev || loadedDesas[0].id);
    }
    if (profile.kelompok_id) {
      setCreateKelompokId(profile.kelompok_id);
    }

    setLoading(false);
  }, [profile, allowedLevels]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const formKelompokOptions = useMemo(() => {
    return kelompoks.filter((k) => k.desa_id === createDesaId);
  }, [kelompoks, createDesaId]);

  useEffect(() => {
    if (createLevel === 'kelompok' && profile?.role === 'super_admin') {
      const stillValid = formKelompokOptions.some((k) => k.id === createKelompokId);
      if (!stillValid) {
        setCreateKelompokId(formKelompokOptions[0]?.id ?? '');
      }
    }
  }, [createLevel, profile?.role, formKelompokOptions, createKelompokId]);

  const {desaMap, kelompokMap} = useMemo(
    () => getRegionLookup(desas, kelompoks),
    [desas, kelompoks],
  );

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => statusFilter === 'all' || ev.status === statusFilter);
  }, [events, statusFilter]);

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !profile || !canCreateEvent(profile)) return;
    const cleanTitle = title.trim();
    if (cleanTitle.length < 3) {
      setError('Nama acara minimal 3 karakter.');
      return;
    }

    const level = allowedLevels.includes(createLevel) ? createLevel : allowedLevels[0];
    const targetDesaId =
      level === 'daerah'
        ? null
        : profile.role === 'admin_desa' || profile.role === 'admin_kelompok'
          ? profile.desa_id
          : createDesaId || null;

    const targetKelompokId =
      level === 'kelompok'
        ? profile.role === 'admin_kelompok'
          ? profile.kelompok_id
          : createKelompokId || null
        : null;

    if ((level === 'desa' || level === 'kelompok') && !targetDesaId) {
      setError('Silakan pilih Desa penyelenggara.');
      return;
    }
    if (level === 'kelompok' && !targetKelompokId) {
      setError('Silakan pilih Kelompok penyelenggara.');
      return;
    }

    setCreating(true);
    setError(null);
    setFeedback(null);

    try {
      // 1. Fetch active generus matching scope
      let gQuery = supabase
        .from('generus')
        .select('id, desa_id, kelompok_id')
        .eq('is_active', true);

      if (level === 'desa' && targetDesaId) {
        gQuery = gQuery.eq('desa_id', targetDesaId);
      } else if (level === 'kelompok' && targetKelompokId) {
        gQuery = gQuery.eq('kelompok_id', targetKelompokId);
      }

      const {data: targetGenerus, error: gErr} = await gQuery;
      if (gErr) throw new Error(gErr.message);

      // 2. Insert event
      const {data: createdEvent, error: evErr} = await supabase
        .from('events')
        .insert({
          title: cleanTitle,
          level,
          desa_id: targetDesaId,
          kelompok_id: targetKelompokId,
          event_date: eventDate,
          status: 'open',
          created_by: profile.id,
          created_by_name: profile.full_name,
        })
        .select('*')
        .single();

      if (evErr || !createdEvent) {
        throw new Error(evErr?.message ?? 'Gagal membuat acara.');
      }

      // 3. Initialize all target generus as belum_hadir
      const attendees = targetGenerus ?? [];
      if (attendees.length > 0) {
        const rows = attendees.map((g) => ({
          event_id: createdEvent.id,
          generus_id: g.id,
          desa_id: g.desa_id,
          kelompok_id: g.kelompok_id,
          status: 'belum_hadir',
          method: 'initial',
        }));

        const {error: attErr} = await supabase.from('attendances').insert(rows);
        if (attErr) throw new Error(attErr.message);
      }

      setTitle('');
      setShowCreateForm(false);
      setFeedback(
        `Acara "${cleanTitle}" dibuat dengan ${attendees.length} peserta awal (Belum Hadir).`,
      );
      await loadData();
      setSelectedEvent(createdEvent as EventItem);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat acara.');
    } finally {
      setCreating(false);
    }
  };

  if (!profile) return null;

  if (selectedEvent) {
    return (
      <EventDetailView
        event={selectedEvent}
        desas={desas}
        kelompoks={kelompoks}
        onBack={() => {
          setSelectedEvent(null);
          void loadData();
        }}
        onEventUpdated={(updated) => {
          setSelectedEvent(updated);
          setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <Calendar className="h-4 w-4 text-emerald-800 shrink-0" aria-hidden="true" />
              <h2 className="text-base font-semibold text-slate-900">
                {profile.role === 'pamong'
                  ? 'Acara Pengajian Aktif (Scan & Monitor)'
                  : 'Acara Pengajian & Presensi'}
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {profile.role === 'pamong'
                ? 'Pilih acara yang sedang berlangsung untuk membuka Mode Scan Kamera (HP 1) atau Monitor Real-time (HP 2).'
                : 'Buat acara baru, lakukan presensi QR/manual, tutup acara untuk otomatis Alfa, dan pantau Audit Log.'}
            </p>
          </div>

          {canCreateEvent(profile) && (
            <button
              type="button"
              onClick={() => {
                setShowCreateForm((prev) => !prev);
                setError(null);
              }}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-emerald-800 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-900 whitespace-nowrap cursor-pointer"
            >
              <CalendarPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Buat Acara Baru</span>
            </button>
          )}
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

        {showCreateForm && canCreateEvent(profile) && (
          <form
            onSubmit={handleCreateEvent}
            className="mt-5 border-t border-slate-200 pt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-12"
          >
            <div className="lg:col-span-4">
              <label htmlFor="ev-title" className="block text-xs font-medium text-slate-700">
                Nama Acara Pengajian
              </label>
              <input
                id="ev-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Contoh: Pengajian Muda-Mudi Bulan November"
                className="mt-1 block w-full min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none"
                required
                minLength={3}
              />
            </div>

            <div className="lg:col-span-2">
              <label htmlFor="ev-date" className="block text-xs font-medium text-slate-700">
                Tanggal
              </label>
              <input
                id="ev-date"
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="mt-1 block w-full min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none"
                required
              />
            </div>

            {allowedLevels.length > 1 && (
              <div className="lg:col-span-2">
                <label htmlFor="ev-level" className="block text-xs font-medium text-slate-700">
                  Tingkat
                </label>
                <select
                  id="ev-level"
                  value={createLevel}
                  onChange={(e) => setCreateLevel(e.target.value as ScopeLevel)}
                  className="mt-1 block w-full min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none"
                >
                  <option value="daerah">Daerah</option>
                  <option value="desa">Desa</option>
                  <option value="kelompok">Kelompok</option>
                </select>
              </div>
            )}

            {profile.role === 'super_admin' &&
              (createLevel === 'desa' || createLevel === 'kelompok') && (
                <div className="lg:col-span-2">
                  <label htmlFor="ev-desa" className="block text-xs font-medium text-slate-700">
                    Desa
                  </label>
                  <select
                    id="ev-desa"
                    value={createDesaId}
                    onChange={(e) => setCreateDesaId(e.target.value)}
                    className="mt-1 block w-full min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none"
                    required
                  >
                    {desas.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

            {profile.role === 'super_admin' && createLevel === 'kelompok' && (
              <div className="lg:col-span-2">
                <label htmlFor="ev-kelompok" className="block text-xs font-medium text-slate-700">
                  Kelompok
                </label>
                <select
                  id="ev-kelompok"
                  value={createKelompokId}
                  onChange={(e) => setCreateKelompokId(e.target.value)}
                  className="mt-1 block w-full min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none"
                  required
                >
                  {formKelompokOptions.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="sm:col-span-2 lg:col-span-12 flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                <span>Batal</span>
              </button>
              <button
                type="submit"
                disabled={creating}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-emerald-800 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-900 disabled:opacity-60 cursor-pointer"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>{creating ? 'Menyiapkan Peserta...' : 'Buat & Buka Acara'}</span>
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Event List */}
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Daftar Acara</h3>
            <p className="text-xs text-slate-500 tabular-nums">
              Menampilkan {filteredEvents.length} acara sesuai cakupan akun Anda
            </p>
          </div>

          <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {(
              [
                {key: 'all', label: 'Semua'},
                {key: 'open', label: 'Berlangsung'},
                {key: 'closed', label: 'Ditutup'},
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusFilter(tab.key)}
                className={`min-h-[34px] rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  statusFilter === tab.key
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-slate-500">Memuat daftar acara...</div>
        ) : filteredEvents.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-medium text-slate-700">
              Belum ada acara yang tercatat.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {canCreateEvent(profile)
                ? 'Klik Buat Acara Baru di atas untuk memulai presensi.'
                : 'Tunggu Admin Daerah atau Admin Desa membuat acara baru.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredEvents.map((ev) => {
              const operable = canOperateOpenEvent(profile, ev);
              const ownerOrSuper = isEventOwnerOrSuper(profile, ev);
              const readOnlyLabel =
                !operable && !(ev.status === 'closed' && ownerOrSuper)
                  ? ' · Read-Only'
                  : '';

              return (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => setSelectedEvent(ev)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50 cursor-pointer"
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
                        {readOnlyLabel}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-base font-semibold text-slate-900">
                      {ev.title}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Dibuat oleh {ev.created_by_name}
                    </p>
                  </div>

                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
