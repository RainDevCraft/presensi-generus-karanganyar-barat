import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {AlertCircle, Check, Edit2, Plus, Search, ShieldCheck, Trash2, X} from 'lucide-react';
import {useAuth} from '../context/AuthContext';
import {supabase} from '../lib/supabase';
import {
  ROLE_LABELS,
  type Desa,
  type Kelompok,
  type ScopeLevel,
  type UserRole,
  type UserWhitelist,
} from '../types/database';

type WhitelistRoleOption = {
  role: UserRole;
  label: string;
  fixedScope?: ScopeLevel;
};

export const WhitelistManager: React.FC = () => {
  const {profile} = useAuth();
  const [entries, setEntries] = useState<UserWhitelist[]>([]);
  const [desas, setDesas] = useState<Desa[]>([]);
  const [kelompoks, setKelompoks] = useState<Kelompok[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Form state
  const [editingEntry, setEditingEntry] = useState<UserWhitelist | null>(null);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [selectedRoleKey, setSelectedRoleKey] = useState<string>('');
  const [desaId, setDesaId] = useState<string>('');
  const [kelompokId, setKelompokId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const allowedOptions: WhitelistRoleOption[] = useMemo(() => {
    if (!profile) return [];
    if (profile.role === 'super_admin') {
      return [
        {role: 'super_admin', label: 'Super Admin (Semua Wilayah)', fixedScope: 'daerah'},
        {role: 'admin_daerah', label: 'Admin Daerah (Karanganyar Barat)', fixedScope: 'daerah'},
        {role: 'admin_desa', label: 'Admin Desa', fixedScope: 'desa'},
        {role: 'admin_kelompok', label: 'Admin Kelompok', fixedScope: 'kelompok'},
        {role: 'pamong', label: 'Pamong Daerah', fixedScope: 'daerah'},
        {role: 'pamong', label: 'Pamong Desa', fixedScope: 'desa'},
      ];
    }
    if (profile.role === 'admin_daerah') {
      return [
        {role: 'admin_desa', label: 'Admin Desa', fixedScope: 'desa'},
        {role: 'pamong', label: 'Pamong Daerah', fixedScope: 'daerah'},
      ];
    }
    if (profile.role === 'admin_desa') {
      return [
        {role: 'admin_kelompok', label: 'Admin Kelompok', fixedScope: 'kelompok'},
        {role: 'pamong', label: 'Pamong Desa', fixedScope: 'desa'},
      ];
    }
    return [];
  }, [profile]);

  const optionKey = (opt: WhitelistRoleOption) => `${opt.role}::${opt.fixedScope ?? 'daerah'}`;

  const currentOption = useMemo(() => {
    return (
      allowedOptions.find((o) => optionKey(o) === selectedRoleKey) ?? allowedOptions[0] ?? null
    );
  }, [allowedOptions, selectedRoleKey]);

  const loadData = useCallback(async () => {
    if (!supabase || !profile) return;
    setLoading(true);
    setError(null);

    const [wlRes, desaRes, kelRes] = await Promise.all([
      supabase.from('user_whitelist').select('*').order('created_at', {ascending: false}),
      supabase.from('desas').select('*').order('name'),
      supabase.from('kelompoks').select('*').order('name'),
    ]);

    if (wlRes.error || desaRes.error || kelRes.error) {
      setError(
        wlRes.error?.message ??
          desaRes.error?.message ??
          kelRes.error?.message ??
          'Gagal memuat data pengurus.',
      );
      setLoading(false);
      return;
    }

    setEntries((wlRes.data ?? []) as UserWhitelist[]);
    setDesas((desaRes.data ?? []) as Desa[]);
    setKelompoks((kelRes.data ?? []) as Kelompok[]);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!selectedRoleKey && allowedOptions.length > 0) {
      setSelectedRoleKey(optionKey(allowedOptions[0]));
    }
  }, [allowedOptions, selectedRoleKey]);

  useEffect(() => {
    if (profile?.role === 'admin_desa' && profile.desa_id) {
      setDesaId(profile.desa_id);
    } else if (!desaId && desas.length > 0) {
      setDesaId(desas[0].id);
    }
  }, [profile, desas, desaId]);

  const filteredKelompoksForDesa = useMemo(() => {
    return kelompoks.filter((k) => k.desa_id === desaId);
  }, [kelompoks, desaId]);

  useEffect(() => {
    if (currentOption?.fixedScope === 'kelompok') {
      const exists = filteredKelompoksForDesa.some((k) => k.id === kelompokId);
      if (!exists) {
        setKelompokId(filteredKelompoksForDesa[0]?.id ?? '');
      }
    }
  }, [currentOption, filteredKelompoksForDesa, kelompokId]);

  const desaMap = useMemo(() => new Map(desas.map((d) => [d.id, d.name])), [desas]);
  const kelompokMap = useMemo(() => new Map(kelompoks.map((k) => [k.id, k.name])), [kelompoks]);

  const resetForm = () => {
    setEditingEntry(null);
    setEmail('');
    setFullName('');
    if (allowedOptions.length > 0) {
      setSelectedRoleKey(optionKey(allowedOptions[0]));
    }
    if (profile?.role === 'admin_desa' && profile.desa_id) {
      setDesaId(profile.desa_id);
    } else if (desas.length > 0) {
      setDesaId(desas[0].id);
    }
    setKelompokId('');
  };

  const handleStartEdit = (entry: UserWhitelist) => {
    setEditingEntry(entry);
    setEmail(entry.email);
    setFullName(entry.full_name);
    setSelectedRoleKey(`${entry.role}::${entry.scope_level}`);
    setDesaId(entry.desa_id ?? (profile?.desa_id ?? desas[0]?.id ?? ''));
    setKelompokId(entry.kelompok_id ?? '');
    setError(null);
    setFeedback(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !profile || !currentOption) return;

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = fullName.trim();
    if (!cleanEmail.includes('@') || cleanName.length < 2) {
      setError('Masukkan nama lengkap dan email Google yang valid.');
      return;
    }

    const scopeLevel = currentOption.fixedScope ?? 'daerah';
    const targetDesaId =
      scopeLevel === 'daerah'
        ? null
        : profile.role === 'admin_desa'
          ? profile.desa_id
          : desaId || null;

    const targetKelompokId = scopeLevel === 'kelompok' ? kelompokId || null : null;

    if ((scopeLevel === 'desa' || scopeLevel === 'kelompok') && !targetDesaId) {
      setError('Silakan pilih Desa untuk role ini.');
      return;
    }
    if (scopeLevel === 'kelompok' && !targetKelompokId) {
      setError('Silakan pilih Kelompok (buat kelompok terlebih dahulu di tab Wilayah jika masih kosong).');
      return;
    }

    setSubmitting(true);
    setError(null);
    setFeedback(null);

    if (editingEntry) {
      const {error: updateErr} = await supabase
        .from('user_whitelist')
        .update({
          email: cleanEmail,
          full_name: cleanName,
          role: currentOption.role,
          scope_level: scopeLevel,
          desa_id: targetDesaId,
          kelompok_id: targetKelompokId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingEntry.id);

      setSubmitting(false);
      if (updateErr) {
        setError(updateErr.message);
        return;
      }
      setFeedback(`Data pengurus ${cleanName} berhasil diperbarui.`);
      resetForm();
      await loadData();
      return;
    }

    const {error: insertErr} = await supabase.from('user_whitelist').insert({
      email: cleanEmail,
      full_name: cleanName,
      role: currentOption.role,
      scope_level: scopeLevel,
      desa_id: targetDesaId,
      kelompok_id: targetKelompokId,
      is_active: true,
      created_by: profile.id,
    });

    setSubmitting(false);
    if (insertErr) {
      setError(
        insertErr.code === '23505'
          ? 'Email Google tersebut sudah terdaftar di daftar pengurus.'
          : insertErr.message,
      );
      return;
    }

    setFeedback(`Akun ${cleanEmail} berhasil didaftarkan sebagai ${currentOption.label}.`);
    resetForm();
    await loadData();
  };

  const handleToggleActive = async (entry: UserWhitelist) => {
    if (!supabase || !profile) return;
    if (entry.email.toLowerCase() === profile.email.toLowerCase()) {
      setError('Anda tidak dapat menonaktifkan akun Anda sendiri.');
      return;
    }

    setError(null);
    setFeedback(null);
    const {error: updateErr} = await supabase
      .from('user_whitelist')
      .update({
        is_active: !entry.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entry.id);

    if (updateErr) {
      setError(updateErr.message);
      return;
    }
    setFeedback(
      `Akses ${entry.full_name} berhasil ${entry.is_active ? 'dinonaktifkan' : 'diaktifkan'}.`,
    );
    await loadData();
  };

  const handleDelete = async (entry: UserWhitelist) => {
    if (!supabase || !profile) return;
    if (entry.email.toLowerCase() === profile.email.toLowerCase()) {
      setError('Anda tidak dapat menghapus akun Anda sendiri.');
      setConfirmDeleteId(null);
      return;
    }

    setError(null);
    setFeedback(null);
    const {error: delErr} = await supabase.from('user_whitelist').delete().eq('id', entry.id);
    if (delErr) {
      setError(delErr.message);
      setConfirmDeleteId(null);
      return;
    }
    setConfirmDeleteId(null);
    setFeedback(`Email ${entry.email} dihapus dari daftar pengurus.`);
    await loadData();
  };

  const canManageEntry = (entry: UserWhitelist): boolean => {
    if (!profile) return false;
    if (profile.role === 'super_admin') return true;
    if (profile.role === 'admin_daerah') {
      return entry.role === 'admin_desa' || (entry.role === 'pamong' && entry.scope_level === 'daerah');
    }
    if (profile.role === 'admin_desa') {
      return (
        entry.desa_id === profile.desa_id &&
        (entry.role === 'admin_kelompok' || (entry.role === 'pamong' && entry.scope_level === 'desa'))
      );
    }
    return false;
  };

  const formatEntryScope = (entry: UserWhitelist) => {
    if (entry.role === 'super_admin') return 'Semua Wilayah';
    if (entry.scope_level === 'daerah') return 'Daerah Karanganyar Barat';
    if (entry.scope_level === 'desa') return `Desa ${desaMap.get(entry.desa_id ?? '') ?? '-'}`;
    return `${kelompokMap.get(entry.kelompok_id ?? '') ?? '-'}, Desa ${desaMap.get(entry.desa_id ?? '') ?? '-'}`;
  };

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((item) => {
      if (roleFilter !== 'all' && item.role !== roleFilter) return false;
      if (!q) return true;
      return (
        item.full_name.toLowerCase().includes(q) ||
        item.email.toLowerCase().includes(q)
      );
    });
  }, [entries, search, roleFilter]);

  if (allowedOptions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Add / Edit Form */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-4 w-4 text-emerald-800 shrink-0" aria-hidden="true" />
              <h2 className="text-base font-semibold text-slate-900">
                {editingEntry ? `Ubah Akun: ${editingEntry.full_name}` : 'Daftarkan Email Pengurus / Pamong'}
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Pengurus yang didaftarkan cukup klik Masuk dengan Google memakai email Gmail di bawah tanpa perlu password tambahan.
            </p>
          </div>
          {editingEntry && (
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Batal Ubah</span>
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
          <div className="lg:col-span-3">
            <label htmlFor="wl-name" className="block text-xs font-medium text-slate-700">
              Nama Pengurus
            </label>
            <input
              id="wl-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Contoh: Ahmad Sulaiman"
              className="mt-1 block w-full min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none"
              required
              minLength={2}
            />
          </div>

          <div className="lg:col-span-3">
            <label htmlFor="wl-email" className="block text-xs font-medium text-slate-700">
              Email Google (Gmail)
            </label>
            <input
              id="wl-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@gmail.com"
              className="mt-1 block w-full min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none"
              required
            />
          </div>

          <div className="lg:col-span-3">
            <label htmlFor="wl-role" className="block text-xs font-medium text-slate-700">
              Peran (Role)
            </label>
            <select
              id="wl-role"
              value={selectedRoleKey}
              onChange={(e) => setSelectedRoleKey(e.target.value)}
              className="mt-1 block w-full min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none"
              required
            >
              {allowedOptions.map((opt) => (
                <option key={optionKey(opt)} value={optionKey(opt)}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {(currentOption?.fixedScope === 'desa' || currentOption?.fixedScope === 'kelompok') && (
            <div className="lg:col-span-3">
              <label htmlFor="wl-desa" className="block text-xs font-medium text-slate-700">
                Desa
              </label>
              <select
                id="wl-desa"
                value={desaId}
                onChange={(e) => setDesaId(e.target.value)}
                disabled={profile?.role === 'admin_desa'}
                className="mt-1 block w-full min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none disabled:bg-slate-100"
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

          {currentOption?.fixedScope === 'kelompok' && (
            <div className="lg:col-span-3">
              <label htmlFor="wl-kelompok" className="block text-xs font-medium text-slate-700">
                Kelompok
              </label>
              <select
                id="wl-kelompok"
                value={kelompokId}
                onChange={(e) => setKelompokId(e.target.value)}
                className="mt-1 block w-full min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none"
                required
              >
                {filteredKelompoksForDesa.length === 0 ? (
                  <option value="">Belum ada kelompok di desa ini</option>
                ) : (
                  filteredKelompoksForDesa.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))
                )}
              </select>
            </div>
          )}

          <div className="sm:col-span-2 lg:col-span-3 flex items-end">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full min-h-[42px] items-center justify-center gap-2 rounded-lg bg-emerald-800 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-900 disabled:opacity-60 whitespace-nowrap cursor-pointer"
            >
              <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {submitting
                  ? 'Menyimpan...'
                  : editingEntry
                    ? 'Simpan Perubahan'
                    : 'Daftarkan Akun'}
              </span>
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

      {/* Whitelist Table */}
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Daftar Pengurus &amp; Pamong
            </h3>
            <p className="text-xs text-slate-500 tabular-nums">
              Menampilkan {filteredEntries.length} dari {entries.length} akun terdaftar
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama atau email..."
                className="w-full sm:w-56 min-h-[38px] rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-1.5 text-xs text-slate-900 focus:border-emerald-700 focus:outline-none"
              />
            </div>

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              aria-label="Filter peran"
              className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 focus:border-emerald-700 focus:outline-none"
            >
              <option value="all">Semua Peran</option>
              <option value="super_admin">Super Admin</option>
              <option value="admin_daerah">Admin Daerah</option>
              <option value="admin_desa">Admin Desa</option>
              <option value="admin_kelompok">Admin Kelompok</option>
              <option value="pamong">Pamong</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-slate-500">Memuat daftar pengurus...</div>
        ) : filteredEntries.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Tidak ada akun pengurus yang sesuai dengan filter saat ini.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-5 py-3">Pengurus</th>
                  <th className="px-5 py-3">Peran &amp; Wilayah</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEntries.map((entry) => {
                  const editable = canManageEntry(entry);
                  const isSelf = entry.email.toLowerCase() === profile?.email.toLowerCase();
                  return (
                    <tr key={entry.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-900">{entry.full_name}</p>
                        <p className="font-mono text-xs text-slate-500">{entry.email}</p>
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-800">{ROLE_LABELS[entry.role]}</p>
                        <p className="text-xs text-slate-500">{formatEntryScope(entry)}</p>
                      </td>
                      <td className="px-5 py-3 text-xs font-semibold">
                        {entry.is_active ? (
                          <span className="text-emerald-800">Aktif</span>
                        ) : (
                          <span className="text-red-700">Nonaktif</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {!editable ? (
                          <span className="text-xs text-slate-400">Hanya lihat</span>
                        ) : confirmDeleteId === entry.id ? (
                          <div className="inline-flex items-center gap-2">
                            <span className="text-xs text-red-700">Hapus?</span>
                            <button
                              type="button"
                              onClick={() => handleDelete(entry)}
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
                              onClick={() => handleStartEdit(entry)}
                              className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                            >
                              <Edit2 className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Ubah</span>
                            </button>
                            {!isSelf && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleToggleActive(entry)}
                                  className="inline-flex min-h-[36px] items-center rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                                >
                                  {entry.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(entry.id)}
                                  className="inline-flex min-h-[36px] items-center rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 cursor-pointer"
                                  aria-label={`Hapus ${entry.full_name}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
