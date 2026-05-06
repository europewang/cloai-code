#!/bin/bash
# CAD Skill 完整测试脚本 - 验证前端 + 后端完整流程
# 测试步骤：
# 1. 登录获取 Token
# 2. 上传 DXF 文件
# 3. 调用 brain/query 接口（带 fileIds）
# 4. 验证 SSE 响应和下载链接

set -e

# 配置
BRAIN_SERVER="http://localhost:8091"
BRAIN_SERVICE="http://localhost:3100"
TEST_INPUT="/home/ubutnu/code/cloai-code/test/cad_skill_test/input"

echo "========================================"
echo "CAD 指标校核技能完整流程测试"
echo "========================================"

echo ""
echo "=== 1. 登录获取 Token ==="
LOGIN_RESPONSE=$(curl -s -X POST "$BRAIN_SERVER/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username": "superadmin", "password": "ChangeMe123!"}')

TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.accessToken')
if [ "$TOKEN" == "null" ] || [ -z "$TOKEN" ]; then
    echo "❌ 登录失败"
    echo "响应: $LOGIN_RESPONSE"
    exit 1
fi
echo "✓ 登录成功"

echo ""
echo "=== 2. 上传 DXF 文件 ==="
# 上传第一个文件
UPLOAD_RESPONSE=$(curl -s -X POST "$BRAIN_SERVER/api/v1/files/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$TEST_INPUT/A地块.dxf")

FILE_ID_1=$(echo $UPLOAD_RESPONSE | jq -r '.fileId')
echo "上传 A地块.dxf: $FILE_ID_1"

# 上传第二个文件
UPLOAD_RESPONSE2=$(curl -s -X POST "$BRAIN_SERVER/api/v1/files/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$TEST_INPUT/竣工测试.dxf")

FILE_ID_2=$(echo $UPLOAD_RESPONSE2 | jq -r '.fileId')
echo "上传 竣工测试.dxf: $FILE_ID_2"

if [ "$FILE_ID_1" == "null" ] || [ "$FILE_ID_2" == "null" ]; then
    echo "❌ 文件上传失败"
    exit 1
fi
echo "✓ 文件上传成功"

echo ""
echo "=== 3. 调用 brain/query（带 fileIds）==="

# 调用 brain-query 接口，带上 fileIds
QUERY='请调用指标校核技能，处理上传的 DXF 文件'

curl -s -X POST "$BRAIN_SERVER/api/v1/brain/query" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"query\": \"$QUERY\", \"fileIds\": [\"$FILE_ID_1\", \"$FILE_ID_2\"]}" \
  --max-time 300 2>&1 | tee /tmp/cad_full_flow_test.txt

echo ""
echo ""
echo "=== 4. 解析测试结果 ==="
if grep -q "skill_start" /tmp/cad_full_flow_test.txt; then
    echo "✓ 检测到 skill_start 事件"
fi
if grep -q "skill_end" /tmp/cad_full_flow_test.txt; then
    echo "✓ 检测到 skill_end 事件"
fi

# 检查 outputFiles
if grep -q "outputFiles" /tmp/cad_full_flow_test.txt; then
    echo "✓ 检测到 outputFiles"
fi

# 提取并验证下载链接
echo ""
echo "=== 5. 下载链接验证 ==="
grep -o '"download_url":"[^"]*"' /tmp/cad_full_flow_test.txt | while read -r url; do
    # 提取 URL 并解码
    raw_url=$(echo "$url" | sed 's/"download_url":"//' | sed 's/"$//')
    decoded_url=$(python3 -c "import urllib.parse; print(urllib.parse.unquote('$raw_url'))")
    echo "下载文件: $decoded_url"
done

echo ""
echo "========================================"
echo "测试完成"
echo "========================================"
