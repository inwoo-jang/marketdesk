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

// 공개소스 핵심 콘텐츠 수집: 허용 공개 피드(정책브리핑 등) → AI 산업 배치 매칭(핵심만) → public_contents 적재.
// 저작권 안전: 원문 재호스팅 없이 제목 + 우리 요약 + 출처 링크만 저장. 산업 매칭 안 되면 스킵(노이즈 제거).
// Gemini 무료 티어(5 RPM) 대응: 항목별이 아니라 배치로 분류.

type Feed = { source: string; url: string };
const FEEDS: Feed[] = [{ source: "korea.kr", url: "https://www.korea.kr/rss/policy.xml" }]; // 정책브리핑(정부 공개자료)

type RssItem = { title: string; link: string; pubDate: string; description: string };

function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const pick = (block: string, tag: string) => {
    const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
    if (!m) return "";
    return m[1]
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]+>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  };
  for (const m of xml.matchAll(/<item[\s\S]*?<\/item>/gi)) {
    const b = m[0];
    const title = pick(b, "title");
    const link = pick(b, "link");
    if (title && link) items.push({ title, link, pubDate: pick(b, "pubDate"), description: pick(b, "description") });
  }
  return items;
}

const toYmd = (s: string): string | null => {
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

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
  for (const feed of FEEDS) {
    let items: RssItem[] = [];
    try {
      const res = await fetch(feed.url, { headers: { "user-agent": "marketdesk-ingest/0.1" } });
      items = parseRss(await res.text());
    } catch (e) {
      console.error(`[${feed.source}] RSS 실패:`, e instanceof Error ? e.message : e);
      continue;
    }
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
    console.log(`[${feed.source}] 수신 ${items.length}건, 신규 ${fresh.length}건 분류 시작`);

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
            source: feed.source,
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
