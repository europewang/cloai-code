#!/bin/bash
# CAD Skill 测试脚本 - 模拟前端操作

set -e

# 配置
BRAIN_SERVER="http://localhost:8091"
FRONTEND="http://localhost:8086"
TEST_INPUT="/home/ubutnu/code/cloai-code/test/input"

echo "=== 1. 登录获取 Token ==="
LOGIN_RESPONSE=$(curl -s -X POST "$BRAIN_SERVER/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username": "superadmin", "password": "ChangeMe123!"}')

TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.accessToken')
echo "Token: ${TOKEN:0:50}..."

echo ""
echo "=== 2. 获取用户权限 ==="
PERMS=$(curl -s -X GET "$BRAIN_SERVER/api/v1/admin/users/83/permissions" \
  -H "Authorization: Bearer $TOKEN")
echo "Permissions: $(echo $PERMS | jq -r '.[].resourceId' | tr '\n' ', ')"

echo ""
echo "=== 3. 上传 DXF 文件到 MinIO ==="
# 创建临时目录用于上传
UPLOAD_DIR="/tmp/cad_upload_$$"
mkdir -p "$UPLOAD_DIR"

# 复制测试文件
cp "$TEST_INPUT/A地块.dxf" "$UPLOAD_DIR/"
cp "$TEST_INPUT/竣工测试.dxf" "$UPLOAD_DIR/"

echo "上传目录内容:"
ls -la "$UPLOAD_DIR/"

# 计算文件 MD5
MD5_SUM=$(md5sum "$UPLOAD_DIR/A地块.dxf" | awk '{print $1}')
echo "A地块.dxf MD5: $MD5_SUM"

echo ""
echo "=== 4. 调用 Brain Query (CAD Skill) ==="
QUERY='请调用指标校核技能，处理 A地块.dxf 文件'

# 发起查询
curl -s -X POST "$BRAIN_SERVER/api/v1/brain/query" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"query\": \"$QUERY\"}" \
  --max-time 300 2>&1 | tee /tmp/brain_cad_response.txt

echo ""
echo "=== 5. 检查响应 ==="
if grep -q "skill_start" /tmp/brain_cad_response.txt; then
    echo "✓ 检测到 skill_start 事件"
fi
if grep -q "skill_end" /tmp/brain_cad_response.txt; then
    echo "✓ 检测到 skill_end 事件"
fi
if grep -q "error" /tmp/brain_cad_response.txt; then
    echo "⚠ 检测到错误"
    grep "error" /tmp/brain_cad_response.txt | head -3
fi

echo ""
echo "=== 6. 清理 ==="
rm -rf "$UPLOAD_DIR"
echo "完成"
