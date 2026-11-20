import type {
  Attendance,
  AttendanceLog,
  Desa,
  EventItem,
  Generus,
  Kelompok,
} from '../types/database';
import {
  ACTION_TYPE_LABELS,
  ATTENDANCE_STATUS_LABELS,
  getEventScopeLabel,
  getRegionLookup,
} from './attendancePermissions';

export interface AttendanceReportRow extends Attendance {
  generus: Pick<Generus, 'id' | 'full_name' | 'gender' | 'qr_token'> | null;
}

export interface RegionBreakdownRow {
  regionLabel: string;
  total: number;
  hadir: number;
  izin: number;
  alfa: number;
  belumHadir: number;
  percentage: number;
}

export function buildRegionBreakdown(
  attendances: AttendanceReportRow[],
  desas: Desa[],
  kelompoks: Kelompok[],
  groupBy: 'desa' | 'kelompok',
): RegionBreakdownRow[] {
  const {desaMap, kelompokMap} = getRegionLookup(desas, kelompoks);
  const buckets = new Map<string, RegionBreakdownRow>();

  for (const row of attendances) {
    const key = groupBy === 'desa' ? row.desa_id : row.kelompok_id;
    const label =
      groupBy === 'desa'
        ? `Desa ${desaMap.get(row.desa_id) ?? '-'}`
        : `${kelompokMap.get(row.kelompok_id) ?? '-'} (Desa ${desaMap.get(row.desa_id) ?? '-'})`;

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        regionLabel: label,
        total: 0,
        hadir: 0,
        izin: 0,
        alfa: 0,
        belumHadir: 0,
        percentage: 0,
      };
      buckets.set(key, bucket);
    }

    bucket.total += 1;
    if (row.status === 'hadir') bucket.hadir += 1;
    else if (row.status === 'izin') bucket.izin += 1;
    else if (row.status === 'alfa') bucket.alfa += 1;
    else bucket.belumHadir += 1;
  }

  const list = Array.from(buckets.values()).map((b) => ({
    ...b,
    percentage: b.total > 0 ? Math.round((b.hadir / b.total) * 100) : 0,
  }));

  return list.sort((a, b) => a.regionLabel.localeCompare(b.regionLabel, 'id'));
}

