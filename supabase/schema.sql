-- ============================================================================
-- Presensi Generus Karanganyar Barat - PostgreSQL Schema & RLS
-- Jalankan seluruh skrip ini di SQL Editor Supabase Anda.
-- Catatan: Ganti 'GANTI_DENGAN_EMAIL_GOOGLE_ANDA@gmail.com' di bagian paling bawah
-- dengan email Google yang akan menjadi Super Admin pertama.
-- ============================================================================

create extension if not exists pgcrypto;

-- 1. WILAYAH: DESA & KELOMPOK (Daerah tunggal: Karanganyar Barat)
create table if not exists public.desas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.kelompoks (
  id uuid primary key default gen_random_uuid(),
  desa_id uuid not null references public.desas(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (desa_id, name)
);

-- 2. WHITELIST EMAIL & PROFIL PENGGUNA (RBAC)
-- Role: super_admin | admin_daerah | admin_desa | admin_kelompok | pamong
-- Scope: daerah | desa | kelompok
create table if not exists public.user_whitelist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text not null,
  role text not null check (role in ('super_admin', 'admin_daerah', 'admin_desa', 'admin_kelompok', 'pamong')),
  scope_level text not null check (scope_level in ('daerah', 'desa', 'kelompok')),
  desa_id uuid references public.desas(id) on delete set null,
  kelompok_id uuid references public.kelompoks(id) on delete set null,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role text not null check (role in ('super_admin', 'admin_daerah', 'admin_desa', 'admin_kelompok', 'pamong')),
  scope_level text not null check (scope_level in ('daerah', 'desa', 'kelompok')),
  desa_id uuid references public.desas(id) on delete set null,
  kelompok_id uuid references kelompoks(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. DATA PESERTA (GENERUS)
create table if not exists public.generus (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  gender text not null check (gender in ('L', 'P')),
  desa_id uuid not null references public.desas(id) on delete restrict,
  kelompok_id uuid not null references public.kelompoks(id) on delete restrict,
  qr_token text not null unique default encode(gen_random_bytes(12), 'hex'),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. ACARA PENGAJIAN
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  level text not null check (level in ('daerah', 'desa', 'kelompok')),
  desa_id uuid references public.desas(id) on delete restrict,
  kelompok_id uuid references public.kelompoks(id) on delete restrict,
  event_date date not null default current_date,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text not null,
  closed_by uuid references public.profiles(id) on delete set null,
  closed_by_name text,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

-- 5. KEHADIRAN PESERTA PER ACARA
create table if not exists public.attendances (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  generus_id uuid not null references public.generus(id) on delete cascade,
  desa_id uuid not null references public.desas(id) on delete restrict,
  kelompok_id uuid not null references public.kelompoks(id) on delete restrict,
  status text not null default 'belum_hadir' check (status in ('belum_hadir', 'hadir', 'izin', 'alfa')),
  method text not null default 'initial' check (method in ('initial', 'qr_scan', 'manual', 'auto_close', 'correction')),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_by_name text,
  updated_by_role text,
  updated_at timestamptz not null default now(),
  unique (event_id, generus_id)
);

-- 6. JEJAK AUDIT PERUBAHAN KEHADIRAN (AUDIT TRAIL)
create table if not exists public.attendance_logs (
  id uuid primary key default gen_random_uuid(),
  attendance_id uuid not null references public.attendances(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  generus_id uuid not null references public.generus(id) on delete cascade,
  generus_name text not null,
  previous_status text not null,
  new_status text not null,
  action_type text not null check (action_type in ('qr_scan', 'manual_hadir', 'manual_izin', 'auto_alfa_close', 'correction')),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text not null,
  actor_role text not null,
  note text,
  created_at timestamptz not null default now()
);

-- INDEX UNTUK PERFORMA QUERY
create index if not exists idx_kelompoks_desa on public.kelompoks(desa_id);
create index if not exists idx_generus_scope on public.generus(desa_id, kelompok_id);
create index if not exists idx_generus_qr on public.generus(qr_token);
create index if not exists idx_events_scope on public.events(level, desa_id, kelompok_id, status);
create index if not exists idx_attendances_event on public.attendances(event_id, status);
create index if not exists idx_attendance_logs_event on public.attendance_logs(event_id, created_at desc);

-- ============================================================================
-- HELPER FUNCTIONS UNTUK RLS & SINKRONISASI LOGIN GOOGLE
-- ============================================================================

create or replace function public.get_my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active = true;
$$;

create or replace function public.get_my_scope_level()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select scope_level from public.profiles where id = auth.uid() and is_active = true;
$$;

create or replace function public.get_my_desa_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select desa_id from public.profiles where id = auth.uid() and is_active = true;
$$;

create or replace function public.get_my_kelompok_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select kelompok_id from public.profiles where id = auth.uid() and is_active = true;
$$;

-- Dipanggil otomatis oleh aplikasi saat user login dengan Google
create or replace function public.sync_my_profile()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_wl public.user_whitelist%rowtype;
  v_profile public.profiles%rowtype;
begin
  if v_uid is null or v_email = '' then
    return jsonb_build_object('authorized', false, 'reason', 'unauthenticated');
  end if;

  select * into v_wl
  from public.user_whitelist
  where lower(email) = v_email
  limit 1;

  if not found or v_wl.is_active = false then
    update public.profiles set is_active = false, updated_at = now() where id = v_uid;
    return jsonb_build_object(
      'authorized', false,
      'reason', case when not found then 'not_whitelisted' else 'inactive' end,
      'email', v_email
    );
  end if;

  insert into public.profiles (id, email, full_name, role, scope_level, desa_id, kelompok_id, is_active, updated_at)
  values (v_uid, v_email, v_wl.full_name, v_wl.role, v_wl.scope_level, v_wl.desa_id, v_wl.kelompok_id, true, now())
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    role = excluded.role,
    scope_level = excluded.scope_level,
    desa_id = excluded.desa_id,
    kelompok_id = excluded.kelompok_id,
    is_active = true,
    updated_at = now()
  returning * into v_profile;

  return jsonb_build_object(
    'authorized', true,
    'profile', to_jsonb(v_profile)
  );
end;
$$;

grant execute on function public.sync_my_profile() to authenticated;

-- Pastikan role authenticated memiliki izin tabel (keamanan baris dijaga penuh oleh RLS)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.desas to authenticated;
grant select, insert, update, delete on public.kelompoks to authenticated;
grant select, insert, update, delete on public.user_whitelist to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.generus to authenticated;
grant select, insert, update, delete on public.events to authenticated;
grant select, insert, update, delete on public.attendances to authenticated;
grant select, insert on public.attendance_logs to authenticated;

-- ============================================================================
-- AKTIFKAN ROW LEVEL SECURITY (RLS)
-- ============================================================================

alter table public.desas enable row level security;
alter table public.kelompoks enable row level security;
alter table public.user_whitelist enable row level security;
alter table public.profiles enable row level security;
alter table public.generus enable row level security;
alter table public.events enable row level security;
alter table public.attendances enable row level security;
alter table public.attendance_logs enable row level security;

-- DESAS: Semua pengguna terotorisasi dapat membaca daftar desa; Super Admin & Admin Daerah dapat mengelola
create policy "desas_select_authorized" on public.desas
  for select to authenticated
  using (public.get_my_role() is not null);

create policy "desas_manage_top" on public.desas
  for all to authenticated
  using (public.get_my_role() in ('super_admin', 'admin_daerah'))
  with check (public.get_my_role() in ('super_admin', 'admin_daerah'));

-- KELOMPOKS: Semua terotorisasi dapat membaca; Super Admin, Admin Daerah, & Admin Desa (desanya sendiri) dapat mengelola
create policy "kelompoks_select_authorized" on public.kelompoks
  for select to authenticated
  using (public.get_my_role() is not null);

create policy "kelompoks_manage_scoped" on public.kelompoks
  for all to authenticated
  using (
    public.get_my_role() in ('super_admin', 'admin_daerah')
    or (public.get_my_role() = 'admin_desa' and desa_id = public.get_my_desa_id())
  )
  with check (
    public.get_my_role() in ('super_admin', 'admin_daerah')
    or (public.get_my_role() = 'admin_desa' and desa_id = public.get_my_desa_id())
  );

-- USER_WHITELIST: Aturan hierarki pembuatan akun (Admin Kelompok TIDAK bisa membuat Pamong)
create policy "whitelist_select_scoped" on public.user_whitelist
  for select to authenticated
  using (
    lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or public.get_my_role() = 'super_admin'
    or (public.get_my_role() = 'admin_daerah' and role in ('admin_desa', 'admin_kelompok', 'pamong'))
    or (public.get_my_role() = 'admin_desa' and desa_id = public.get_my_desa_id() and role in ('admin_kelompok', 'pamong'))
  );

create policy "whitelist_insert_scoped" on public.user_whitelist
  for insert to authenticated
  with check (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() = 'admin_daerah'
      and (role = 'admin_desa' or (role = 'pamong' and scope_level = 'daerah'))
    )
    or (
      public.get_my_role() = 'admin_desa'
      and desa_id = public.get_my_desa_id()
      and (
        (role = 'admin_kelompok' and scope_level = 'kelompok' and kelompok_id is not null)
        or (role = 'pamong' and scope_level = 'desa')
      )
    )
  );

create policy "whitelist_update_scoped" on public.user_whitelist
  for update to authenticated
  using (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() = 'admin_daerah'
      and (role = 'admin_desa' or (role = 'pamong' and scope_level = 'daerah'))
    )
    or (
      public.get_my_role() = 'admin_desa'
      and desa_id = public.get_my_desa_id()
      and (role = 'admin_kelompok' or (role = 'pamong' and scope_level = 'desa'))
    )
  )
  with check (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() = 'admin_daerah'
      and (role = 'admin_desa' or (role = 'pamong' and scope_level = 'daerah'))
    )
    or (
      public.get_my_role() = 'admin_desa'
      and desa_id = public.get_my_desa_id()
      and (
        (role = 'admin_kelompok' and scope_level = 'kelompok' and kelompok_id is not null)
        or (role = 'pamong' and scope_level = 'desa')
      )
    )
  );

create policy "whitelist_delete_scoped" on public.user_whitelist
  for delete to authenticated
  using (
    public.get_my_role() = 'super_admin'
    or (public.get_my_role() = 'admin_daerah' and (role = 'admin_desa' or (role = 'pamong' and scope_level = 'daerah')))
    or (public.get_my_role() = 'admin_desa' and desa_id = public.get_my_desa_id() and (role = 'admin_kelompok' or (role = 'pamong' and scope_level = 'desa')))
  );

-- PROFILES
create policy "profiles_select_scoped" on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.get_my_role() in ('super_admin', 'admin_daerah')
    or (public.get_my_role() = 'admin_desa' and desa_id = public.get_my_desa_id())
    or (public.get_my_role() = 'admin_kelompok' and kelompok_id = public.get_my_kelompok_id())
  );

