-- Reuniones Institucionales · esquema de base de datos para Supabase
-- Cómo usarlo: en Supabase, abre "SQL Editor", pulsa "New query",
-- pega todo este archivo y pulsa "Run". Se puede ejecutar más de una vez.

create extension if not exists "pgcrypto";

-- Instituciones ------------------------------------------------------------
create table if not exists public.institutions (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  tipo        text,
  notas       text,
  created_at  timestamptz not null default now()
);
create unique index if not exists institutions_nombre_unico on public.institutions (lower(nombre));

-- Contactos ----------------------------------------------------------------
create table if not exists public.contacts (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  cargo           text,
  email           text,
  telefono        text,
  institucion_id  uuid references public.institutions(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists contacts_institucion on public.contacts (institucion_id);

-- Reuniones ----------------------------------------------------------------
create table if not exists public.meetings (
  id                    uuid primary key default gen_random_uuid(),
  fecha                 date not null,
  hora                  text,
  modalidad             text,
  lugar                 text,
  institucion_id        uuid references public.institutions(id) on delete restrict,
  contacto_ids          uuid[] not null default '{}',
  asistentes_fundacion  text,
  tema                  text not null,
  resumen               text,
  acuerdos              text[] not null default '{}',
  proximos_pasos        text,
  adjuntos              jsonb not null default '[]'::jsonb,
  created_by            uuid default auth.uid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists meetings_fecha on public.meetings (fecha desc);
create index if not exists meetings_institucion on public.meetings (institucion_id);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists meetings_touch on public.meetings;
create trigger meetings_touch before update on public.meetings
  for each row execute function public.touch_updated_at();

-- Seguridad: solo usuarios con sesión iniciada --------------------------------
-- Las altas públicas se desactivan en Authentication › Sign In / Providers,
-- así que solo entran las personas que des de alta tú.
alter table public.institutions enable row level security;
alter table public.contacts     enable row level security;
alter table public.meetings     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['institutions','contacts','meetings'] loop
    execute format('drop policy if exists "equipo_lee" on public.%I', t);
    execute format('drop policy if exists "equipo_escribe" on public.%I', t);
    execute format('create policy "equipo_lee" on public.%I for select to authenticated using (true)', t);
    execute format('create policy "equipo_escribe" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Archivos adjuntos (almacenamiento privado) ----------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('adjuntos', 'adjuntos', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "equipo_adjuntos_lee" on storage.objects;
drop policy if exists "equipo_adjuntos_sube" on storage.objects;
drop policy if exists "equipo_adjuntos_borra" on storage.objects;
create policy "equipo_adjuntos_lee"   on storage.objects for select to authenticated using (bucket_id = 'adjuntos');
create policy "equipo_adjuntos_sube"  on storage.objects for insert to authenticated with check (bucket_id = 'adjuntos');
create policy "equipo_adjuntos_borra" on storage.objects for delete to authenticated using (bucket_id = 'adjuntos');

-- Avisa a la API de que hay tablas nuevas.
notify pgrst, 'reload schema';
