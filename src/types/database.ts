export type UserRole =
  | 'super_admin'
  | 'admin_daerah'
  | 'admin_desa'
  | 'admin_kelompok'
  | 'pamong';

export type ScopeLevel = 'daerah' | 'desa' | 'kelompok';

export type AttendanceStatus = 'belum_hadir' | 'hadir' | 'izin' | 'alfa';

export type AttendanceMethod =
  | 'initial'
  | 'qr_scan'
  | 'manual'
  | 'auto_close'
  | 'correction';

export type EventStatus = 'open' | 'closed';

export interface Desa {
  id: string;
  name: string;
  created_at: string;
}

export interface Kelompok {
  id: string;
  desa_id: string;
  name: string;
  created_at: string;
}

export interface UserWhitelist {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  scope_level: ScopeLevel;
  desa_id: string | null;
  kelompok_id: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  scope_level: ScopeLevel;
  desa_id: string | null;
  kelompok_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Generus {
  id: string;
  full_name: string;
  gender: 'L' | 'P';
  desa_id: string;
  kelompok_id: string;
  qr_token: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventItem {
  id: string;
  title: string;
  level: ScopeLevel;
  desa_id: string | null;
  kelompok_id: string | null;
  event_date: string;
  status: EventStatus;
  created_by: string | null;
  created_by_name: string;
  closed_by: string | null;
  closed_by_name: string | null;
  closed_at: string | null;
  created_at: string;
}

export interface Attendance {
  id: string;
  event_id: string;
  generus_id: string;
  desa_id: string;
  kelompok_id: string;
  status: AttendanceStatus;
  method: AttendanceMethod;
  updated_by: string | null;
  updated_by_name: string | null;
  updated_by_role: string | null;
  updated_at: string;
}

export interface AttendanceLog {
  id: string;
  attendance_id: string;
  event_id: string;
  generus_id: string;
  generus_name: string;
  previous_status: AttendanceStatus;
  new_status: AttendanceStatus;
  action_type: 'qr_scan' | 'manual_hadir' | 'manual_izin' | 'auto_alfa_close' | 'correction';
  actor_id: string | null;
  actor_name: string;
  actor_role: string;
  note: string | null;
  created_at: string;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  admin_daerah: 'Admin Daerah',
  admin_desa: 'Admin Desa',
  admin_kelompok: 'Admin Kelompok',
  pamong: 'Pamong',
};