-- GENERUS: Scope per wilayah (Pamong bisa baca sesuai level untuk scan/monitor)
create policy "generus_select_scoped" on public.generus
  for select to authenticated
  using (
    public.get_my_role() in ('super_admin', 'admin_daerah')
    or (public.get_my_role() = 'pamong' and public.get_my_scope_level() = 'daerah')
    or (public.get_my_role() in ('admin_desa', 'pamong') and desa_id = public.get_my_desa_id())
    or (public.get_my_role() = 'admin_kelompok' and kelompok_id = public.get_my_kelompok_id())
  );

create policy "generus_manage_scoped" on public.generus
  for all to authenticated
  using (
    public.get_my_role() in ('super_admin', 'admin_daerah')
    or (public.get_my_role() = 'admin_desa' and desa_id = public.get_my_desa_id())
    or (public.get_my_role() = 'admin_kelompok' and kelompok_id = public.get_my_kelompok_id())
  )
  with check (
    public.get_my_role() in ('super_admin', 'admin_daerah')
    or (public.get_my_role() = 'admin_desa' and desa_id = public.get_my_desa_id())
    or (public.get_my_role() = 'admin_kelompok' and kelompok_id = public.get_my_kelompok_id())
  );

-- EVENTS:
-- Select: termasuk akses read-only bawahan melihat acara atasnya yang relevan
create policy "events_select_scoped" on public.events
  for select to authenticated
  using (
    public.get_my_role() in ('super_admin', 'admin_daerah')
    or (public.get_my_role() = 'pamong' and public.get_my_scope_level() = 'daerah' and level = 'daerah')
    or (public.get_my_role() = 'pamong' and public.get_my_scope_level() = 'desa' and level = 'desa' and desa_id = public.get_my_desa_id())
    or (public.get_my_role() = 'admin_desa' and (level = 'daerah' or (level in ('desa', 'kelompok') and desa_id = public.get_my_desa_id())))
    or (public.get_my_role() = 'admin_kelompok' and (level = 'daerah' or (level = 'desa' and desa_id = public.get_my_desa_id()) or (level = 'kelompok' and kelompok_id = public.get_my_kelompok_id())))
  );