export async function exportEventPDF(params: {
  event: EventItem;
  attendances: AttendanceReportRow[];
  logs: AttendanceLog[];
  desas: Desa[];
  kelompoks: Kelompok[];
  viewerLabel?: string;
}): Promise<void> {
  const {event, attendances, logs, desas, kelompoks, viewerLabel} = params;
  const {default: jsPDF} = await import('jspdf');
  const {default: autoTable} = await import('jspdf-autotable');

  const {desaMap, kelompokMap} = getRegionLookup(desas, kelompoks);
  const doc = new jsPDF({orientation: 'portrait', unit: 'mm', format: 'a4'});

  // Kop Laporan
  doc.setFillColor(6, 78, 59); // #064E3B
  doc.rect(0, 0, 210, 26, 'F');
  doc.setFillColor(217, 119, 6); // #D97706
  doc.rect(0, 26, 210, 1.5, 'F');

  doc.setTextColor(167, 243, 208);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('LAPORAN REKAPITULASI PRESENSI PENGAJIAN MUDA-MUDI', 14, 10.5);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text('Daerah Karanganyar Barat', 14, 19);

  // Event Metadata
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(event.title, 14, 37);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);

  const scopeText = getEventScopeLabel(event, desaMap, kelompokMap);
  const statusText = event.status === 'open' ? 'Berlangsung' : 'Ditutup';
  const printedAt = new Date().toLocaleString('id-ID');

  doc.text(`Cakupan Acara : ${scopeText}`, 14, 44);
  doc.text(`Tanggal Acara : ${event.event_date}   |   Status: ${statusText}`, 14, 49.5);
  doc.text(
    `Penyelenggara : ${event.created_by_name}${event.closed_by_name ? `   |   Ditutup oleh: ${event.closed_by_name}` : ''}`,
    14,
    55,
  );
  if (viewerLabel) {
    doc.text(`Dicetak oleh  : ${viewerLabel} (${printedAt})`, 14, 60.5);
  } else {
    doc.text(`Waktu Cetak   : ${printedAt}`, 14, 60.5);
  }

  // Summary Stats
  const total = attendances.length;
  const hadir = attendances.filter((a) => a.status === 'hadir').length;
  const izin = attendances.filter((a) => a.status === 'izin').length;
  const alfa = attendances.filter((a) => a.status === 'alfa').length;
  const belumHadir = attendances.filter((a) => a.status === 'belum_hadir').length;
  const pct = total > 0 ? Math.round((hadir / total) * 100) : 0;

  autoTable(doc, {
    startY: 66,
    head: [['Total Target', 'Hadir', 'Izin', 'Alfa', 'Belum Hadir', 'Persentase Hadir']],
    body: [[String(total), String(hadir), String(izin), String(alfa), String(belumHadir), `${pct}%`]],
    theme: 'grid',
    headStyles: {fillColor: [6, 78, 59], textColor: 255, fontSize: 8.5, halign: 'center'},
    bodyStyles: {fontSize: 10, fontStyle: 'bold', halign: 'center', textColor: [15, 23, 42]},
    margin: {left: 14, right: 14},
  });

  // Region Breakdown Table
  const breakdownRows = buildRegionBreakdown(
    attendances,
    desas,
    kelompoks,
    event.level === 'daerah' ? 'desa' : 'kelompok',
  );

  const afterSummaryY = (doc as unknown as {lastAutoTable?: {finalY: number}}).lastAutoTable?.finalY ?? 86;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text(
    event.level === 'daerah' ? 'Rekapitulasi per Desa' : 'Rekapitulasi per Kelompok',
    14,
    afterSummaryY + 9,
  );

  autoTable(doc, {
    startY: afterSummaryY + 12,
    head: [['Wilayah', 'Target', 'Hadir', 'Izin', 'Alfa', 'Belum', '% Hadir']],
    body: breakdownRows.map((b) => [
      b.regionLabel,
      String(b.total),
      String(b.hadir),
      String(b.izin),
      String(b.alfa),
      String(b.belumHadir),
      `${b.percentage}%`,
    ]),
    theme: 'striped',
    headStyles: {fillColor: [30, 41, 59], textColor: 255, fontSize: 8.5},
    bodyStyles: {fontSize: 8.5, textColor: [15, 23, 42]},
    columnStyles: {
      1: {halign: 'right'},
      2: {halign: 'right'},
      3: {halign: 'right'},
      4: {halign: 'right'},
      5: {halign: 'right'},
      6: {halign: 'right', fontStyle: 'bold'},
    },
    margin: {left: 14, right: 14},
  });

  // Individual Attendance List
  const afterBreakdownY =
    (doc as unknown as {lastAutoTable?: {finalY: number}}).lastAutoTable?.finalY ?? 120;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Daftar Kehadiran Generus', 14, afterBreakdownY + 9);

  const sortedAttendees = [...attendances].sort((a, b) => {
    const dA = desaMap.get(a.desa_id) ?? '';
    const dB = desaMap.get(b.desa_id) ?? '';
    if (dA !== dB) return dA.localeCompare(dB, 'id');
    const kA = kelompokMap.get(a.kelompok_id) ?? '';
    const kB = kelompokMap.get(b.kelompok_id) ?? '';
    if (kA !== kB) return kA.localeCompare(kB, 'id');
    return (a.generus?.full_name ?? '').localeCompare(b.generus?.full_name ?? '', 'id');
  });

  autoTable(doc, {
    startY: afterBreakdownY + 12,
    head: [['No', 'Nama Generus', 'L/P', 'Kelompok', 'Desa', 'Status', 'Pencatat Terakhir']],
    body: sortedAttendees.map((row, idx) => [
      String(idx + 1),
      row.generus?.full_name ?? 'Generus',
      row.generus?.gender ?? '-',
      kelompokMap.get(row.kelompok_id) ?? '-',
      desaMap.get(row.desa_id) ?? '-',
      ATTENDANCE_STATUS_LABELS[row.status],
      row.updated_by_name
        ? `${row.updated_by_name} (${row.updated_by_role ?? '-'})`
        : '-',
    ]),
    theme: 'grid',
    headStyles: {fillColor: [6, 78, 59], textColor: 255, fontSize: 8},
    bodyStyles: {fontSize: 8, textColor: [15, 23, 42]},
    columnStyles: {
      0: {halign: 'center', cellWidth: 10},
      2: {halign: 'center', cellWidth: 10},
    },
    margin: {left: 14, right: 14},
  });

  // Audit Corrections Summary if any corrections exist
  const correctionLogs = logs.filter((l) => l.action_type === 'correction');
  if (correctionLogs.length > 0) {
    const afterListY =
      (doc as unknown as {lastAutoTable?: {finalY: number}}).lastAutoTable?.finalY ?? 180;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('Catatan Koreksi Pasca-Penutupan Acara', 14, afterListY + 9);

    autoTable(doc, {
      startY: afterListY + 12,
      head: [['Waktu', 'Nama Generus', 'Perubahan', 'Pelaku', 'Alasan']],
      body: correctionLogs.map((l) => [
        new Date(l.created_at).toLocaleString('id-ID'),
        l.generus_name,
        `${ATTENDANCE_STATUS_LABELS[l.previous_status]} -> ${ATTENDANCE_STATUS_LABELS[l.new_status]}`,
        `${l.actor_name} (${l.actor_role})`,
        l.note ?? ACTION_TYPE_LABELS[l.action_type] ?? '-',
      ]),
      theme: 'striped',
      headStyles: {fillColor: [180, 83, 9], textColor: 255, fontSize: 8},
      bodyStyles: {fontSize: 7.5, textColor: [15, 23, 42]},
      margin: {left: 14, right: 14},
    });
  }

  // Page numbers
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Halaman ${i} dari ${pageCount}`, 196, 290, {align: 'right'});
  }

  const safeTitle =
    event.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'acara';
  doc.save(`rekap-${safeTitle}-${event.event_date}.pdf`);
}
