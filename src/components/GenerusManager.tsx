import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  AlertCircle,
  Check,
  Download,
  Edit2,
  FileSpreadsheet,
  Plus,
  Printer,
  QrCode,
  Search,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import {useAuth} from '../context/AuthContext';
import {supabase} from '../lib/supabase';
import type {Desa, Generus, Kelompok} from '../types/database';
import {
  downloadGenerusExcelTemplate,
  parseAndValidateGenerusExcel,
  type ImportValidationResult,
} from '../utils/excelGenerus';
import {downloadBulkQRZip, type QRCardPayload} from '../utils/qrCard';
import {BulkQRPrintModal, QRCardModal} from './QRCardModal';

export const GenerusManager: React.FC = () => {
  const {profile} = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [generusList, setGenerusList] = useState<Generus[]>([]);
  const [desas, setDesas] = useState<Desa[]>([]);
  const [kelompoks, setKelompoks] = useState<Kelompok[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [filterDesaId, setFilterDesaId] = useState<string>('all');
  const [filterKelompokId, setFilterKelompokId] = useState<string>('all');
  const [filterGender, setFilterGender] = useState<'all' | 'L' | 'P'>('all');

  // Add / Edit Form
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<Generus | null>(null);
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState<'L' | 'P'>('L');
  const [formDesaId, setFormDesaId] = useState('');
  const [formKelompokId, setFormKelompokId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Excel Import Preview
  const [importPreview, setImportPreview] = useState<ImportValidationResult | null>(null);
  const [importing, setImporting] = useState(false);

  // QR Modals & Bulk ZIP
  const [activeQRCard, setActiveQRCard] = useState<QRCardPayload | null>(null);
  const [bulkPrintItems, setBulkPrintItems] = useState<QRCardPayload[]>([]);
  const [zipProgress, setZipProgress] = useState<{current: number; total: number} | null>(null);

  const isTopAdmin = profile?.role === 'super_admin' || profile?.role === 'admin_daerah';
  const isDesaAdmin = profile?.role === 'admin_desa';
  const isKelompokAdmin = profile?.role === 'admin_kelompok';

  const loadData = useCallback(async () => {
    if (!supabase || !profile) return;
    setLoading(true);
    setError(null);

    const [genRes, desaRes, kelRes] = await Promise.all([
      supabase.from('generus').select('*').order('full_name'),
      supabase.from('desas').select('*').order('name'),
      supabase.from('kelompoks').select('*').order('name'),
    ]);

    if (genRes.error || desaRes.error || kelRes.error) {
      setError(
        genRes.error?.message ??
          desaRes.error?.message ??
          kelRes.error?.message ??
          'Gagal memuat data generus.',
      );
      setLoading(false);
      return;
    }

    const loadedDesas = (desaRes.data ?? []) as Desa[];
    const loadedKelompoks = (kelRes.data ?? []) as Kelompok[];
    setGenerusList((genRes.data ?? []) as Generus[]);
    setDesas(loadedDesas);
    setKelompoks(loadedKelompoks);

    if (isKelompokAdmin && profile.desa_id && profile.kelompok_id) {
      setFilterDesaId(profile.desa_id);
      setFilterKelompokId(profile.kelompok_id);
      setFormDesaId(profile.desa_id);
      setFormKelompokId(profile.kelompok_id);
    } else if (isDesaAdmin && profile.desa_id) {
      setFilterDesaId(profile.desa_id);
      setFormDesaId(profile.desa_id);
      const firstKel = loadedKelompoks.find((k) => k.desa_id === profile.desa_id);
      if (firstKel) setFormKelompokId((prev) => prev || firstKel.id);
    } else if (loadedDesas.length > 0) {
      setFormDesaId((prev) => prev || loadedDesas[0].id);
    }

    setLoading(false);
  }, [profile, isDesaAdmin, isKelompokAdmin]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const desaMap = useMemo(() => new Map(desas.map((d) => [d.id, d.name])), [desas]);
  const kelompokMap = useMemo(() => new Map(kelompoks.map((k) => [k.id, k.name])), [kelompoks]);

  const formKelompokOptions = useMemo(() => {
    return kelompoks.filter((k) => k.desa_id === formDesaId);
  }, [kelompoks, formDesaId]);

  useEffect(() => {
    if (!isKelompokAdmin && formDesaId) {
      const stillValid = formKelompokOptions.some((k) => k.id === formKelompokId);
      if (!stillValid) {
        setFormKelompokId(formKelompokOptions[0]?.id ?? '');
      }
    }
  }, [formDesaId, formKelompokOptions, formKelompokId, isKelompokAdmin]);

  const filterKelompokOptions = useMemo(() => {
    if (filterDesaId === 'all') return kelompoks;
    return kelompoks.filter((k) => k.desa_id === filterDesaId);
  }, [kelompoks, filterDesaId]);

  const filteredGenerus = useMemo(() => {
    const q = search.trim().toLowerCase();
    return generusList.filter((item) => {
      if (filterDesaId !== 'all' && item.desa_id !== filterDesaId) return false;
      if (filterKelompokId !== 'all' && item.kelompok_id !== filterKelompokId) return false;
      if (filterGender !== 'all' && item.gender !== filterGender) return false;
      if (!q) return true;
      return (
        item.full_name.toLowerCase().includes(q) ||
        item.qr_token.toLowerCase().includes(q)
      );
    });
  }, [generusList, filterDesaId, filterKelompokId, filterGender, search]);

  const openAddForm = () => {
    setEditingItem(null);
    setFullName('');
    setGender('L');
    if (profile?.role === 'admin_kelompok' && profile.desa_id && profile.kelompok_id) {
      setFormDesaId(profile.desa_id);
      setFormKelompokId(profile.kelompok_id);
    } else if (profile?.role === 'admin_desa' && profile.desa_id) {
      setFormDesaId(profile.desa_id);
      const firstKel = kelompoks.find((k) => k.desa_id === profile.desa_id);
      setFormKelompokId(firstKel?.id ?? '');
    } else {
      const targetDesa = filterDesaId !== 'all' ? filterDesaId : desas[0]?.id ?? '';
      setFormDesaId(targetDesa);
      const firstKel = kelompoks.find((k) => k.desa_id === targetDesa);
      setFormKelompokId(filterKelompokId !== 'all' ? filterKelompokId : firstKel?.id ?? '');
    }
    setShowForm(true);
    setError(null);
    setFeedback(null);
  };

  const openEditForm = (item: Generus) => {
    setEditingItem(item);
    setFullName(item.full_name);
    setGender(item.gender);
    setFormDesaId(item.desa_id);
    setFormKelompokId(item.kelompok_id);
    setShowForm(true);
    setError(null);
    setFeedback(null);
  };

  const handleSaveGenerus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !profile) return;
    const cleanName = fullName.trim();
    if (cleanName.length < 2) {
      setError('Nama lengkap minimal 2 huruf.');
      return;
    }

    const targetDesa = isKelompokAdmin || isDesaAdmin ? profile.desa_id! : formDesaId;
    const targetKelompok = isKelompokAdmin ? profile.kelompok_id! : formKelompokId;

    if (!targetDesa || !targetKelompok) {
      setError('Pastikan Desa dan Kelompok sudah dipilih.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setFeedback(null);

    if (editingItem) {
      const {error: updateErr} = await supabase
        .from('generus')
        .update({
          full_name: cleanName,
          gender,
          desa_id: targetDesa,
          kelompok_id: targetKelompok,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingItem.id);

      setSubmitting(false);
      if (updateErr) {
        setError(updateErr.message);
        return;
      }
      setFeedback(`Data ${cleanName} berhasil diperbarui.`);
      setShowForm(false);
      setEditingItem(null);
      await loadData();
      return;
    }

    const {error: insertErr} = await supabase.from('generus').insert({
      full_name: cleanName,
      gender,
      desa_id: targetDesa,
      kelompok_id: targetKelompok,
      created_by: profile.id,
    });

    setSubmitting(false);
    if (insertErr) {
      setError(insertErr.message);
      return;
    }

    setFeedback(`Generus ${cleanName} berhasil ditambahkan beserta QR Code uniknya.`);
    setShowForm(false);
    await loadData();
  };

  const handleToggleActive = async (item: Generus) => {
    if (!supabase) return;
    setError(null);
    const {error: updateErr} = await supabase
      .from('generus')
      .update({
        is_active: !item.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id);

    if (updateErr) {
      setError(updateErr.message);
      return;
    }
    await loadData();
  };

  const handleDelete = async (id: string) => {
    if (!supabase) return;
    setError(null);
    const {error: delErr} = await supabase.from('generus').delete().eq('id', id);
    if (delErr) {
      setError(delErr.message);
      setConfirmDeleteId(null);
      return;
    }
    setConfirmDeleteId(null);
    setFeedback('Data generus berhasil dihapus.');
    await loadData();
  };

  const handleDownloadTemplate = async () => {
    if (!profile) return;
    try {
      await downloadGenerusExcelTemplate(desas, kelompoks, profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat template Excel.');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !profile) return;

    setError(null);
    setFeedback(null);
    try {
      const result = await parseAndValidateGenerusExcel(file, desas, kelompoks, profile);
      setImportPreview(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membaca file Excel.');
    }
  };

  const handleConfirmImport = async () => {
    if (!supabase || !profile || !importPreview || importPreview.validRows.length === 0) return;
    setImporting(true);
    setError(null);

    const payload = importPreview.validRows.map((r) => ({
      full_name: r.fullName,
      gender: r.gender,
      desa_id: r.desaId,
      kelompok_id: r.kelompokId,
      created_by: profile.id,
    }));

    const {error: insertErr} = await supabase.from('generus').insert(payload);
    setImporting(false);

    if (insertErr) {
      setError(insertErr.message);
      return;
    }

    const total = payload.length;
    setImportPreview(null);
    setFeedback(`${total} data generus berhasil diimport dan dibuatkan QR Code otomatis.`);
    await loadData();
  };

  const toQRPayload = (item: Generus): QRCardPayload => ({
    fullName: item.full_name,
    gender: item.gender,
    desaName: desaMap.get(item.desa_id) ?? '-',
    kelompokName: kelompokMap.get(item.kelompok_id) ?? '-',
    qrToken: item.qr_token,
  });

  const handleDownloadBulkZip = async () => {
    if (filteredGenerus.length === 0 || zipProgress) return;
    setError(null);
    setFeedback(null);
    try {
      const payloads = filteredGenerus.map(toQRPayload);
      await downloadBulkQRZip(payloads, (current, total) => {
        setZipProgress({current, total});
      });
      setFeedback(`${payloads.length} kartu QR berhasil dikemas ke dalam file ZIP.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat file ZIP kartu QR.');
    } finally {
      setZipProgress(null);
    }
  };

  if (!profile || profile.role === 'pamong') {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Toolbar Header */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <Users className="h-4 w-4 text-emerald-800 shrink-0" aria-hidden="true" />
              <h2 className="text-base font-semibold text-slate-900">
                Data Generus &amp; Kartu QR Presensi
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Setiap generus memiliki 1 QR Code permanen untuk absen di tingkat Kelompok, Desa, maupun Daerah.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
            >
              <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Template Excel</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
            >
              <Upload className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Import Excel</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="hidden"
            />

            {filteredGenerus.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleDownloadBulkZip}
                  disabled={!!zipProgress}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap cursor-pointer"
                >
                  <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    {zipProgress
                      ? `Menyiapkan ${zipProgress.current}/${zipProgress.total}...`
                      : `Unduh ZIP QR (${filteredGenerus.length})`}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setBulkPrintItems(filteredGenerus.map(toQRPayload))}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                >
                  <Printer className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Cetak QR ({filteredGenerus.length})</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={openAddForm}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-emerald-800 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-900 whitespace-nowrap cursor-pointer"
            >
              <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Tambah Generus</span>
            </button>
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

        {/* Inline Add / Edit Form */}
        {showForm && (
          <form
            onSubmit={handleSaveGenerus}
            className="mt-5 border-t border-slate-200 pt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-12"
          >
            <div className="lg:col-span-4">
              <label htmlFor="gen-name" className="block text-xs font-medium text-slate-700">
                Nama Lengkap Generus
              </label>
              <input
                id="gen-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nama lengkap"
                className="mt-1 block w-full min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none"
                required
                minLength={2}
              />
            </div>

            <div className="lg:col-span-2">
              <label htmlFor="gen-gender" className="block text-xs font-medium text-slate-700">
                Jenis Kelamin
              </label>
              <select
                id="gen-gender"
                value={gender}
                onChange={(e) => setGender(e.target.value as 'L' | 'P')}
                className="mt-1 block w-full min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none"
              >
                <option value="L">L (Putra)</option>
                <option value="P">P (Putri)</option>
              </select>
            </div>

            <div className="lg:col-span-3">
              <label htmlFor="gen-desa" className="block text-xs font-medium text-slate-700">
                Desa
              </label>
              <select
                id="gen-desa"
                value={formDesaId}
                onChange={(e) => setFormDesaId(e.target.value)}
                disabled={isDesaAdmin || isKelompokAdmin}
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

            <div className="lg:col-span-3">
              <label htmlFor="gen-kelompok" className="block text-xs font-medium text-slate-700">
                Kelompok
              </label>
              <select
                id="gen-kelompok"
                value={formKelompokId}
                onChange={(e) => setFormKelompokId(e.target.value)}
                disabled={isKelompokAdmin}
                className="mt-1 block w-full min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none disabled:bg-slate-100"
                required
              >
                {formKelompokOptions.length === 0 ? (
                  <option value="">Belum ada kelompok di desa ini</option>
                ) : (
                  formKelompokOptions.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="sm:col-span-2 lg:col-span-12 flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingItem(null);
                }}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                <span>Batal</span>
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-emerald-800 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-900 disabled:opacity-60 cursor-pointer"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                <span>
                  {submitting
                    ? 'Menyimpan...'
                    : editingItem
                      ? 'Simpan Perubahan'
                      : 'Simpan Generus'}
                </span>
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Excel Import Validation Preview */}
      {importPreview && (
        <section className="rounded-xl border border-emerald-300 bg-white p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2.5">
              <FileSpreadsheet className="h-5 w-5 text-emerald-800 shrink-0" aria-hidden="true" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Pratinjau Import Excel
                </h3>
                <p className="text-xs text-slate-600 tabular-nums">
                  {importPreview.validRows.length} baris siap disimpan ·{' '}
                  {importPreview.errors.length} baris bermasalah
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setImportPreview(null)}
                className="inline-flex min-h-[40px] items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={importing || importPreview.validRows.length === 0}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-emerald-800 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-900 disabled:opacity-50 cursor-pointer"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                <span>
                  {importing
                    ? 'Mengimport...'
                    : `Simpan ${importPreview.validRows.length} Data Valid`}
                </span>
              </button>
            </div>
          </div>

          {importPreview.errors.length > 0 && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3.5">
              <p className="text-xs font-semibold text-red-900">
                Baris yang dilewati karena tidak valid:
              </p>
              <ul className="mt-2 max-h-40 overflow-y-auto space-y-1 text-xs text-red-800 list-disc pl-5">
                {importPreview.errors.map((err, idx) => (
                  <li key={`${err.rowNumber}-${idx}`}>
                    Baris {err.rowNumber} ({err.rawName}): {err.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {importPreview.validRows.length > 0 && (
            <div className="mt-4 max-h-56 overflow-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2">Baris</th>
                    <th className="px-3 py-2">Nama Lengkap</th>
                    <th className="px-3 py-2">L/P</th>
                    <th className="px-3 py-2">Desa</th>
                    <th className="px-3 py-2">Kelompok</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {importPreview.validRows.map((row) => (
                    <tr key={row.rowNumber}>
                      <td className="px-3 py-2 font-mono text-slate-500">{row.rowNumber}</td>
                      <td className="px-3 py-2 font-medium text-slate-900">{row.fullName}</td>
                      <td className="px-3 py-2">{row.gender}</td>
                      <td className="px-3 py-2">{row.desaName}</td>
                      <td className="px-3 py-2">{row.kelompokName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Generus Table & Filters */}
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Daftar Generus</h3>
            <p className="text-xs text-slate-500 tabular-nums">
              Menampilkan {filteredGenerus.length} dari {generusList.length} generus
            </p>
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
                placeholder="Cari nama atau ID QR..."
                className="w-full sm:w-52 min-h-[38px] rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-1.5 text-xs text-slate-900 focus:border-emerald-700 focus:outline-none"
              />
            </div>

            {isTopAdmin && (
              <select
                value={filterDesaId}
                onChange={(e) => {
                  setFilterDesaId(e.target.value);
                  setFilterKelompokId('all');
                }}
                aria-label="Filter desa"
                className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 focus:border-emerald-700 focus:outline-none"
              >
                <option value="all">Semua Desa</option>
                {desas.map((d) => (
                  <option key={d.id} value={d.id}>
                    Desa {d.name}
                  </option>
                ))}
              </select>
            )}

            {!isKelompokAdmin && (
              <select
                value={filterKelompokId}
                onChange={(e) => setFilterKelompokId(e.target.value)}
                aria-label="Filter kelompok"
                className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 focus:border-emerald-700 focus:outline-none"
              >
                <option value="all">Semua Kelompok</option>
                {filterKelompokOptions.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
            )}

            <select
              value={filterGender}
              onChange={(e) => setFilterGender(e.target.value as 'all' | 'L' | 'P')}
              aria-label="Filter jenis kelamin"
              className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 focus:border-emerald-700 focus:outline-none"
            >
              <option value="all">Putra &amp; Putri</option>
              <option value="L">Putra (L)</option>
              <option value="P">Putri (P)</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-slate-500">Memuat data generus...</div>
        ) : filteredGenerus.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-medium text-slate-700">
              Belum ada data generus pada cakupan ini.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Tambahkan manual atau gunakan tombol Template &amp; Import Excel di atas.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-5 py-3">Nama Generus</th>
                  <th className="px-5 py-3">L/P</th>
                  <th className="px-5 py-3">Wilayah</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredGenerus.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-900">{item.full_name}</p>
                      <p className="font-mono text-[11px] text-slate-400">{item.qr_token}</p>
                    </td>
                    <td className="px-5 py-3 text-slate-700">
                      {item.gender === 'L' ? 'Putra (L)' : 'Putri (P)'}
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-slate-900">{kelompokMap.get(item.kelompok_id) ?? '-'}</p>
                      <p className="text-xs text-slate-500">
                        Desa {desaMap.get(item.desa_id) ?? '-'}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-xs font-semibold">
                      {item.is_active ? (
                        <span className="text-emerald-800">Aktif</span>
                      ) : (
                        <span className="text-slate-500">Nonaktif</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {confirmDeleteId === item.id ? (
                        <div className="inline-flex items-center gap-2">
                          <span className="text-xs text-red-700">Hapus?</span>
                          <button
                            type="button"
                            onClick={() => handleDelete(item.id)}
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
                        <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setActiveQRCard(toQRPayload(item))}
                            className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 whitespace-nowrap cursor-pointer"
                          >
                            <QrCode className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span>Kartu QR</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditForm(item)}
                            className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                          >
                            <Edit2 className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Ubah</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(item)}
                            className="inline-flex min-h-[36px] items-center rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                          >
                            {item.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(item.id)}
                            className="inline-flex min-h-[36px] items-center rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 cursor-pointer"
                            aria-label={`Hapus ${item.full_name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
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

      <QRCardModal payload={activeQRCard} onClose={() => setActiveQRCard(null)} />
      <BulkQRPrintModal items={bulkPrintItems} onClose={() => setBulkPrintItems([])} />
    </div>
  );
};