create policy "events_insert_scoped" on public.events
  for insert to authenticated
  with check (
    public.get_my_role() = 'super_admin'
    or (public.get_my_role() = 'admin_daerah' and level = 'daerah')
    or (public.get_my_role() = 'admin_desa' and level = 'desa' and desa_id = public.get_my_desa_id())
    or (public.get_my_role() = 'admin_kelompok' and level = 'kelompok' and desa_id = public.get_my_desa_id() and kelompok_id = public.get_my_kelompok_id())
  );

create policy "events_update_scoped" on public.events
  for update to authenticated
  using (
    public.get_my_role() = 'super_admin'
    or (public.get_my_role() = 'admin_daerah' and level = 'daerah')
    or (public.get_my_role() = 'admin_desa' and level = 'desa' and desa_id = public.get_my_desa_id())
    or (public.get_my_role() = 'admin_kelompok' and level = 'kelompok' and kelompok_id = public.get_my_kelompok_id())
  )
  with check (
    public.get_my_role() = 'super_admin'
    or (public.get_my_role() = 'admin_daerah' and level = 'daerah')
    or (public.get_my_role() = 'admin_desa' and level = 'desa' and desa_id = public.get_my_desa_id())
    or (public.get_my_role() = 'admin_kelompok' and level = 'kelompok' and kelompok_id = public.get_my_kelompok_id())
  );

