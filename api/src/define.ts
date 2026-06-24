import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { env } from "./env.js";

// 용어 풀이(짧은 동기 호출). 워커와 동일하게 claude CLI 직접 호출(키 불필요), 실패/미설정 시 mock.
function runClaude(prompt: string, timeoutMs = 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const cp = spawn("claude", ["-p"], { stdio: ["pipe", "pipe", "pipe"], cwd: tmpdir() });
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

// 용어를 100자 이내로 쉽고 정확하게 설명. context(리포트 본문 일부)로 맥락 반영.
export async function defineTerm(term: string, context?: string): Promise<string> {
  const t = term.trim().slice(0, 40);
  if (!t) return "";
  if (env.defineProvider === "mock") return `(mock) ${t}: 간단 설명 자리(로컬 mock).`;
  const prompt =
    `다음 "용어 자체"의 뜻을 한국어로 설명하라. 글 전체 주제가 아니라 이 용어의 일반적·사전적 의미를 설명한다.\n` +
    `규칙:\n` +
    `- 영어 약어(축약어)이면 맨 앞에 "약어 (정식 영어 풀네임)" 형식으로 쓰고, 이어서 100자 이내 설명. 예: "PBR (Price-to-Book Ratio): 주가를 주당순자산으로 나눈 지표로 1보다 낮으면 저평가로 본다."\n` +
    `- 약어가 아니면 용어명 없이 100자 이내 설명만.\n` +
    `- 설명 문장만 출력(머리말·따옴표 금지), 100자 이내.\n` +
    `용어: ${t}\n` +
    (context ? `참고 맥락(용어가 여러 뜻이면 이 맥락에 맞는 뜻을 고르는 용도. 맥락 주제 자체를 설명하지 말 것): ${context.slice(0, 300)}\n` : "");
  try {
    const text = (await runClaude(prompt)).trim().replace(/^["']|["']$/g, "");
    return text.slice(0, 200) || `${t}: 설명을 찾지 못했어요.`;
  } catch {
    return `${t}: 설명을 가져오지 못했어요(잠시 후 다시).`;
  }
}
