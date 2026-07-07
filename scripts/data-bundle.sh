#!/usr/bin/env bash
# 데이터 번들 도구: DB 덤프 + 업로드 원본을 tgz 하나로 묶고/푸는 스크립트.
# 데이터는 git 에 넣지 않는다. 이 번들 파일만 따로(구글드라이브 등) 전달하면
# 받는 쪽이 restore 로 리포트 데이터와 원문까지 그대로 복원한다.
#
# 사용:
#   scripts/data-bundle.sh dump    [번들경로]   # 현재 DB+원본 → 번들 생성(기본 marketdesk-data-bundle.tgz)
#   scripts/data-bundle.sh restore [번들경로]   # 번들 → DB 복원 + 원본 복사
#
# 연결정보는 DATABASE_URL 환경변수(없으면 아래 기본값). 시크릿은 절대 커밋 금지.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB_URL="${DATABASE_URL:-postgres://$(whoami)@localhost:5432/reportlens_dev}"
UPLOAD_DIR="${UPLOAD_DIR:-$ROOT/api/.uploads}"
BUNDLE="${2:-$ROOT/marketdesk-data-bundle.tgz}"

log() { printf '%s\n' "$*"; }

cmd="${1:-}"
case "$cmd" in
  dump)
    tmp="$(mktemp -d)"
    trap 'rm -rf "$tmp"' EXIT
    log "DB 덤프: $DB_URL"
    pg_dump --no-owner --no-privileges --clean --if-exists "$DB_URL" > "$tmp/db.sql"
    log "업로드 원본: $UPLOAD_DIR"
    if [ -d "$UPLOAD_DIR" ] && [ -n "$(ls -A "$UPLOAD_DIR" 2>/dev/null || true)" ]; then
      tar -czf "$tmp/uploads.tar.gz" -C "$UPLOAD_DIR" .
    else
      log "  (업로드 원본 없음 - 빈 아카이브)"
      tar -czf "$tmp/uploads.tar.gz" -T /dev/null
    fi
    tar -czf "$BUNDLE" -C "$tmp" db.sql uploads.tar.gz
    log "완료: $BUNDLE ($(du -h "$BUNDLE" | cut -f1))"
    ;;
  restore)
    [ -f "$BUNDLE" ] || { log "번들 파일이 없습니다: $BUNDLE"; exit 1; }
    tmp="$(mktemp -d)"
    trap 'rm -rf "$tmp"' EXIT
    log "번들 해제: $BUNDLE"
    tar -xzf "$BUNDLE" -C "$tmp"
    log "DB 복원: $DB_URL"
    log "  (기존 같은 이름 테이블은 덮어씁니다. 계속하려면 Enter, 취소는 Ctrl-C)"
    read -r _
    psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$tmp/db.sql"
    log "업로드 원본 복원: $UPLOAD_DIR"
    mkdir -p "$UPLOAD_DIR"
    tar -xzf "$tmp/uploads.tar.gz" -C "$UPLOAD_DIR"
    log "완료. pnpm dev 로 실행하세요."
    ;;
  *)
    log "사용법: scripts/data-bundle.sh {dump|restore} [번들경로]"
    exit 1
    ;;
esac
