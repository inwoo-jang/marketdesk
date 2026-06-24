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
    `다음 용어를 한국어로 100자 이내로 쉽고 정확하게 설명하라. 설명 문장만 출력(따옴표·머리말 금지).\n` +
    `용어: ${t}\n` +
    (context ? `맥락(이 글에서 쓰인 의미 우선): ${context.slice(0, 400)}\n` : "");
  try {
    const text = (await runClaude(prompt)).trim().replace(/^["']|["']$/g, "");
    return text.slice(0, 200) || `${t}: 설명을 찾지 못했어요.`;
  } catch {
    return `${t}: 설명을 가져오지 못했어요(잠시 후 다시).`;
  }
}
