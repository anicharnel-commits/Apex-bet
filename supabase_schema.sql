-- Universal Store — Supabase foundation
-- Apply in Supabase SQL editor/migration once database connectivity is available.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.shops (
  id text primary key,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  boutique_id text not null references public.shops(id) on delete cascade,
  name text not null,
  type text not null check (type in ('diamond','account')),
  price numeric(12,2) not null check (price >= 0),
  bonus text,
  level text,
  description text,
  image text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  boutique_id text not null references public.shops(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  type text not null default 'diamonds',
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text not null,
  player_uid text not null,
  amount numeric(12,2) not null check (amount >= 0),
  payment_method text not null,
  payment_reference text not null,
  receipt_path text,
  status text not null default 'pending' check (status in ('pending','paid','processing','completed','failed','rejected','cancelled')),
  provider text,
  provider_order_id text,
  provider_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_shop_active_idx on public.products(boutique_id,active);
create index if not exists orders_user_created_idx on public.orders(user_id,created_at desc);
create index if not exists orders_shop_created_idx on public.orders(boutique_id,created_at desc);
create unique index if not exists orders_user_product_payment_ref_uq
  on public.orders(user_id, product_id, payment_reference);

create or replace function public.touch_order_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at
before update on public.orders
for each row execute procedure public.touch_order_updated_at();


alter table public.profiles enable row level security;
alter table public.shops enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'); $$;

create policy "profiles_self_read" on public.profiles for select using (id=auth.uid() or public.is_admin());
create policy "shops_public_read_active" on public.shops for select using (active=true or public.is_admin());
create policy "products_public_read_active" on public.products for select using (active=true or public.is_admin());
create policy "orders_owner_read" on public.orders for select using (user_id=auth.uid() or public.is_admin());
create policy "admin_all_products" on public.products for all using (public.is_admin()) with check (public.is_admin());
create policy "admin_all_shops" on public.shops for all using (public.is_admin()) with check (public.is_admin());
create policy "admin_all_orders" on public.orders for all using (public.is_admin()) with check (public.is_admin());

-- Clients do NOT get direct insert/update/delete access to orders.
-- Creation and future provider fulfillment go through server functions.

-- Private receipt storage. Files are never made public by default.
insert into storage.buckets (id,name,public) values ('boutique-images','boutique-images',false)
on conflict (id) do update set public=false;

drop policy if exists "receipt_insert_own_folder" on storage.objects;
create policy "receipt_insert_own_folder" on storage.objects
for insert to authenticated
with check (
  bucket_id='boutique-images'
  and (storage.foldername(name))[1]='receipts'
  and (storage.foldername(name))[3]=auth.uid()::text
);
drop policy if exists "receipt_read_owner_or_admin" on storage.objects;
create policy "receipt_read_owner_or_admin" on storage.objects
for select to authenticated
using (
  bucket_id='boutique-images'
  and ((storage.foldername(name))[3]=auth.uid()::text or public.is_admin())
);
drop policy if exists "receipt_delete_owner_or_admin" on storage.objects;
create policy "receipt_delete_owner_or_admin" on storage.objects
for delete to authenticated
using (
  bucket_id='boutique-images'
  and ((storage.foldername(name))[3]=auth.uid()::text or public.is_admin())
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  insert into public.profiles(id,email,role) values(new.id,new.email,'user')
  on conflict(id) do update set email=excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
