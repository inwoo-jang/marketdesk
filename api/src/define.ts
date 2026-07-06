import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { env } from "./env.js";

// 용어 풀이(짧은 동기 호출). 워커와 동일하게 claude CLI 직접 호출(키 불필요), 실패/미설정 시 mock.
function runClaude(prompt: string, timeoutMs = 30_000): Promise<string> {
  return new Promise((resolve, reject) => {
    // 용어 풀이는 짧은 작업 → 빠른 Haiku + 전역 MCP 로딩 차단(시작 지연 최소화).
    const cp = spawn(
      "claude",
      ["-p", "--model", "haiku", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}'],
      { stdio: ["pipe", "pipe", "pipe"], cwd: tmpdir() },
    );
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
      code === 0 ? resolve(out) : reject(new Error(err.slice(0, 200)));
    });
    cp.stdin.write(prompt);
    cp.stdin.end();
  });
}

// Gemini REST(빠름, CLI 시작 지연 없음). thinking off.
async function runGemini(prompt: string): Promise<string> {
  const key = env.geminiApiKey;
  if (!key) throw new Error("no gemini key");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${env.geminiModel}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 300, thinkingConfig: { thinkingBudget: 0 } },
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!res.ok) throw new Error(`gemini ${res.status}`);
  const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  if (!text) throw new Error("gemini empty");
  return text;
}

// 용어를 100자 이내로 쉽고 정확하게 설명. context(리포트 본문 일부)로 맥락 반영.
export async function defineTerm(term: string, context?: string): Promise<string> {
  const t = term.trim().slice(0, 40);
  if (!t) return "";
  if (env.defineProvider === "mock") return `(mock) ${t}: 간단 설명 자리(로컬 mock).`;
  const prompt =
    `다음 "용어"의 뜻을 한국어로 설명하라.\n` +
    `규칙:\n` +
    `- 기본은 그 용어 자체의 의미만 설명한다(글 전체 주제를 설명하지 말 것).\n` +
    `- 단, 고유명사(회사·제품·기관·서비스 등)이거나 뜻이 여러 개면, 아래 맥락을 활용해 무엇을 가리키는지 식별한 뒤 설명하라. 예: 맥락이 의료 AI면 "루닛"은 의료영상 AI 기업으로 설명.\n` +
    `- 영어 약어(축약어)이면 맨 앞에 "약어 (정식 영어 풀네임)" 형식으로 쓰고 이어서 100자 이내 설명. 예: "PBR (Price-to-Book Ratio): 주가를 주당순자산으로 나눈 지표로 1보다 낮으면 저평가로 본다."\n` +
    `- 약어가 아니면 용어명 없이 100자 이내 설명만.\n` +
    `- 머리말·따옴표 금지, 100자 이내.\n` +
    `용어: ${t}\n` +
    (context ? `맥락: ${context.slice(0, 300)}\n` : "");
  // Gemini 우선(빠름), 실패 시 claude CLI 폴백
  const clean = (s: string) => s.trim().replace(/^["']|["']$/g, "").slice(0, 200);
  try {
    return clean(await runGemini(prompt)) || `${t}: 설명을 찾지 못했어요.`;
  } catch {
    try {
      return clean(await runClaude(prompt)) || `${t}: 설명을 찾지 못했어요.`;
    } catch {
      return `${t}: 설명을 가져오지 못했어요(잠시 후 다시).`;
    }
  }
}
