import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Provider, AnalyzeExtractResult, MergeCtx, RollupResult } from "./types.js";
import { buildAnalyzeExtractPrompt, buildRollupPrompt } from "../prompts.js";
import { extractJson, parseMeta, parseFrame, parseNumbers, parseRollup } from "./parse.js";

const CODEX_PREFIX =
  "이 작업은 코드 수정이 아니라 순수 문서 분석이다. 어떤 파일이나 명령도 실행하지 말고, " +
  "제공된 프롬프트에 따라 최종 답변으로 유효한 JSON 객체 하나만 출력하라.\n\n";

// 터미널의 `codex exec` 를 분석 엔진처럼 호출한다. Codex 는 에이전트라 임시 cwd + read-only 샌드박스로 격리한다.
async function runCodex(
  prompt: string,
  model: string | undefined,
  command: string,
  timeoutMs = 300_000,
): Promise<string> {
  const workDir = await mkdtemp(join(tmpdir(), "marketdesk-codex-"));
  const outFile = join(workDir, "last-message.txt");
  try {
    return await new Promise((resolve, reject) => {
      const args = [
        "exec",
        "--ephemeral",
        "--ignore-rules",
        "--ignore-user-config",
        "--skip-git-repo-check",
        "--sandbox",
        "read-only",
        "--color",
        "never",
        "--output-last-message",
        outFile,
        "--cd",
        workDir,
      ];
      if (model) args.push("--model", model);
      args.push("-");

      const cp = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], cwd: workDir });
      let out = "";
      let err = "";
      let settled = false;
      let timer: ReturnType<typeof setTimeout>;
      const finish = (error: Error | null, value?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(value ?? "");
      };
      timer = setTimeout(() => {
        cp.kill("SIGKILL");
        finish(new Error("codex CLI 시간 초과"));
      }, timeoutMs);

      cp.stdout.on("data", (d) => (out += d));
      cp.stderr.on("data", (d) => (err += d));
      cp.on("error", (e) => finish(new Error(`codex CLI 실행 실패(설치/PATH 확인): ${e.message}`)));
      cp.on("close", async (code) => {
        if (code !== 0) {
          finish(new Error(`codex CLI 종료코드 ${code}: ${err.trim().slice(0, 300) || "stderr 없음"}`));
          return;
        }
        const finalMessage = await readFile(outFile, "utf8").catch(() => "");
        finish(null, finalMessage.trim() || out.trim());
      });

      cp.stdin.write(CODEX_PREFIX + prompt);
      cp.stdin.end();
    });
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

export class CodexCliProvider implements Provider {
  providerKey = "codex" as const;
  model: string;
  private cliModel?: string;
  private command: string;

  constructor(model?: string, command = "codex") {
    this.cliModel = model;
    this.command = command;
    this.model = model ? `codex-cli:${model}` : "codex-cli";
  }

  async analyzeExtract(document: string, industries: string[], ctx: MergeCtx): Promise<AnalyzeExtractResult> {
    const text = await runCodex(buildAnalyzeExtractPrompt(document, industries, ctx), this.cliModel, this.command);
    const o = extractJson(text);
    const meta = parseMeta(o, industries);
    return { meta, frame: parseFrame(o, { docType: meta.docType, lenses: ctx.lenses, jobRole: ctx.jobRole }), numbers: parseNumbers(o.numbers) };
  }

  async rollup(industryName: string, period: string, digest: string): Promise<RollupResult> {
    const text = await runCodex(buildRollupPrompt(industryName, period, digest), this.cliModel, this.command);
    return parseRollup(extractJson(text));
  }
}
