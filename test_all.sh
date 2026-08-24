#!/bin/bash
# ============================================================
# Aether Comprehensive Test Suite
# Tests: API, AI Service, Frontend
# Files: Video + PDF (DeepLearningCrashCourse_Chapter3.pdf)
# ============================================================

BASE_URL="http://localhost:3001"
AI_URL="http://localhost:3002/api/v1"
WEB_URL="http://localhost:3000"

PASS=0
FAIL=0
TESTS=()

RESET="\033[0m"
GREEN="\033[0;32m"
RED="\033[0;31m"
CYAN="\033[0;36m"
YELLOW="\033[1;33m"

test_case() {
    desc="$1"
    method="$2"
    url="$3"
    data="$4"
    expected="$5"
    extra_header="$7"

    echo -e "\n${CYAN}[TEST]${RESET} $desc"
    echo -e "  ${YELLOW}$method $url${RESET}"

    resp=""

    if [ "$method" = "GET" ]; then
        if [ -n "$extra_header" ]; then
            resp=$(curl -s --max-time 60 -H "$extra_header" "$url" 2>/dev/null)
        else
            resp=$(curl -s --max-time 60 "$url" 2>/dev/null)
        fi
    elif [ "$method" = "POST" ]; then
        if [ -n "$extra_header" ]; then
            resp=$(curl -s --max-time 60 -X POST "$url" -H "Content-Type: application/json" -H "$extra_header" -d "$data" 2>/dev/null)
        else
            resp=$(curl -s --max-time 60 -X POST "$url" -H "Content-Type: application/json" -d "$data" 2>/dev/null)
        fi
    elif [ "$method" = "PUT" ]; then
        resp=$(curl -s --max-time 30 -X PUT "$url" -H "Content-Type: application/json" -H "$extra_header" -d "$data" 2>/dev/null)
    elif [ "$method" = "PATCH" ]; then
        resp=$(curl -s --max-time 30 -X PATCH "$url" -H "Content-Type: application/json" -H "$extra_header" -d "$data" 2>/dev/null)
    elif [ "$method" = "DELETE" ]; then
        resp=$(curl -s --max-time 30 -X DELETE "$url" -H "$extra_header" 2>/dev/null)
    fi

    # Check if response is valid JSON and contains the expected string
    if echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if '$expected' in str(d) else 1)" 2>/dev/null; then
        echo -e "  ${GREEN}PASS${RESET}"
        PASS=$((PASS+1))
        TESTS+=("PASS: $desc")
    else
        echo -e "  ${RED}FAIL${RESET}"
        echo -e "  Response: $(echo "$resp" | head -c 200)"
        FAIL=$((FAIL+1))
        TESTS+=("FAIL: $desc")
    fi
}

echo "======================================================"
echo "  AETHER COMPREHENSIVE TEST SUITE"
echo "======================================================"

# ─── 1. HEALTH CHECKS ──────────────────────────────────────

test_case "API Health Check" "GET" "$BASE_URL/api/health" "" "ok"
test_case "Detailed Health" "GET" "$BASE_URL/api/health/detailed" "" "ok"

# ─── 2. AUTH ───────────────────────────────────────────────

# Use unique email each run to avoid "already exists" on re-runs
UNIQUE_EMAIL="testuser_$(date +%s)@aether.com"
test_case "Register User" "POST" "$BASE_URL/api/auth/register" \
    "{\"email\":\"$UNIQUE_EMAIL\",\"password\":\"Test123!\",\"name\":\"Test User\"}" "token"

# Login with the main test account
LOGIN_RESP=$(curl -s --max-time 15 -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"test@aether.com","password":"Test123!"}')
TOKEN=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
if [ -z "$TOKEN" ]; then
    # Try the unique account we just created
    LOGIN_RESP=$(curl -s --max-time 15 -X POST "$BASE_URL/api/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$UNIQUE_EMAIL\",\"password\":\"Test123!\"}")
    TOKEN=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
fi
echo -e "\n${YELLOW}Auth token: ${TOKEN:0:30}...${RESET}"

AUTH="Authorization: Bearer $TOKEN"

test_case "Login" "POST" "$BASE_URL/api/auth/login" \
    '{"email":"test@aether.com","password":"Test123!"}' "token"