-- ATTENDANCES:
-- Select: penyelenggara + akses read-only Admin Desa/Kelompok melihat kehadiran anggotanya sendiri di acara tingkat atas
create policy "attendances_select_scoped" on public.attendances
  for select to authenticated
  using (
    public.get_my_role() in ('super_admin', 'admin_daerah')
    or (public.get_my_role() = 'pamong' and public.get_my_scope_level() = 'daerah' and exists (select 1 from public.events e where e.id = event_id and e.level = 'daerah'))
    or (public.get_my_role() = 'pamong' and public.get_my_scope_level() = 'desa' and desa_id = public.get_my_desa_id() and exists (select 1 from public.events e where e.id = event_id and e.level = 'desa'))
    or (public.get_my_role() = 'admin_desa' and desa_id = public.get_my_desa_id())
    or (public.get_my_role() = 'admin_kelompok' and kelompok_id = public.get_my_kelompok_id())
  );

-- Insert initial attendees saat membuat acara
create policy "attendances_insert_event_owner" on public.attendances
  for insert to authenticated
  with check (
    exists (
      select 1 from public.events e
      where e.id = event_id and (
        public.get_my_role() = 'super_admin'
        or (public.get_my_role() = 'admin_daerah' and e.level = 'daerah')
        or (public.get_my_role() = 'admin_desa' and e.level = 'desa' and e.desa_id = public.get_my_desa_id())
        or (public.get_my_role() = 'admin_kelompok' and e.level = 'kelompok' and e.kelompok_id = public.get_my_kelompok_id())
      )
    )
  );

