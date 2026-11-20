import type {Desa, Kelompok, Profile} from '../types/database';

export interface ParsedGenerusRow {
  rowNumber: number;
  fullName: string;
  gender: 'L' | 'P';
  desaId: string;
  desaName: string;
  kelompokId: string;
  kelompokName: string;
}

export interface ImportValidationResult {
  validRows: ParsedGenerusRow[];
  errors: {rowNumber: number; rawName: string; reason: string}[];
}

export async function downloadGenerusExcelTemplate(
  desas: Desa[],
  kelompoks: Kelompok[],
  profile: Profile,
): Promise<void> {
  const XLSX = await import('xlsx');
  const scopedDesas =
    profile.role === 'super_admin' || profile.role === 'admin_daerah'
      ? desas
      : desas.filter((d) => d.id === profile.desa_id);

  const scopedKelompoks =
    profile.role === 'admin_kelompok'
      ? kelompoks.filter((k) => k.id === profile.kelompok_id)
      : profile.role === 'admin_desa'
        ? kelompoks.filter((k) => k.desa_id === profile.desa_id)
        : kelompoks;

  const sampleKelompok = scopedKelompoks[0];
  const sampleDesa =
    scopedDesas.find((d) => d.id === sampleKelompok?.desa_id) ?? scopedDesas[0];

  const templateRows = [
    {
      'Nama Lengkap': 'Contoh: Ahmad Fauzi',
      'Jenis Kelamin (L/P)': 'L',
      Desa: sampleDesa?.name ?? 'Jaten',
      Kelompok: sampleKelompok?.name ?? 'Bulu Utara',
    },
    {
      'Nama Lengkap': 'Contoh: Siti Aisyah',
      'Jenis Kelamin (L/P)': 'P',
      Desa: sampleDesa?.name ?? 'Jaten',
      Kelompok: sampleKelompok?.name ?? 'Bulu Utara',
    },
  ];

  const wb = XLSX.utils.book_new();
  const wsTemplate = XLSX.utils.json_to_sheet(templateRows);
  wsTemplate['!cols'] = [{wch: 30}, {wch: 22}, {wch: 20}, {wch: 24}];
  XLSX.utils.book_append_sheet(wb, wsTemplate, 'Template Generus');

  const desaMap = new Map(desas.map((d) => [d.id, d.name]));
  const refRows = scopedKelompoks.map((k) => ({
    Desa: desaMap.get(k.desa_id) ?? '-',
    Kelompok: k.name,
  }));
  const wsRef = XLSX.utils.json_to_sheet(
    refRows.length > 0 ? refRows : [{Desa: 'Belum ada kelompok', Kelompok: '-'}],
  );
  wsRef['!cols'] = [{wch: 22}, {wch: 28}];
  XLSX.utils.book_append_sheet(wb, wsRef, 'Referensi Wilayah');

  XLSX.writeFile(wb, 'template-import-generus.xlsx');
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

function parseGender(raw: unknown): 'L' | 'P' | null {
  const val = normalizeText(raw).toUpperCase();
  if (val === 'L' || val === 'LAKI-LAKI' || val === 'LAKI LAKI' || val === 'PUTRA') {
    return 'L';
  }
  if (val === 'P' || val === 'PEREMPUAN' || val === 'PUTRI') {
    return 'P';
  }
  return null;
}

export async function parseAndValidateGenerusExcel(
  file: File,
  desas: Desa[],
  kelompoks: Kelompok[],
  profile: Profile,
): Promise<ImportValidationResult> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, {type: 'array'});
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) {
    return {
      validRows: [],
      errors: [{rowNumber: 1, rawName: '-', reason: 'File Excel kosong atau tidak memiliki sheet.'}],
    };
  }

  const sheet = wb.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {defval: ''});

  if (rawRows.length === 0) {
    return {
      validRows: [],
      errors: [{rowNumber: 2, rawName: '-', reason: 'Tidak ada baris data pada sheet pertama.'}],
    };
  }

  const desaByLower = new Map(desas.map((d) => [d.name.toLowerCase().trim(), d]));
  const kelompokByKey = new Map(
    kelompoks.map((k) => [`${k.desa_id}::${k.name.toLowerCase().trim()}`, k]),
  );

  const validRows: ParsedGenerusRow[] = [];
  const errors: {rowNumber: number; rawName: string; reason: string}[] = [];

  rawRows.forEach((row, index) => {
    const rowNumber = index + 2;
    const keys = Object.keys(row);
    const findCol = (candidates: string[]) => {
      const matchedKey = keys.find((k) =>
        candidates.some((c) => k.toLowerCase().trim().includes(c)),
      );
      return matchedKey ? row[matchedKey] : '';
    };

    const fullName = normalizeText(findCol(['nama']));
    const genderRaw = findCol(['kelamin', 'gender', 'l/p']);
    const desaRaw = normalizeText(findCol(['desa']));
    const kelompokRaw = normalizeText(findCol(['kelompok']));

    if (!fullName && !desaRaw && !kelompokRaw) {
      return;
    }

    if (fullName.toLowerCase().startsWith('contoh:')) {
      return;
    }

    if (fullName.length < 2) {
      errors.push({rowNumber, rawName: fullName || '-', reason: 'Nama lengkap minimal 2 huruf.'});
      return;
    }

    const gender = parseGender(genderRaw);
    if (!gender) {
      errors.push({
        rowNumber,
        rawName: fullName,
        reason: 'Jenis kelamin harus diisi L/P (atau Putra/Putri).',
      });
      return;
    }

    const desa = desaByLower.get(desaRaw.toLowerCase());
    if (!desa) {
      errors.push({
        rowNumber,
        rawName: fullName,
        reason: `Desa "${desaRaw || '-'}" tidak ditemukan di database.`,
      });
      return;
    }

    const kelompok = kelompokByKey.get(`${desa.id}::${kelompokRaw.toLowerCase()}`);
    if (!kelompok) {
      errors.push({
        rowNumber,
        rawName: fullName,
        reason: `Kelompok "${kelompokRaw || '-'}" tidak ditemukan di Desa ${desa.name}.`,
      });
      return;
    }

    if (profile.role === 'admin_desa' && desa.id !== profile.desa_id) {
      errors.push({
        rowNumber,
        rawName: fullName,
        reason: `Di luar cakupan wilayah Anda (hanya boleh Desa Anda sendiri).`,
      });
      return;
    }

    if (profile.role === 'admin_kelompok' && kelompok.id !== profile.kelompok_id) {
      errors.push({
        rowNumber,
        rawName: fullName,
        reason: `Di luar cakupan wilayah Anda (hanya boleh Kelompok Anda sendiri).`,
      });
      return;
    }

    validRows.push({
      rowNumber,
      fullName,
      gender,
      desaId: desa.id,
      desaName: desa.name,
      kelompokId: kelompok.id,
      kelompokName: kelompok.name,
    });
  });

  return {validRows, errors};
}
