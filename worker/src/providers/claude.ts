import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import type { Provider, ExtractedEntry, DocMeta, ExtractCtx, RollupResult } from "./types.js";
import { buildAnalyzePrompt, buildExtractPrompt, buildRollupPrompt } from "../prompts.js";
import { extractJson, parseMeta, parseFrame, parseNumbers, parseRollup } from "./parse.js";

// 터미널의 `claude` CLI 를 직접 호출하는 프로바이더(API 키 불필요, 사용자 Claude 구독 사용).
// 프롬프트는 stdin 으로 전달(긴 문서 대응), 응답 텍스트(JSON) 를 받아 파싱.
function runClaude(prompt: string, model: string | undefined, timeoutMs = 180_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ["-p"];
    if (model) args.push("--model", model);
    // cwd 를 중립 디렉터리로: 프로젝트 CLAUDE.md/AGENTS.md·MCP 컨텍스트 로드를 피해 순수 JSON 응답 확보.
    const cp = spawn("claude", args, { stdio: ["pipe", "pipe", "pipe"], cwd: tmpdir() });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      cp.kill("SIGKILL");
      reject(new Error("claude CLI 시간 초과"));
    }, timeoutMs);
    cp.stdout.on("data", (d) => (out += d));
    cp.stderr.on("data", (d) => (err += d));
    cp.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`claude CLI 실행 실패(설치/PATH 확인): ${e.message}`));
    });
    cp.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`claude CLI 종료코드 ${code}: ${err.slice(0, 300)}`));
    });
    cp.stdin.write(prompt);
    cp.stdin.end();
  });
}

export class ClaudeCliProvider implements Provider {
  providerKey = "claude" as const;
  model: string;
  private cliModel?: string;
  constructor(model?: string) {
    this.cliModel = model;
    this.model = model ? `claude-cli:${model}` : "claude-cli";
  }

  async analyze(document: string, industries: string[]): Promise<DocMeta> {
    const text = await runClaude(buildAnalyzePrompt(document, industries), this.cliModel);
    return parseMeta(extractJson(text), industries);
  }

  async extract(document: string, ctx: ExtractCtx): Promise<ExtractedEntry> {
    const text = await runClaude(buildExtractPrompt(document, ctx), this.cliModel);
    const o = extractJson(text);
    return { frame: parseFrame(o, ctx), numbers: parseNumbers(o.numbers) };
  }

  async rollup(industryName: string, period: string, digest: string): Promise<RollupResult> {
    const text = await runClaude(buildRollupPrompt(industryName, period, digest), this.cliModel);
    return parseRollup(extractJson(text));
  }
}
