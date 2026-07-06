import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { isNull, inArray } from "drizzle-orm";
import { industries, publicContents } from "@reportlens/db";
import { db } from "./db.js";
import { extractJson } from "./providers/parse.js";

// 로컬 Claude CLI 직접 호출(무제한, 키 불필요). MCP 로딩 차단으로 빠르게.
function runClaude(prompt: string, timeoutMs = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const cp = spawn("claude", ["-p", "--model", "haiku", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}'], {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: tmpdir(),
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      cp.kill("SIGKILL");
      reject(new Error("claude timeout"));
    }, timeoutMs);
    cp.stdout.on("data", (d) => (out += d));
    cp.stderr.on("data", (d) => (err += d));
    cp.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    cp.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve(out) : reject(new Error(err.slice(0, 120)));
    });
    cp.stdin.write(prompt);
    cp.stdin.end();
  });
}

// 공개소스 핵심 콘텐츠 수집: 정책브리핑 정책뉴스 오픈API(data.go.kr) → AI 산업 배치 매칭(핵심만) → public_contents 적재.
// 저작권 안전: 원문 재호스팅 없이 제목 + 우리 요약 + 출처 링크만 저장. 산업 매칭 안 되면 스킵(노이즈 제거).
// 키: GROUP_API_KEY(공정위와 동일한 data.go.kr 키). 이 API 활용신청 필요(자동승인) → data ID 15095335.
const SOURCE = "정책브리핑";
const ENDPOINT = "http://apis.data.go.kr/1371000/policyNewsService/policyNewsList";
const LOOKBACK_DAYS = 30;

type RssItem = { title: string; link: string; pubDate: string; description: string };

const pick = (block: string, tag: string) => {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return "";
  return m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
};

