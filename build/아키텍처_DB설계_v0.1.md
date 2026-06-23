# 리포트렌즈 — 아키텍처 & DB 설계 v0.1 (Phase 0)

> 빌드 워크플로우 Phase 0(스펙 확정). 목표: 프로토타입이 아니라 **상용화 가능한 탄탄한 구조**.
> 호스팅: AWS (Supabase 미사용). DB는 처음부터 상용화 수준으로, 컴퓨팅은 작게 시작.

---

## 1. AWS 아키텍처 (청사진)

```
[사용자] ──> [프론트엔드(React/Next)] ──> [API Gateway] ──> [Lambda: CRUD]
                                                              │
   로그인: Cognito (+구글/카카오 OIDC)                          ▼
                                                          [RDS PostgreSQL]
[PDF 업로드] ──presigned──> [S3(프라이빗,사용자별)]
        │ (S3 이벤트/요청)
        ▼
   [SQS] ──> [워커: 파싱(PyMuPDF/kordoc) → 렌즈별 Claude 추출 → 가드레일 검증]
                          │ (LLM: Bedrock Claude 또는 Anthropic API)
                          ▼
                    [RDS: entries/entry_numbers 기록, parse_status 갱신]
   시크릿: Secrets Manager  /  관측: CloudWatch  /  IaC: CDK
```

핵심 설계 결정:
- **추출은 비동기**(SQS+워커). 파싱+LLM은 길어서 API 타임아웃(API GW 29s) 회피. 멀티 렌즈는 워커에서 렌즈별 처리(파싱 1회 캐싱).
- **멀티테넌트 스코핑은 API 계층에서** 강제(모든 쿼리에 Cognito JWT의 user_id 필터). RDS는 Supabase식 RLS가 없으므로 애플리케이션에서 보장 + DB FK/제약으로 무결성.
- **BYO**: 외부 수집 없음. 업로드는 presigned URL로 S3 직접, 사용자별 prefix로 격리.

---

## 2. DB 스키마 (PostgreSQL, 상용화 기준)

> 원칙: 멀티테넌트(user_id 스코핑), 무결성(FK·UNIQUE·체크), 확장성(렌즈/소스 추가 용이), 인용 검증(가드레일) 내장.

### users
사용자 프로필(인증은 Cognito, DB엔 미러).
```
id            uuid PK
cognito_sub   text UNIQUE NOT NULL         -- Cognito 식별자
email         text
provider      text  -- 'google' | 'kakao'
display_name  text
avatar_url    text
created_at    timestamptz DEFAULT now()
```

### lenses  (프리셋 + 향후 커스텀)
```
key         text PK   -- 'job'(취업) | 'invest'(주식투자) | (Phase2: realestate, expert)
label       text NOT NULL
description  text
is_preset   bool DEFAULT true
sort        int
```

### user_lenses  (사용자가 켠 렌즈, 멀티)
```
user_id  uuid FK->users ON DELETE CASCADE
lens_key text FK->lenses
enabled  bool DEFAULT true
PRIMARY KEY (user_id, lens_key)
```

### industries  (글로벌 카탈로그 + 사용자 커스텀)
```
id        uuid PK
user_id   uuid FK->users NULL        -- NULL=글로벌 카탈로그, 값 있으면 커스텀
name      text NOT NULL              -- 반도체, 2차전지 ...
slug      text NOT NULL
icon_color text
sort      int
UNIQUE (user_id, slug)
```

### user_industries  (관심 산업 팔로우/정렬)
```
user_id     uuid FK->users ON DELETE CASCADE
industry_id uuid FK->industries
sort        int
created_at  timestamptz DEFAULT now()
PRIMARY KEY (user_id, industry_id)
```

### reports  (업로드한 원본 메타)
```
id          uuid PK
user_id     uuid FK->users ON DELETE CASCADE
industry_id uuid FK->industries
title       text
broker      text          -- 증권사
analyst     text
pub_date    date
source_type text          -- 'broker'(수동) | 'public'(자동, Phase2)
file_key    text          -- S3 객체 키
file_size   int
page_count  int
parse_status text DEFAULT 'pending'  -- pending|parsing|parsed|failed
created_at  timestamptz DEFAULT now()
INDEX (user_id, industry_id, pub_date)
```

### report_pages  (페이지 단위 텍스트, [p.N] 인용·검증용)
```
id        uuid PK
report_id uuid FK->reports ON DELETE CASCADE
page_no   int NOT NULL
text      text
UNIQUE (report_id, page_no)
```

### entries  (리포트 × 렌즈 = 1엔트리, 멀티렌즈로 여러 개)
```
id          uuid PK
user_id     uuid FK->users ON DELETE CASCADE
report_id   uuid FK->reports ON DELETE CASCADE
industry_id uuid FK->industries
lens_key    text FK->lenses
entry_date  date NOT NULL
frame       jsonb   -- {new_biz, core_biz_structural, core_biz_short, overseas, insight}
status      text DEFAULT 'draft'  -- draft|saved
created_at  timestamptz DEFAULT now()
updated_at  timestamptz
UNIQUE (report_id, lens_key)
INDEX (user_id, industry_id, lens_key, entry_date)
```

### entry_numbers  (핵심숫자 + 출처 + 룰매칭 검증)
```
id        uuid PK
entry_id  uuid FK->entries ON DELETE CASCADE
label     text       -- 'WTI'
value     text       -- '84.9$ -6%'
page_no   int        -- 출처 [p.N]
verified  bool       -- 룰매칭: 해당 페이지 텍스트에 값 존재 확인
created_at timestamptz DEFAULT now()
```

