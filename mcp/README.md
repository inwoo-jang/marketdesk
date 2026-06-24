# mcp — 마켓데스크 MCP 서버 (Phase 2)

사용자의 Claude(Desktop/Code)가 호출해 **자기 구독으로** 리포트를 분석하는 채널. LLM 비용 0(T0).
추출의 **결정적 코어**(파싱·틀·가드레일)만 도구로 노출하고, 요약·관점 추론은 호출하는 Claude가 맡는다.

## 도구 (3)
- `parse_pdf(path)` — PDF → 페이지 단위 텍스트 + `[p.N]` 마커 document
- `marketdesk_frame(lenses, jobRole?, docType?)` — 분석 틀(①~⑥ + 관점 레이어 + 가드레일 규칙) 반환
- `verify_numbers(pages, numbers)` — 핵심숫자가 출처 페이지에 실제 있는지 룰매칭(환각 차단)

## 사용 흐름 (사용자 Claude 안에서)
1. `parse_pdf` 로 PDF 파싱 → pages/document
2. `marketdesk_frame` 로 틀·가드레일 받기
3. Claude 가 그 틀로 분석(요약·핵심사실·동인·리스크·관점·핵심숫자) 생성
4. `verify_numbers` 로 핵심숫자 출처 검증 → 미검증은 표시/제외

## 설치 (Claude Desktop)
`claude_desktop_config.json` 에 추가:
```json
{
  "mcpServers": {
    "marketdesk": {
      "command": "npx",
      "args": ["tsx", "/Users/inwoo/Desktop/사이드프로젝트/마켓데스크/mcp/src/index.ts"]
    }
  }
}
```

## 설치 (Claude Code)
```
claude mcp add marketdesk -- npx tsx /Users/inwoo/Desktop/사이드프로젝트/마켓데스크/mcp/src/index.ts
```

## 동작 확인 (stdio)
```
pnpm --filter @reportlens/mcp start   # stdio 대기. JSON-RPC 로 tools/list·tools/call
```

## 메모
- 현재는 자체 포함(파싱·틀·가드레일 로컬 구현). worker 와 코드 공유(`packages/core` 추출)는 후속.
- 배포: 사용자 머신에서 로컬 실행(stdio). 원격 배포는 Phase 2 후반.
