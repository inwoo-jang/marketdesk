#!/usr/bin/env python3
"""
마켓데스크 PoC - 리포트 PDF를 정해진 틀 + 렌즈별로 구조화 추출.

실행 전:
  pip install pymupdf anthropic
  export ANTHROPIC_API_KEY=sk-...

사용:
  python poc_extract.py <리포트.pdf> --lenses 취업 주식투자
  python poc_extract.py report.pdf --lenses 취업 --out 결과.md

설계 메모:
  - PDF는 페이지 단위로 파싱해 [p.N] 출처 인용을 유지한다.
  - 렌즈마다 system 프롬프트(관점)만 바꿔 같은 틀로 추출한다 (멀티 렌즈 = 루프).
  - 가드레일: 없는 숫자 생성 금지, 핵심숫자엔 페이지 인용, 투자 면책.
  - 차트/도표 안 수치는 텍스트 파싱만으론 누락될 수 있음 → 추후 비전(markpdfdown/kordoc) 경로.
"""
import argparse
import os
import sys

MODEL = "claude-sonnet-4-6"  # 추출 기본 모델. 품질 더 필요하면 claude-opus-4-8

# 산업리포트 스킬의 정해진 틀
FRAME = """다음 항목으로만 정리:
- 🚀 신사업: 새로 진출/키우는 영역. 없으면 "본업 리포트(신사업 약함)".
- 🏭 기존사업: 본업 업황. 구조적 변화와 단기 변동 요인을 분리해 표시.
- 🌍 해외상황: 해외 시장/경쟁사/정책 동향과 국내 영향.
- 🔢 핵심숫자: 기억할 수치 5~10개. 각 수치 끝에 출처 페이지 [p.N]을 붙인다.
- 🎯 인사이트: 렌즈 목적에 맞는 한두 줄."""

LENSES = {
    "취업": "너는 산업 구조·비즈니스 모델·시장 흐름을 보는 PM 취업 준비자다. 종목보다 산업 구조와 사고 프레임을 비중 있게 뽑는다.",
    "주식투자": "너는 실적·밸류에이션·수급·리스크를 보는 투자 참고자다. 수혜/피해 기업, 밸류체인, 모멘텀, 가정과 반대 시나리오, 투자의견(국내 매도의견은 드무니 보수적 해석)을 뽑는다. 마지막에 '※ 투자조언 아님, 참고용'을 붙인다.",
}

GUARDRAIL = (
    "리포트에 없는 숫자·전망을 절대 지어내지 마라. 불확실하면 '명시 없음'이라 쓴다. "
    "핵심숫자에는 반드시 출처 페이지 [p.N]을 붙인다. 한국어, em dash 사용 금지."
)


def parse_pdf_by_page(path):
    """페이지별 텍스트를 [(page_no, text), ...]로 반환."""
    try:
        import fitz  # PyMuPDF
    except ImportError:
        sys.exit("PyMuPDF가 필요합니다: pip install pymupdf")
    doc = fitz.open(path)
    return [(i + 1, page.get_text()) for i, page in enumerate(doc)]


def build_document(pages):
    """페이지 마커가 포함된 단일 텍스트 (모델이 [p.N]을 달 수 있게)."""
    return "\n\n".join(f"=== p.{n} ===\n{t}" for n, t in pages)


def extract(client, document, lens_key):
    persona = LENSES[lens_key]
    system = f"{persona}\n\n{GUARDRAIL}"
    user = (
        f"아래는 증권사 리포트 전문이다(페이지는 '=== p.N ===' 로 구분).\n"
        f"{lens_key} 렌즈로 다음 틀에 맞춰 정리해라.\n\n{FRAME}\n\n"
        f"--- 리포트 ---\n{document}"
    )
    msg = client.messages.create(
        model=MODEL,
        max_tokens=2000,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return msg.content[0].text


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("--lenses", nargs="+", default=["취업", "주식투자"],
                    choices=list(LENSES))
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    if not os.getenv("ANTHROPIC_API_KEY"):
        sys.exit("ANTHROPIC_API_KEY 환경변수가 필요합니다.")
    try:
        import anthropic
    except ImportError:
        sys.exit("anthropic SDK가 필요합니다: pip install anthropic")

    pages = parse_pdf_by_page(args.pdf)
    document = build_document(pages)
    client = anthropic.Anthropic()

    blocks = [f"# 마켓데스크 추출: {os.path.basename(args.pdf)}\n"]
    for lens in args.lenses:  # 멀티 렌즈 = 렌즈별 섹션
        print(f"[추출중] {lens} 렌즈...", file=sys.stderr)
        blocks.append(f"\n## 〈{lens} 렌즈〉\n\n{extract(client, document, lens)}\n")

    result = "\n".join(blocks)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(result)
        print(f"저장: {args.out}", file=sys.stderr)
    else:
        print(result)


if __name__ == "__main__":
    main()
