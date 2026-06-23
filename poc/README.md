# 마켓데스크 PoC

리포트 PDF를 정해진 틀 + 렌즈별로 구조화 추출하는 최소 검증.

## 파일
- `poc_extract.py` — 실행 스크립트 (PDF 파싱 + 렌즈별 Claude 추출)
- `추출결과_샘플.md` — 실데이터(하나증권 에너지/화학 Weekly 2026.06.15) 추출 결과. 키 없이 사전 생성으로 품질 검증한 것.

## 실행
```bash
pip install pymupdf anthropic
export ANTHROPIC_API_KEY=sk-...
python poc_extract.py <리포트.pdf> --lenses 취업 주식투자 --out 결과.md
```

## 검증 결과 (요약)
- ✅ 비정형 PDF → 정해진 틀 추출 / 렌즈별 분리 / 핵심숫자 출처 [p.N] 인용 / "명시 없음" 가드레일 작동
- ⚠️ 차트·도표 안 수치는 텍스트 파싱만으론 일부 누락 → 비전 경로(markpdfdown·kordoc) 필요
- ⚠️ 멀티 렌즈는 렌즈 수만큼 호출 = 비용·시간 비례 → 캐싱/배치 고려

## 다음
- 비전 파서(markpdfdown/kordoc) 붙여 차트 수치 보강
- 페이지 인용 정확도 평가셋(eval) 구성
- 화면5~6(업로드→요약 검토)을 Lovable/Bolt로 UI 연결