### rollups  (월별/연별 요약의 요약)
```
id          uuid PK
user_id     uuid FK->users ON DELETE CASCADE
industry_id uuid FK->industries
lens_key    text FK->lenses
period_type text      -- 'month'(MVP) | 'year'(Phase2)
period_key  text      -- '2026-06'
one_liner   text
created_at  timestamptz DEFAULT now()
updated_at  timestamptz
UNIQUE (user_id, industry_id, lens_key, period_type, period_key)
```

### rollup_facts  (공통팩트/엇갈림)
```
id        uuid PK
rollup_id uuid FK->rollups ON DELETE CASCADE
fact_type text   -- 'common' | 'conflict'
content   text
sort      int
```

### rollup_sources  (근거 엔트리 join)
```
rollup_id uuid FK->rollups ON DELETE CASCADE
entry_id  uuid FK->entries ON DELETE CASCADE
PRIMARY KEY (rollup_id, entry_id)
```

### user_llm_settings  (BYO 키 · 티어)
```
user_id        uuid PK FK->users ON DELETE CASCADE
tier           text DEFAULT 'default'   -- 'default'(Gemini) | 'byo'(Claude 키) | 'mcp'
claude_key_enc bytea                    -- KMS 암호화, 절대 로깅 금지
created_at     timestamptz DEFAULT now()
updated_at     timestamptz
```
> entries에 생성 출처 기록: `provider`(gemini|claude|mcp), `model`(예: gemini-pro / claude-sonnet) 컬럼 추가(투명성·eval).

### export_jobs  (PDF 내보내기, 선택)
```
id        uuid PK
user_id   uuid FK->users
scope     text   -- 'entry' | 'rollup'
ref_id    uuid
status    text   -- pending|done|failed
file_key  text   -- S3
created_at timestamptz DEFAULT now()
```

관계 요약: users 1—N industries(커스텀)/reports/entries/rollups. reports 1—N report_pages/entries. entries 1—N entry_numbers. rollups 1—N rollup_facts, N—N entries(rollup_sources). 멀티렌즈 = entries가 (report, lens)별로 분리 → 시간뷰·롤업이 lens_key로 자연 분리.

---

## 3. 확정 스택 (2026.06.22 결정 → Decision Log)

- A. **컴퓨팅 = ECS Fargate (컨테이너)** + ALB. API 서버 + 추출 워커를 컨테이너로. 장기작업(파싱·LLM)에 유리.
- B. **LLM = 멀티 프로바이더 라우터** (아래 5절). 기본 Gemini, BYO Claude 키, MCP 경로.
- C. **DB = RDS PostgreSQL** (t4g.micro 시작, 확장 시 Aurora).
- D. **프론트 = Vercel** (DB·API는 AWS).

## 5. LLM 전략 (멀티 프로바이더 · 3티어) ★핵심 결정

제품은 **웹 앱 + MCP 서버** 두 형태로 LLM을 쓴다. 핵심은 **LLM 비용을 우리가 다 떠안지 않는 구조**.

| 티어 | 경로 | 모델 | LLM 비용 부담 | 품질 |
|---|---|---|---|---|
| T0 | **MCP 서버** (사용자가 자기 Claude로 구동) | 사용자의 Claude | **사용자** | 높음 |
| T1 | **웹 기본** | **Gemini Flash(초벌 파싱·추출) → Gemini Pro(핵심 요약)** | 우리(저렴) | 중상 |
| T2 | **웹 + BYO 키** | 사용자 Claude API 키 | 사용자 | 최상 |

설계 포인트:
- **프로바이더 추상화(LLM 라우터)**: `extract(document, lens) -> 구조화결과` 인터페이스. 구현체 = GeminiProvider(기본, Flash 초벌 + Pro 핵심요약 캐스케이드), ClaudeProvider(BYO 키), McpExtractor(사용자 Claude가 호출).
- **공유 코어**: 파싱(PyMuPDF/kordoc) + 틀 스키마 + 가드레일(출처 룰매칭)은 프로바이더 무관 공통. LLM만 갈아끼움.
- **MCP 서버**: 리포트렌즈가 `extract_report`, `rollup` 같은 툴을 노출 → 사용자의 Claude Desktop/Code가 호출해 자기 구독으로 추출. (핵심 로직 재사용, LLM 비용 0)
- **BYO Claude 키**: 사용자별 키를 **KMS로 암호화 저장**, 절대 로깅 금지. 키 있으면 라우터가 Claude로 스위치.
- **모델 ID는 구현 시 확정**(Gemini Flash/Pro 최신 ID, Claude는 claude-sonnet/opus 계열). 엔트리에 생성 프로바이더·모델 기록(투명성·eval).
- 시퀀싱: **T1(웹 기본 Gemini)부터** 만들고, T2(BYO 키) → T0(MCP 서버) 순. MCP는 코어가 굳은 뒤 별도 스프린트.

---

## 4. 다음 (Phase 1)

스펙 확정 후 → 노션 리포트렌즈 페이지(Sprints/Tasks DB) 생성 → 스프린트 분해.
예상 스프린트 골격: S0 인프라 / S1 인증·산업·업로드 / S2 파싱·렌즈추출·검토저장 / S3 시간뷰·월별롤업 / S4 PDF·QA·배포.