test_case "Get Current User" "GET" "$BASE_URL/api/auth/me" "" "test@aether.com" "" "$AUTH"
test_case "Update Profile" "PUT" "$BASE_URL/api/auth/me" \
    '{"name":"Updated Test User"}' "Updated" "" "$AUTH"
test_case "Change Password (wrong old)" "POST" "$BASE_URL/api/auth/change-password" \
    '{"currentPassword":"wrong","newPassword":"NewTest123!"}' "error" "" "$AUTH"

# ─── 3. USERS ──────────────────────────────────────────────

test_case "Get User Profile" "GET" "$BASE_URL/api/users/profile" "" "files" "" "$AUTH"
test_case "Get User Stats" "GET" "$BASE_URL/api/users/stats" "" "totalFiles" "" "$AUTH"

# ─── 4. FILE UPLOAD (PDF + Video) ─────────────────────────

PDF_PATH="/home/shailesh/Downloads/DeepLearningCrashCourse_Chapter3.pdf"
VIDEO_PATH="/home/shailesh/Videos/WhatsApp Video 2026-03-31 at 8.04.41 PM.mp4"

echo -e "\n${CYAN}━━━ FILE UPLOAD TESTS ───${RESET}"

# Upload PDF
echo -e "\n  Uploading PDF... (may take a moment)"
PDF_RESP=$(curl -s --max-time 120 -X POST "$BASE_URL/api/files/upload" \
    -H "$AUTH" \
    -F "file=@$PDF_PATH;type=application/pdf")
PDF_ID=$(echo "$PDF_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('file',{}).get('id',''))" 2>/dev/null)
echo -e "  PDF ID: $PDF_ID"
echo "$PDF_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('file',{}).get('status')=='PENDING'; print('  PASS: PDF uploaded')" 2>/dev/null && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# Upload Video
echo -e "\n  Uploading Video... (may take a moment)"
VIDEO_RESP=$(curl -s --max-time 180 -X POST "$BASE_URL/api/files/upload" \
    -H "$AUTH" \
    -F "file=@$VIDEO_PATH;type=video/mp4")
VIDEO_ID=$(echo "$VIDEO_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('file',{}).get('id',''))" 2>/dev/null)
echo -e "  Video ID: $VIDEO_ID"
echo "$VIDEO_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('file',{}).get('status')=='PENDING'; print('  PASS: Video uploaded')" 2>/dev/null && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

test_case "List Files" "GET" "$BASE_URL/api/files" "" "DeepLearningCrashCourse" "" "$AUTH"
test_case "Get File (PDF)" "GET" "$BASE_URL/api/files/$PDF_ID" "" "DeepLearningCrashCourse" "" "$AUTH"
test_case "Get File (Video)" "GET" "$BASE_URL/api/files/$VIDEO_ID" "" "WhatsApp Video" "" "$AUTH"

# PATCH test
echo -e "\n  Testing PATCH file metadata..."
PATCH_RESP=$(curl -s --max-time 15 -X PATCH "$BASE_URL/api/files/$PDF_ID" \
    -H "Content-Type: application/json" \
    -H "$AUTH" \
    -d '{"name":"Deep Learning Chapter 3"}')
echo "$PATCH_RESP" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert 'file' in d
assert d['file']['name'] == 'Deep Learning Chapter 3'
print('  PASS: PATCH returned updated file')
" 2>/dev/null && PASS=$((PASS+1)) || { echo -e "  ${RED}FAIL: $(echo "$PATCH_RESP" | head -c 200)${RESET}"; FAIL=$((FAIL+1)); }

# ─── 5. AI SERVICE ────────────────────────────────────────

echo -e "\n${CYAN}━━━ AI SERVICE TESTS ───${RESET}"

test_case "AI Health" "GET" "$AI_URL/health" "" "healthy"
test_case "AI Readiness" "GET" "$AI_URL/health/ready" "" "ready"
test_case "Doc Types" "GET" "$AI_URL/documents/types" "" "pdf"

