begin;
create table public.catalog_migrations(version text primary key, applied_at timestamptz not null default now());
revoke all on public.catalog_migrations from public, anon, authenticated;

create table public.word_catalog (
 id text primary key,
 fingerprint text not null unique,
 name text not null check (length(name) between 1 and 80),
 words jsonb not null check (jsonb_typeof(words) = 'array' and jsonb_array_length(words) between 1 and 1000),
 created_at timestamptz not null default now()
);
alter table public.word_catalog enable row level security;
revoke all on public.word_catalog from public, anon, authenticated;
grant select on public.word_catalog to anon, authenticated;
create policy "Everyone can read public vocabulary" on public.word_catalog for select to anon, authenticated using (true);

create function public.catalog_normalize(value text) returns text
language sql immutable strict set search_path = '' as $$
 select regexp_replace(translate(lower(normalize(value, NFKC)), '.,!?~～;:·''"“”‘’/()[]{}-', ''), '[[:space:]]', '', 'g');
$$;
revoke all on function public.catalog_normalize(text) from public, anon, authenticated;

-- Public, append-only publishing capability: visitors can add validated words,
-- but cannot update or delete catalog entries or store learning progress.
create function public.publish_word_list(payload jsonb) returns setof public.word_catalog
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
 row jsonb; clean_words jsonb := '[]'; identities jsonb := '[]'; seen jsonb := '{}';
 signature text; english text; korean text; chapter text; senses jsonb; canonical jsonb;
 word_keys jsonb := '{}'; entry_key text;
 fingerprint_value text; existing public.word_catalog%rowtype; count_value bigint;
begin
 if jsonb_typeof(payload) is distinct from 'object' or payload->>'format' is distinct from 'harry-word-list'
    or payload->>'version' is distinct from '1' or octet_length(payload::text) > 500000
    or jsonb_typeof(payload->'name') is distinct from 'string' or length(trim(payload->>'name')) not between 1 and 80
    or jsonb_typeof(payload->'words') is distinct from 'array' then raise exception 'Invalid vocabulary list'; end if;
 if jsonb_array_length(payload->'words') not between 1 and 1000 then raise exception 'Use 1 to 1000 words per list'; end if;
 for row in select value from jsonb_array_elements(payload->'words') loop
  if jsonb_typeof(row) is distinct from 'array' then raise exception 'Invalid vocabulary row'; end if;
  if jsonb_array_length(row) <> 3 or jsonb_typeof(row->0) is distinct from 'string'
     or jsonb_typeof(row->1) is distinct from 'string' or jsonb_typeof(row->2) is distinct from 'string'
     then raise exception 'Invalid vocabulary row'; end if;
  english := lower(trim(row->>0)); korean := trim(row->>1); chapter := trim(row->>2);
  if english !~ '^[A-Za-z][A-Za-z ''’()-]*$' or length(english)>200 or korean !~ '[가-힣]'
     or length(korean)>3000 or length(chapter) not between 1 and 120
     or (english || korean || chapter) ~ '[[:cntrl:]]' then raise exception 'Invalid word or meaning'; end if;
  select coalesce(jsonb_agg(s order by s), '[]') into senses from
    (select distinct public.catalog_normalize(value) s from regexp_split_to_table(regexp_replace(korean, '[0-9]+[[:space:]]*\.', '|', 'g'), '[,/;|]') value) normalized where s <> '';
  signature := jsonb_build_array(public.catalog_normalize(english), senses)::text;
  if not (seen ? signature) then
   entry_key := jsonb_build_array(chapter, english)::text;
   if word_keys ? entry_key then raise exception 'Duplicate English word in the same chapter'; end if;
   word_keys := word_keys || jsonb_build_object(entry_key, true);
   seen := seen || jsonb_build_object(signature, true);
   identities := identities || jsonb_build_array(signature);
   clean_words := clean_words || jsonb_build_array(jsonb_build_array(english, korean, chapter));
  end if;
 end loop;
 select jsonb_agg(value order by value) into canonical from jsonb_array_elements_text(identities);
 fingerprint_value := encode(digest(convert_to(canonical::text, 'UTF8'), 'sha256'), 'hex');
 perform pg_advisory_xact_lock(1729130001);
 select * into existing from public.word_catalog where fingerprint = fingerprint_value;
 if found then return next existing; return; end if;
 select count(*) into count_value from public.word_catalog;
 if count_value >= 1000 then raise exception 'The public catalog has reached its capacity'; end if;
 select count(*) into count_value from public.word_catalog where created_at > now() - interval '1 hour';
 if count_value >= 100 then raise exception 'Please try publishing again later'; end if;
 if (select coalesce(sum(octet_length(words::text)),0) from public.word_catalog) > 52428800
    then raise exception 'The public catalog has reached its storage limit'; end if;
 insert into public.word_catalog(id,fingerprint,name,words)
 values ('catalog-'||fingerprint_value,fingerprint_value,trim(payload->>'name'),clean_words) returning * into existing;
 return next existing;
end;
$$;
revoke all on function public.publish_word_list(jsonb) from public;
grant execute on function public.publish_word_list(jsonb) to anon, authenticated;
insert into public.catalog_migrations(version) values ('202610170001_public_catalog');
notify pgrst, 'reload schema';
commit;
