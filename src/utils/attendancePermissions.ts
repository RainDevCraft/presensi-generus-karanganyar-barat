import type {
  AttendanceStatus,
  Desa,
  EventItem,
  Kelompok,
  Profile,
  ScopeLevel,
} from '../types/database';

export function isEventOwnerOrSuper(profile: Profile, event: EventItem): boolean {
  if (profile.role === 'super_admin') return true;
  if (profile.role === 'admin_daerah' && event.level === 'daerah') return true;
  if (
    profile.role === 'admin_desa' &&
    event.level === 'desa' &&
    event.desa_id === profile.desa_id
  ) {
    return true;
  }
  if (
    profile.role === 'admin_kelompok' &&
    event.level === 'kelompok' &&
    event.kelompok_id === profile.kelompok_id
  ) {
    return true;
  }
  return false;
}

export function canOperateOpenEvent(profile: Profile, event: EventItem): boolean {
  if (event.status !== 'open') return false;
  if (isEventOwnerOrSuper(profile, event)) return true;
  if (profile.role === 'pamong') {
    if (profile.scope_level === 'daerah' && event.level === 'daerah') return true;
    if (
      profile.scope_level === 'desa' &&
      event.level === 'desa' &&
      event.desa_id === profile.desa_id
    ) {
      return true;
    }
  }
  return false;
}

export function canCreateEvent(profile: Profile): boolean {
  return profile.role !== 'pamong';
}

export function getAllowedCreateLevels(profile: Profile): ScopeLevel[] {
  switch (profile.role) {
    case 'super_admin':
      return ['daerah', 'desa', 'kelompok'];
    case 'admin_daerah':
      return ['daerah'];
    case 'admin_desa':
      return ['desa'];
    case 'admin_kelompok':
      return ['kelompok'];
    default:
      return [];
  }
}

export function getEventScopeLabel(
  event: EventItem,
  desaMap: Map<string, string>,
  kelompokMap: Map<string, string>,
): string {
  if (event.level === 'daerah') return 'Tingkat Daerah · Karanganyar Barat';
  if (event.level === 'desa') {
    return `Tingkat Desa · ${desaMap.get(event.desa_id ?? '') ?? '-'}`;
  }
  const kelName = kelompokMap.get(event.kelompok_id ?? '') ?? '-';
  const desaName = desaMap.get(event.desa_id ?? '') ?? '-';
  return `Tingkat Kelompok · ${kelName} (${desaName})`;
}

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  belum_hadir: 'Belum Hadir',
  hadir: 'Hadir',
  izin: 'Izin',
  alfa: 'Alfa',
};

export const ACTION_TYPE_LABELS: Record<string, string> = {
  qr_scan: 'Scan QR',
  manual_hadir: 'Klik Hadir',
  manual_izin: 'Klik Izin',
  auto_alfa_close: 'Tutup Acara (Otomatis Alfa)',
  correction: 'Koreksi Admin',
};

export function playFeedbackTone(kind: 'success' | 'duplicate' | 'error'): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (kind === 'success') {
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1174, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
    } else if (kind === 'duplicate') {
      osc.frequency.setValueAtTime(520, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
      osc.start();
      osc.stop(ctx.currentTime + 0.16);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
      osc.start();
      osc.stop(ctx.currentTime + 0.28);
    }

    if ('vibrate' in navigator) {
      navigator.vibrate(kind === 'error' ? [120, 60, 120] : 70);
    }
  } catch {
    // Ignore audio errors on restricted devices
  }
}

export function formatTimeShort(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '-';
  }
}

export function getRegionLookup(desas: Desa[], kelompoks: Kelompok[]) {
  return {
    desaMap: new Map(desas.map((d) => [d.id, d.name])),
    kelompokMap: new Map(kelompoks.map((k) => [k.id, k.name])),
  };
}