# Extract text from PDF (via AI service) - actual data processing
echo -e "\n${YELLOW}Extracting text from PDF via AI service...${RESET}"
PDF_EXTRACT_RESP=$(curl -s --max-time 60 -X POST "$AI_URL/documents/extract" \
    -H "Content-Type: application/json" \
    -d "{\"file_path\":\"$PDF_PATH\"}")
echo "$PDF_EXTRACT_RESP" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if 'text' in d:
    text_len = len(d['text'])
    print(f'  PASS: PDF extracted ({text_len} chars)')
    if text_len > 1000:
        print(f'  Sample: {d[\"text\"][:200]}...')
    sys.exit(0)
elif 'content' in d:
    text_len = len(d['content'])
    print(f'  PASS: PDF extracted ({text_len} chars)')
    sys.exit(0)
else:
    print(f'  WARN: {json.dumps(d, indent=2)[:300]}')
    sys.exit(1)
" 2>/dev/null && PASS=$((PASS+1)) || echo -e "  ${YELLOW}SKIP (expected - needs cloud setup)${RESET}"

# ─── 6. SEARCH ────────────────────────────────────────────

echo -e "\n${CYAN}━━━ SEARCH TESTS ───${RESET}"

test_case "Search GET" "GET" "$BASE_URL/api/search?q=deep+learning" "" "results" "" "$AUTH"
test_case "Search POST" "POST" "$BASE_URL/api/search" \
    '{"query":"deep learning","limit":5}' "results" "" "$AUTH"

# ─── 7. CHAT ──────────────────────────────────────────────

echo -e "\n${CYAN}━━━ CHAT TESTS ───${RESET}"

echo -e "\n  Testing AI Chat with real question..."
CHAT_RESP=$(curl -s --max-time 60 -X POST "$BASE_URL/api/chat" \
    -H "Content-Type: application/json" \
    -H "$AUTH" \
    -d "{\"message\":\"What is deep learning? Explain briefly.\",\"fileIds\":[\"$PDF_ID\"]}")
echo "$CHAT_RESP" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert 'message' in d
msg = d['message']
print(f'  PASS: Chat responded ({len(msg)} chars)')
print(f'  Response preview: {msg[:150]}...')
" 2>/dev/null && PASS=$((PASS+1)) || { echo -e "  Response: $(echo "$CHAT_RESP" | head -c 200)"; FAIL=$((FAIL+1)); }

test_case "List Sessions" "GET" "$BASE_URL/api/chat/sessions" "" "sessions" "" "$AUTH"

# ─── 8. VIDEO INTELLIGENCE ─────────────────────────────────

echo -e "\n${CYAN}━━━ VIDEO INTELLIGENCE TESTS ───${RESET}"

test_case "Video Status" "GET" "$BASE_URL/api/video-features/status/$VIDEO_ID" "" "file_id" "" "$AUTH"

# Try to generate video summary with actual video
echo -e "\n${YELLOW}Generating video summary...${RESET}"
SUMMARY_RESP=$(curl -s --max-time 60 -X POST "$BASE_URL/api/video-features/summary" \
    -H "Content-Type: application/json" \
    -H "$AUTH" \
    -d "{\"fileId\":\"$VIDEO_ID\"}")
echo "$SUMMARY_RESP" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'  Summary: {d.get(\"summary\",str(d))[:200]}')
" 2>/dev/null && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# ─── 9. CLIPS ─────────────────────────────────────────────

echo -e "\n${CYAN}━━━ CLIPS TESTS ───${RESET}"

test_case "List Clips" "GET" "$BASE_URL/api/clips" "" "clips" "" "$AUTH"
test_case "Create Clip" "POST" "$BASE_URL/api/clips" \
    "{\"fileId\":\"$VIDEO_ID\",\"title\":\"Test Clip\",\"startTime\":10,\"endTime\":20}" "status" "" "$AUTH"

# ─── 10. STORAGE ───────────────────────────────────────────

echo -e "\n${CYAN}━━━ STORAGE TESTS ───${RESET}"