-- Update attendance:
-- Saat acara OPEN: Admin penyelenggara & Pamong level tersebut boleh ubah
-- Saat acara CLOSED (koreksi): HANYA Super Admin atau Admin penyelenggara acara tersebut
create policy "attendances_update_scoped" on public.attendances
  for update to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_id and (
        public.get_my_role() = 'super_admin'
        or (public.get_my_role() = 'admin_daerah' and e.level = 'daerah')
        or (public.get_my_role() = 'admin_desa' and e.level = 'desa' and e.desa_id = public.get_my_desa_id())
        or (public.get_my_role() = 'admin_kelompok' and e.level = 'kelompok' and e.kelompok_id = public.get_my_kelompok_id())
        or (e.status = 'open' and public.get_my_role() = 'pamong' and public.get_my_scope_level() = 'daerah' and e.level = 'daerah')
        or (e.status = 'open' and public.get_my_role() = 'pamong' and public.get_my_scope_level() = 'desa' and e.level = 'desa' and e.desa_id = public.get_my_desa_id())
      )
    )
  )
  with check (
    exists (
      select 1 from public.events e
      where e.id = event_id and (
        public.get_my_role() = 'super_admin'
        or (public.get_my_role() = 'admin_daerah' and e.level = 'daerah')
        or (public.get_my_role() = 'admin_desa' and e.level = 'desa' and e.desa_id = public.get_my_desa_id())
        or (public.get_my_role() = 'admin_kelompok' and e.level = 'kelompok' and e.kelompok_id = public.get_my_kelompok_id())
        or (e.status = 'open' and public.get_my_role() = 'pamong' and public.get_my_scope_level() = 'daerah' and e.level = 'daerah')
        or (e.status = 'open' and public.get_my_role() = 'pamong' and public.get_my_scope_level() = 'desa' and e.level = 'desa' and e.desa_id = public.get_my_desa_id())
      )
    )
  );

-- ATTENDANCE_LOGS (Append-only untuk audit trail)
create policy "logs_select_scoped" on public.attendance_logs
  for select to authenticated
  using (
    exists (
      select 1 from public.attendances a where a.id = attendance_id
    )
  );

create policy "logs_insert_actors" on public.attendance_logs
  for insert to authenticated
  with check (
    actor_id = auth.uid() and exists (
      select 1 from public.attendances a where a.id = attendance_id
    )
  );

-- ============================================================================
-- AKTIFKAN REALTIME UNTUK PEMANTAUAN 2 HP PAMONG
-- ============================================================================
alter publication supabase_realtime add table public.attendances;
alter publication supabase_realtime add table public.events;

-- ============================================================================
-- SEED DATA WILAYAH KARANGANYAR BARAT
-- ============================================================================
insert into public.desas (name) values
  ('Jaten'),
  ('Karangmojo'),
  ('Kaling'),
  ('Banjarharjo')
on conflict (name) do nothing;

insert into public.kelompoks (desa_id, name)
select d.id, k.name
from public.desas d
cross join (
  values
    ('Bulu Selatan 1'),
    ('Bulu Selatan 2'),
    ('Bulu Utara'),
    ('Celep'),
    ('Jatimalang'),
    ('Jumok 1'),
    ('Jumok 2'),
    ('Karangsono'),
    ('Ngiri Barat'),
    ('Ngiri Timur'),
    ('Ngiri Utara'),
    ('Sapen')
) as k(name)
where d.name = 'Jaten'
on conflict (desa_id, name) do nothing;

-- ============================================================================
-- SEED SUPER ADMIN PERTAMA (WAJIB DIGANTI DENGAN EMAIL GOOGLE ANDA)
-- ============================================================================
-- Hapus atau ganti email placeholder di bawah sebelum dijalankan di SQL Editor:
-- insert into public.user_whitelist (email, full_name, role, scope_level, is_active)
-- values ('emailanda@gmail.com', 'Super Admin', 'super_admin', 'daerah', true)
-- on conflict (email) do nothing;
