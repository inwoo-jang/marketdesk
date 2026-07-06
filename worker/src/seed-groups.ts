import { companyGroups, normCompany } from "@reportlens/db";
import { db } from "./db.js";

// 계열사 매핑 시드(공정위 API 활성화 전 즉시 동작용). SK 우선. 키 활성 후 ingest-groups 로 전체 갱신.
// group -> 소속회사명 목록
const SEED: Record<string, string[]> = {
  SK: [
    "SK", "SK주식회사", "SK디스커버리", "SK스퀘어", "SK이노베이션", "SK에너지", "SK지오센트릭", "SK인천석유화학",
    "SK아이이테크놀로지", "SK온", "SK어스온", "SK엔무브", "SK루브리컨츠", "SK멀티유틸리티", "SK케미칼", "SK가스",
    "SK오션플랜트", "SK D&D", "SK이터닉스", "SK플라즈마", "SK어드밴스드", "SKC", "SK바이오팜", "SK바이오사이언스",
    "SK바이오텍", "나노엔텍", "SK텔레콤", "SK브로드밴드", "SK스토아", "SK텔링크", "SK커뮤니케이션즈", "SK플래닛",
    "11번가", "티맵모빌리티", "드림어스컴퍼니", "SK실트론", "SK머티리얼즈", "SK머티리얼즈홀딩스", "SK테크엑스",
    "SK엠앤서비스", "SK네트웍스", "SK렌터카", "SK일렉링크", "SK스피드메이트", "SK네트웍스서비스", "SK에코플랜트",
    "SK에코엔지니어링", "SK임업", "코원에너지서비스", "SK인텔릭스", "SKAX", "SK C&C", "SK주식회사 AX",
  ],
};

async function run() {
  let n = 0;
  for (const [group, names] of Object.entries(SEED)) {
    for (const name of names) {
      const normName = normCompany(name);
      if (!normName) continue;
      await db
        .insert(companyGroups)
        .values({ normName, name, groupName: group, source: "seed" })
        .onConflictDoUpdate({ target: companyGroups.normName, set: { groupName: group, name, updatedAt: new Date() } });
      n++;
    }
  }
  console.log(`계열 시드 완료: ${n}건`);
  process.exit(0);
}

run();