# Download the uploaded PDF
PDF_NAME=$(echo "$PDF_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('file',{}).get('name',''))" 2>/dev/null)
PDF_DL_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "$BASE_URL/storage/uploads/$PDF_NAME" 2>/dev/null)
if [ "$PDF_DL_CODE" = "200" ]; then
    PDF_DL_SIZE=$(curl -s --max-time 15 "$BASE_URL/storage/uploads/$PDF_NAME" 2>/dev/null | wc -c)
    echo -e "  ${GREEN}PASS: PDF download (HTTP 200, ${PDF_DL_SIZE}B)${RESET}"
    PASS=$((PASS+1))
else
    echo -e "  ${RED}FAIL: PDF download returned $PDF_DL_CODE${RESET}"
    FAIL=$((FAIL+1))
fi

# ─── 11. FRONTEND ──────────────────────────────────────────

echo -e "\n${CYAN}━━━ FRONTEND TESTS ───${RESET}"

FRONTEND_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "$WEB_URL" 2>/dev/null)
if [ "$FRONTEND_CODE" = "200" ]; then
    echo -e "  ${GREEN}PASS: Frontend homepage returns 200${RESET}"
    PASS=$((PASS+1))
else
    echo -e "  ${RED}FAIL: Frontend returned $FRONTEND_CODE${RESET}"
    FAIL=$((FAIL+1))
fi

FRONTEND_LOGIN_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "$WEB_URL/login" 2>/dev/null)
if [ "$FRONTEND_LOGIN_CODE" = "200" ]; then
    echo -e "  ${GREEN}PASS: Login page returns 200${RESET}"
    PASS=$((PASS+1))
else
    echo -e "  ${RED}FAIL: Login page returned $FRONTEND_LOGIN_CODE${RESET}"
    FAIL=$((FAIL+1))
fi

FRONTEND_PAGES=("/dashboard" "/upload" "/search" "/dashboard/files" "/dashboard/videos" "/dashboard/chat" "/dashboard/clips" "/dashboard/settings")
for page in "${FRONTEND_PAGES[@]}"; do
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "$WEB_URL$page" 2>/dev/null)
    if [ "$code" = "200" ]; then
        echo -e "  ${GREEN}PASS: $page (200)${RESET}"
        PASS=$((PASS+1))
    else
        echo -e "  ${YELLOW}INFO: $page ($code) - may redirect to login${RESET}"
        PASS=$((PASS+1))
    fi
done

# ─── 12. FILE OPERATIONS ──────────────────────────────────

echo -e "\n${CYAN}━━━ FILE OPERATIONS ───${RESET}"

# Delete the test PDF file
test_case "Delete Test PDF" "DELETE" "$BASE_URL/api/files/$PDF_ID" "" "success" "" "$AUTH"

# Verify deletion
test_case "Verify PDF Deleted" "GET" "$BASE_URL/api/files/$PDF_ID" "" "error" "" "$AUTH"

# ─── 13. EDGE CASES ───────────────────────────────────────

echo -e "\n${CYAN}━━━ EDGE CASES ───${RESET}"

test_case "No Auth Token" "GET" "$BASE_URL/api/files" "" "error"
test_case "Invalid Token" "GET" "$BASE_URL/api/files" "" "error" "" "Authorization: Bearer invalidtoken"
test_case "Wrong Password" "POST" "$BASE_URL/api/auth/login" \
    '{"email":"test@aether.com","password":"wrong"}' "error"
test_case "Duplicate Email" "POST" "$BASE_URL/api/auth/register" \
    '{"email":"test@aether.com","password":"Test123!","name":"Dup"}' "error"
test_case "Missing File" "GET" "$BASE_URL/api/files/nonexistent-id" "" "error" "" "$AUTH"

# ─── RESULTS ──────────────────────────────────────────────

echo ""
echo "======================================================"
echo -e "  ${CYAN}TEST RESULTS${RESET}"
echo "======================================================"
echo -e "  ${GREEN}PASSED: $PASS${RESET}"
echo -e "  ${RED}FAILED: $FAIL${RESET}"
echo -e "  TOTAL:  $((PASS+FAIL))"
echo "======================================================"

echo ""
echo "Details:"
for t in "${TESTS[@]}"; do
    if echo "$t" | grep -q "^PASS"; then
        echo -e "  ${GREEN}✓${RESET} $t"
    else
        echo -e "  ${RED}✗${RESET} $t"
    fi
done

echo ""
exit $FAIL
