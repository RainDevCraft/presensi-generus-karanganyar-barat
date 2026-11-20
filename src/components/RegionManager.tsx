import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {AlertCircle, Check, Edit2, MapPin, Plus, Trash2, X} from 'lucide-react';
import {useAuth} from '../context/AuthContext';
import {supabase} from '../lib/supabase';
import type {Desa, Kelompok} from '../types/database';

export const RegionManager: React.FC = () => {
  const {profile} = useAuth();
  const [desas, setDesas] = useState<Desa[]>([]);
  const [kelompoks, setKelompoks] = useState<Kelompok[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [selectedDesaId, setSelectedDesaId] = useState<string>('all');
  const [newKelompokName, setNewKelompokName] = useState('');
  const [newKelompokDesaId, setNewKelompokDesaId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const isTopAdmin = profile?.role === 'super_admin' || profile?.role === 'admin_daerah';
  const isDesaAdmin = profile?.role === 'admin_desa';

  const loadData = useCallback(async () => {
    if (!supabase || !profile) return;
    setLoading(true);
    setError(null);

    const [desaRes, kelRes] = await Promise.all([
      supabase.from('desas').select('*').order('name'),
      supabase.from('kelompoks').select('*').order('name'),
    ]);

    if (desaRes.error || kelRes.error) {
      setError(desaRes.error?.message ?? kelRes.error?.message ?? 'Gagal memuat wilayah.');
      setLoading(false);
      return;
    }

    const loadedDesas = (desaRes.data ?? []) as Desa[];
    const loadedKelompoks = (kelRes.data ?? []) as Kelompok[];

    setDesas(loadedDesas);
    setKelompoks(loadedKelompoks);

    if (isDesaAdmin && profile.desa_id) {
      setSelectedDesaId(profile.desa_id);
      setNewKelompokDesaId(profile.desa_id);
    } else if (!newKelompokDesaId && loadedDesas.length > 0) {
      setNewKelompokDesaId(loadedDesas[0].id);
    }

    setLoading(false);
  }, [profile, isDesaAdmin, newKelompokDesaId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const desaMap = useMemo(() => new Map(desas.map((d) => [d.id, d.name])), [desas]);

  const visibleDesas = useMemo(() => {
    if (isDesaAdmin && profile?.desa_id) {
      return desas.filter((d) => d.id === profile.desa_id);
    }
    return desas;
  }, [desas, isDesaAdmin, profile?.desa_id]);

  const filteredKelompoks = useMemo(() => {
    return kelompoks.filter((k) => {
      if (isDesaAdmin && profile?.desa_id && k.desa_id !== profile.desa_id) {
        return false;
      }
      if (selectedDesaId !== 'all' && k.desa_id !== selectedDesaId) {
        return false;
      }
      return true;
    });
  }, [kelompoks, isDesaAdmin, profile?.desa_id, selectedDesaId]);

  const handleAddKelompok = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !newKelompokName.trim() || !newKelompokDesaId) return;
    setSubmitting(true);
    setError(null);
    setFeedback(null);

    const {error: insertErr} = await supabase.from('kelompoks').insert({
      desa_id: newKelompokDesaId,
      name: newKelompokName.trim(),
    });

    setSubmitting(false);
    if (insertErr) {
      setError(
        insertErr.code === '23505'
          ? 'Nama kelompok tersebut sudah ada di desa yang dipilih.'
          : insertErr.message,
      );
      return;
    }

    setNewKelompokName('');
    setFeedback('Kelompok baru berhasil ditambahkan.');
    await loadData();
  };

  const handleSaveEdit = async (id: string) => {
    if (!supabase || !editingName.trim()) return;
    setError(null);
    setFeedback(null);

    const {error: updateErr} = await supabase
      .from('kelompoks')
      .update({name: editingName.trim()})
      .eq('id', id);

    if (updateErr) {
      setError(updateErr.message);
      return;
    }

    setEditingId(null);
    setEditingName('');
    setFeedback('Nama kelompok berhasil diperbarui.');
    await loadData();
  };

  const handleDelete = async (id: string) => {
    if (!supabase) return;
    setError(null);
    setFeedback(null);

    const {error: delErr} = await supabase.from('kelompoks').delete().eq('id', id);
    if (delErr) {
      setError(
        delErr.code === '23503'
          ? 'Kelompok tidak dapat dihapus karena masih memiliki data generus, pengurus, atau acara.'
          : delErr.message,
      );
      setConfirmDeleteId(null);
      return;
    }

    setConfirmDeleteId(null);
    setFeedback('Kelompok berhasil dihapus.');
    await loadData();
  };

  if (!isTopAdmin && !isDesaAdmin) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Add Kelompok Form */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex items-center gap-2.5">
          <MapPin className="h-4 w-4 text-emerald-800 shrink-0" aria-hidden="true" />
          <h2 className="text-base font-semibold text-slate-900">
            Tambah Kelompok Baru
          </h2>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Lengkapi daftar kelompok untuk Desa Karangmojo, Kaling, Banjarharjo, maupun pemekaran baru.
        </p>

        <form onSubmit={handleAddKelompok} className="mt-4 grid gap-3 sm:grid-cols-12">
          <div className="sm:col-span-4">
            <label htmlFor="region-desa" className="block text-xs font-medium text-slate-700">
              Desa
            </label>
            <select
              id="region-desa"
              value={newKelompokDesaId}
              onChange={(e) => setNewKelompokDesaId(e.target.value)}
              disabled={isDesaAdmin}
              className="mt-1 block w-full min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none disabled:bg-slate-100"
              required
            >
              {visibleDesas.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-5">
            <label htmlFor="region-kelompok-name" className="block text-xs font-medium text-slate-700">
              Nama Kelompok
            </label>
            <input
              id="region-kelompok-name"
              type="text"
              value={newKelompokName}
              onChange={(e) => setNewKelompokName(e.target.value)}
              placeholder="Contoh: Karangmojo 1"
              className="mt-1 block w-full min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none"
              required
              minLength={2}
            />
          </div>

          <div className="sm:col-span-3 flex items-end">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full min-h-[42px] items-center justify-center gap-2 rounded-lg bg-emerald-800 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-900 disabled:opacity-60 whitespace-nowrap cursor-pointer"
            >
              <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{submitting ? 'Menyimpan...' : 'Tambah Kelompok'}</span>
            </button>
          </div>
        </form>

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

      {/* Kelompok List */}
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Daftar Kelompok Terdaftar
            </h3>
            <p className="text-xs text-slate-500 tabular-nums">
              Total ditampilkan: {filteredKelompoks.length} kelompok
            </p>
          </div>

          {!isDesaAdmin && (
            <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setSelectedDesaId('all')}
                className={`min-h-[34px] rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  selectedDesaId === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Semua Desa
              </button>
              {desas.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setSelectedDesaId(d.id)}
                  className={`min-h-[34px] rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    selectedDesaId === d.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {d.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div className="p-6 text-sm text-slate-500">Memuat daftar kelompok...</div>
        ) : filteredKelompoks.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-medium text-slate-700">
              Belum ada kelompok pada desa yang dipilih.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Gunakan formulir di atas untuk menambahkan kelompok baru.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-5 py-3">Nama Kelompok</th>
                  <th className="px-5 py-3">Desa</th>
                  <th className="px-5 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredKelompoks.map((kel) => (
                  <tr key={kel.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3 font-medium text-slate-900">
                      {editingId === kel.id ? (
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="w-full max-w-xs min-h-[36px] rounded-md border border-emerald-600 px-2.5 py-1 text-sm focus:outline-none"
                          autoFocus
                        />
                      ) : (
                        kel.name
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {desaMap.get(kel.desa_id) ?? '-'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {editingId === kel.id ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(kel.id)}
                            className="inline-flex min-h-[36px] items-center gap-1 rounded-md bg-emerald-800 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-900 cursor-pointer"
                          >
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Simpan</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="inline-flex min-h-[36px] items-center rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      ) : confirmDeleteId === kel.id ? (
                        <div className="inline-flex items-center gap-2">
                          <span className="text-xs text-red-700">Hapus?</span>
                          <button
                            type="button"
                            onClick={() => handleDelete(kel.id)}
                            className="inline-flex min-h-[36px] items-center rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 cursor-pointer"
                          >
                            Ya
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="inline-flex min-h-[36px] items-center rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(kel.id);
                              setEditingName(kel.name);
                              setConfirmDeleteId(null);
                            }}
                            className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                          >
                            <Edit2 className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Ubah</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(kel.id)}
                            className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Hapus</span>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