// 정책뉴스 응답 파싱: 아이템 래퍼 태그가 문서마다 다를 수 있어 item/NewsItem 모두 대응.
function parsePolicyNews(xml: string): RssItem[] {
  let blocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((m) => m[1]);
  if (blocks.length === 0) blocks = [...xml.matchAll(/<NewsItem>([\s\S]*?)<\/NewsItem>/gi)].map((m) => m[1]);
  const items: RssItem[] = [];
  for (const b of blocks) {
    const title = pick(b, "Title");
    const link = pick(b, "OriginalUrl") || pick(b, "ThumbnailUrl");
    if (!title || !link) continue;
    items.push({ title, link, pubDate: pick(b, "ApproveDate"), description: pick(b, "DataContents").slice(0, 300) });
  }
  return items;
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const ymd8 = (d: Date) => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
const toYmd = (s: string): string | null => {
  const t = s.trim();
  if (/^\d{8}$/.test(t)) return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

async function fetchPolicyNews(startDate: string, endDate: string, pageNo: number): Promise<RssItem[]> {
  const key = process.env.GROUP_API_KEY;
  if (!key) throw new Error("GROUP_API_KEY 없음(worker/.env, data.go.kr 키)");
  const url = `${ENDPOINT}?serviceKey=${encodeURIComponent(key)}&startDate=${startDate}&endDate=${endDate}&pageNo=${pageNo}&numOfRows=100`;
  const res = await fetch(url, { headers: { "user-agent": "marketdesk-ingest/0.1" } });
  const text = await res.text();
  if (/Forbidden|Unauthorized|SERVICE_KEY|등록되지\s*않은/i.test(text) && !/<Title>/i.test(text)) {
    throw new Error(`정책뉴스 API 접근 불가(활용신청 필요할 수 있음): ${text.slice(0, 120)}`);
  }
  return parsePolicyNews(text);
}

type Classified = { i: number; industry: string | null; summary: string; docType: string };

async function batchClassify(items: RssItem[], names: string[]): Promise<Classified[]> {
  const list = items.map((it, i) => `${i}. ${it.title} — ${it.description.slice(0, 120)}`).join("\n");
  const prompt =
    `다음 뉴스 항목들을 우리 산업 분류에 매칭하라. 명확히 해당하는 산업이 없으면 industry=null(일반 행정·복지·생활 뉴스 등은 제외).\n` +
    `산업 후보(정확한 이름만): [${names.join(", ")}]\n` +
    `각 항목: i(번호), industry(후보 중 하나 또는 null), summary(40자 내외 한 줄), docType("news").\n` +
    `출력 JSON 하나만(코드펜스·머리말 금지): {"results":[{"i":0,"industry":"","summary":"","docType":"news"}]}\n\n항목:\n${list}`;
  const o = extractJson(await runClaude(prompt));
  return Array.isArray(o.results) ? (o.results as Classified[]) : [];
}

async function run() {
  const catalog = await db
    .select({ id: industries.id, name: industries.name })
    .from(industries)
    .where(isNull(industries.userId));
  const nameToId = new Map(catalog.map((c) => [c.name, c.id]));
  const names = catalog.map((c) => c.name);

  let kept = 0;
  let skipped = 0;

  // 최근 LOOKBACK_DAYS 일 정책뉴스를 페이지 순회로 수집(중복 링크 나오면 종료)
  const now = new Date();
  const endDate = ymd8(now);
  const startDate = ymd8(new Date(now.getTime() - LOOKBACK_DAYS * 864e5));
  const items: RssItem[] = [];
  const seen = new Set<string>();
  try {
    for (let page = 1; page <= 15; page++) {
      const pageItems = await fetchPolicyNews(startDate, endDate, page);
      if (pageItems.length === 0) break;
      const before = seen.size;
      for (const it of pageItems) {
        if (seen.has(it.link)) continue;
        seen.add(it.link);
        items.push(it);
      }
      if (seen.size === before) break; // 새 링크 없음(페이지네이션 미지원 등) → 종료
      if (pageItems.length < 100) break;
    }
  } catch (e) {
    console.error(`[${SOURCE}] 정책뉴스 API 실패:`, e instanceof Error ? e.message : e);
    console.log(`\n완료: 신규 0건(소스 접근 실패). data.go.kr 에서 정책뉴스 API(15095335) 활용신청 후 다시 실행하세요.`);
    process.exit(0);
  }

  {
    // 이미 적재된 링크는 제외(재실행 시 LLM 호출 절약)
    const links = items.map((i) => i.link);
    const existing = links.length
      ? new Set(
          (await db.select({ u: publicContents.sourceUrl }).from(publicContents).where(inArray(publicContents.sourceUrl, links))).map(
            (r) => r.u,
          ),
        )
      : new Set<string>();
    const fresh = items.filter((i) => !existing.has(i.link));
    console.log(`[${SOURCE}] 수신 ${items.length}건, 신규 ${fresh.length}건 분류 시작`);

    const BATCH = 12;
    for (let b = 0; b < fresh.length; b += BATCH) {
      const batch = fresh.slice(b, b + BATCH);
      let results: Classified[] = [];
      try {
        results = await batchClassify(batch, names);
      } catch (e) {
        console.error(`  ! 배치 분류 실패:`, e instanceof Error ? e.message.slice(0, 80) : e);
        continue;
      }
      for (const r of results) {
        const it = batch[r.i];
        if (!it) continue;
        const id = r.industry && nameToId.get(r.industry);
        if (!id) {
          skipped++;
          continue;
        }
        const ins = await db
          .insert(publicContents)
          .values({
            source: SOURCE,
            sourceUrl: it.link,
            title: it.title,
            summary: r.summary ?? null,
            industryId: id,
            docType: (["industry", "company", "news"].includes(r.docType) ? r.docType : "news") as "news",
            pubDate: toYmd(it.pubDate),
          })
          .onConflictDoNothing({ target: publicContents.sourceUrl })
          .returning({ id: publicContents.id });
        if (ins.length > 0) {
          kept++;
          console.log(`  + [${r.industry}] ${it.title}`);
        }
      }
    }
  }
  console.log(`\n완료: 신규 ${kept}건 적재, ${skipped}건 스킵(산업 무관).`);
  process.exit(0);
}

run();
