#!/usr/bin/env -S npx tsx
import { readFile } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { extractText, getDocumentProxy } from "unpdf";
import { z } from "zod";

// 마켓데스크 MCP 서버: 추출의 "결정적 코어"만 도구로 노출한다.
// 추론(요약·관점)은 이 서버를 호출하는 사용자의 Claude 가 수행 → LLM 비용 0(T0).
// 도구: parse_pdf(파싱) · marketdesk_frame(틀·가드레일 규칙) · verify_numbers(출처 룰매칭).

const server = new McpServer({ name: "marketdesk", version: "0.1.0" });

// 1) PDF → 페이지 단위 텍스트(+ [p.N] 마커 문서)
server.tool(
  "parse_pdf",
  "PDF 파일을 페이지 단위 텍스트로 파싱한다. 인용·검증용 [p.N] 마커가 붙은 document 도 반환.",
  { path: z.string().describe("PDF 파일 절대경로") },
  async ({ path }) => {
    const bytes = new Uint8Array(await readFile(path));
    const pdf = await getDocumentProxy(bytes);
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const pages = (text as string[]).map((t, i) => ({ pageNo: i + 1, text: t ?? "" }));
    const document = pages.map((p) => `=== p.${p.pageNo} ===\n${p.text}`).join("\n\n");
    return { content: [{ type: "text", text: JSON.stringify({ pageCount: totalPages, pages, document }) }] };
  },
);

// 2) 추출 틀 + 관점 + 가드레일 규칙(사용자 Claude 가 이 형식으로 분석하도록)
const LENS_GUIDE: Record<string, string> = {
  invest: "investment: valuation(밸류에이션), points[](상승 트리거), downside[](하방 리스크), opinion(잠정 의견, 단정 금지)",
  job: "career: direction(방향성), jobFit(직무 접점), aiInsight(AI·프로덕트 시사점), interviewHooks[](면접 떡밥), motivation(지원동기)",
};
server.tool(
  "marketdesk_frame",
  "마켓데스크 분석 틀(공통 구조 + 관점 레이어 + 가드레일)을 반환한다. 이 형식으로 문서를 분석하라.",
  {
    lenses: z.array(z.enum(["invest", "job"])).default(["invest"]).describe("적용할 관점"),
    jobRole: z.string().optional().describe("취업 관점일 때 직무(예: pm)"),
    docType: z.enum(["industry", "company", "news"]).optional().describe("문서 타입"),
  },
  async ({ lenses, jobRole, docType }) => {
    const focus =
      docType === "company"
        ? "핵심사실=사업·실적·재무, 동인=경쟁우위, 리스크=약점·악재"
        : docType === "news"
          ? "핵심사실=5W1H, 동인=배경·이해관계자, 리스크=논란·불확실성"
          : "핵심사실=시장규모·성장률·구조, 동인=성장드라이버·규제, 리스크=진입장벽·사이클";
    const persp = lenses.map((l) => `- ${LENS_GUIDE[l]}${l === "job" && jobRole ? ` (직무=${jobRole})` : ""}`).join("\n");
    const spec =
      `[마켓데스크 분석 틀]\n` +
      `① 한 줄 요약\n② 핵심 사실(${focus})\n③ 동인·맥락\n④ 리스크·쟁점\n` +
      `⑤ 관점 레이어(아래만):\n${persp}\n⑥ 핵심숫자[{label,value,page_no}] + 출처\n\n` +
      `[가드레일] 리포트에 없는 숫자·전망 생성 금지(불확실하면 '명시 없음'). 핵심숫자엔 출처 page_no 필수. ` +
      `투자 관련은 '투자조언 아님, 참고용' 면책. 한국어, em dash 금지. ` +
      `핵심숫자는 추출 후 verify_numbers 로 출처 검증할 것.`;
    return { content: [{ type: "text", text: spec }] };
  },
);

// 3) 가드레일: 핵심숫자가 출처 페이지 텍스트에 실제 있는지 룰매칭
server.tool(
  "verify_numbers",
  "추출한 핵심숫자가 해당 page_no 텍스트에 실제 존재하는지 검증한다(환각·오인용 차단).",
  {
    pages: z.array(z.object({ pageNo: z.number(), text: z.string() })),
    numbers: z.array(z.object({ label: z.string(), value: z.string(), pageNo: z.number().nullable() })),
  },
  async ({ pages, numbers }) => {
    const byPage = new Map(pages.map((p) => [p.pageNo, p.text.replace(/[\s,]/g, "")]));
    const verified = numbers.map((n) => {
      const tokens = (n.value.match(/\d+(?:\.\d+)?/g) ?? []).sort((a, b) => b.length - a.length);
      const hay = n.pageNo != null ? byPage.get(n.pageNo) : undefined;
      const primary = tokens[0];
      const ok = !!hay && !!primary && hay.includes(primary);
      return { ...n, verified: ok };
    });
    return { content: [{ type: "text", text: JSON.stringify({ numbers: verified }) }] };
  },
);

await server.connect(new StdioServerTransport());
console.error("marketdesk MCP 서버 시작(stdio)");
