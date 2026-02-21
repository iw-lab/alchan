#!/bin/bash
# 알찬 앱 서명용 Keystore 생성 스크립트
# 최초 1회만 실행하면 됩니다.

set -e

KEYSTORE_FILE="alchan-release.jks"
KEY_ALIAS="alchan"
VALIDITY=10000  # ~27년

echo "🔑 알찬 앱 Keystore 생성"
echo ""

# 비밀번호 입력
read -s -p "Keystore 비밀번호 (8자 이상): " KS_PASS
echo ""
read -s -p "비밀번호 확인: " KS_PASS2
echo ""

if [ "$KS_PASS" != "$KS_PASS2" ]; then
  echo "❌ 비밀번호가 일치하지 않습니다."
  exit 1
fi

if [ ${#KS_PASS} -lt 8 ]; then
  echo "❌ 비밀번호가 8자 이상이어야 합니다."
  exit 1
fi

# Keystore 생성
keytool -genkey -v \
  -keystore "$KEYSTORE_FILE" \
  -alias "$KEY_ALIAS" \
  -keyalg RSA \
  -keysize 2048 \
  -validity $VALIDITY \
  -storepass "$KS_PASS" \
  -keypass "$KS_PASS" \
  -dname "CN=알찬 경제교육, OU=Education, O=Alchan, L=Seoul, S=Seoul, C=KR"

echo ""
echo "✅ Keystore 생성: $KEYSTORE_FILE"
echo ""

# Base64 인코딩
BASE64=$(base64 -w 0 "$KEYSTORE_FILE")

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "GitHub Secrets에 다음 값을 추가하세요:"
echo "  저장소 → Settings → Secrets and variables → Actions"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Secret 이름: KEYSTORE_BASE64"
echo "Secret 값:"
echo "$BASE64"
echo ""
echo "Secret 이름: KEYSTORE_PASSWORD"
echo "Secret 값: $KS_PASS"
echo ""
echo "Secret 이름: KEY_ALIAS"
echo "Secret 값: $KEY_ALIAS"
echo ""
echo "Secret 이름: KEY_PASSWORD"
echo "Secret 값: $KS_PASS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⚠️  $KEYSTORE_FILE 파일을 안전한 곳에 백업하세요! (분실 시 재발급 불가)"
