-- 마켓데스크 ERD import 스냅샷 (ERDCloud 용)
-- 원천(source of truth)은 Drizzle 스키마(packages/db/src/schema). 이 파일은 ERDCloud Import 전용 스냅샷.
-- 사용법: ERDCloud → 좌하단 Import → 아래 전체 붙여넣기.
-- ERDCloud 파서 호환을 위해 CREATE TYPE(enum) 제거하고 컬럼에 MySQL식 enum 인라인, FK는 테이블 내부 인라인.

CREATE TABLE users (
  id uuid NOT NULL,
  cognito_sub text NOT NULL,
  email text,
  provider enum('google','kakao'),
  display_name text,
  avatar_url text,
  created_at timestamp NOT NULL,
  PRIMARY KEY (id),
  UNIQUE (cognito_sub)
);

CREATE TABLE lenses (
  `key` text NOT NULL,
  label text NOT NULL,
  description text,
  is_preset boolean NOT NULL,
  sort integer,
  PRIMARY KEY (`key`)
);

CREATE TABLE user_lenses (
  user_id uuid NOT NULL,
  lens_key text NOT NULL,
  enabled boolean NOT NULL,
  PRIMARY KEY (user_id, lens_key),
  CONSTRAINT fk_user_lenses_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_user_lenses_lens FOREIGN KEY (lens_key) REFERENCES lenses (`key`)
);

CREATE TABLE industries (
  id uuid NOT NULL,
  user_id uuid,
  name text NOT NULL,
  slug text NOT NULL,
  icon_color text,
  sort integer,
  PRIMARY KEY (id),
  UNIQUE (user_id, slug),
  CONSTRAINT fk_industries_user FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE user_industries (
  user_id uuid NOT NULL,
  industry_id uuid NOT NULL,
  sort integer,
  created_at timestamp NOT NULL,
  PRIMARY KEY (user_id, industry_id),
  CONSTRAINT fk_user_industries_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_user_industries_industry FOREIGN KEY (industry_id) REFERENCES industries (id)
);

CREATE TABLE reports (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  industry_id uuid,
  title text,
  broker text,
  analyst text,
  pub_date date,
  source_type enum('broker','public'),
  file_key text,
  file_size integer,
  page_count integer,
  parse_status enum('pending','parsing','parsed','failed') NOT NULL,
  created_at timestamp NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_reports_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_reports_industry FOREIGN KEY (industry_id) REFERENCES industries (id)
);

CREATE TABLE report_pages (
  id uuid NOT NULL,
  report_id uuid NOT NULL,
  page_no integer NOT NULL,
  text text,
  PRIMARY KEY (id),
  UNIQUE (report_id, page_no),
  CONSTRAINT fk_report_pages_report FOREIGN KEY (report_id) REFERENCES reports (id)
);

CREATE TABLE entries (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  report_id uuid NOT NULL,
  industry_id uuid,
  lens_key text NOT NULL,
  entry_date date NOT NULL,
  frame jsonb,
  status enum('draft','saved') NOT NULL,
  provider enum('gemini','claude','mcp'),
  model text,
  created_at timestamp NOT NULL,
  updated_at timestamp,
  PRIMARY KEY (id),
  UNIQUE (report_id, lens_key),
  CONSTRAINT fk_entries_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_entries_report FOREIGN KEY (report_id) REFERENCES reports (id),
  CONSTRAINT fk_entries_industry FOREIGN KEY (industry_id) REFERENCES industries (id),
  CONSTRAINT fk_entries_lens FOREIGN KEY (lens_key) REFERENCES lenses (`key`)
);

CREATE TABLE entry_numbers (
  id uuid NOT NULL,
  entry_id uuid NOT NULL,
  label text,
  value text,
  page_no integer,
  verified boolean,
  created_at timestamp NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_entry_numbers_entry FOREIGN KEY (entry_id) REFERENCES entries (id)
);

CREATE TABLE rollups (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  industry_id uuid,
  lens_key text NOT NULL,
  period_type enum('month','year') NOT NULL,
  period_key text NOT NULL,
  one_liner text,
  created_at timestamp NOT NULL,
  updated_at timestamp,
  PRIMARY KEY (id),
  UNIQUE (user_id, industry_id, lens_key, period_type, period_key),
  CONSTRAINT fk_rollups_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_rollups_industry FOREIGN KEY (industry_id) REFERENCES industries (id),
  CONSTRAINT fk_rollups_lens FOREIGN KEY (lens_key) REFERENCES lenses (`key`)
);

CREATE TABLE rollup_facts (
  id uuid NOT NULL,
  rollup_id uuid NOT NULL,
  fact_type enum('common','conflict') NOT NULL,
  content text,
  sort integer,
  PRIMARY KEY (id),
  CONSTRAINT fk_rollup_facts_rollup FOREIGN KEY (rollup_id) REFERENCES rollups (id)
);

CREATE TABLE rollup_sources (
  rollup_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  PRIMARY KEY (rollup_id, entry_id),
  CONSTRAINT fk_rollup_sources_rollup FOREIGN KEY (rollup_id) REFERENCES rollups (id),
  CONSTRAINT fk_rollup_sources_entry FOREIGN KEY (entry_id) REFERENCES entries (id)
);

CREATE TABLE user_llm_settings (
  user_id uuid NOT NULL,
  tier enum('default','byo','mcp') NOT NULL,
  claude_key_enc bytea,
  created_at timestamp NOT NULL,
  updated_at timestamp,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_user_llm_settings_user FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE export_jobs (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  scope enum('entry','rollup') NOT NULL,
  ref_id uuid,
  status enum('pending','done','failed') NOT NULL,
  file_key text,
  created_at timestamp NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_export_jobs_user FOREIGN KEY (user_id) REFERENCES users (id)
);
