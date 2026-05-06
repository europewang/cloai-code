import { MongoClient } from 'mongodb'

const client = new MongoClient('mongodb://localhost:27018')
await client.connect()
const db = client.db('ai4kb_brain')

const MARKDOWN = `---
name: "indicator-verification"
description: "Performs CAD indicator verification from DXF and exports JSON/DXF/Excel. Invoke when user asks for 指标校核、面积校核、楼盘表提取."
context: fork
---

# 指标校核技能（CAD）

## 用途

将 DXF 图纸中的"打印图框"范围内文本、面积等信息提取并导出为 JSON/DXF/Excel，供指标校核/面积核验使用。

## 运行方式

\`\`\`bash
python3 /opt/skills/cad_text_extractor/run_skill.py --input-root __SKILL_INPUT_DIR__ --output-root __SKILL_OUTPUT_DIR__ --checker 张三 --reviewer 李四
\`\`\`

参数说明：

1. \`input_root\`：包含 \`.dxf\` 文件的输入目录（支持递归）。**重要：必须使用 \`__SKILL_INPUT_DIR__\` 占位符**，brain-service 会自动替换为本次上传文件所在目录。
2. \`output_root\`：输出目录。**重要：必须使用 \`__SKILL_OUTPUT_DIR__\` 占位符**，brain-service 会自动替换为本次输出目录。
3. \`checker\`：校核人（可选，默认 \`张三\`）。
4. \`reviewer\`：审核人（可选，默认 \`李四\`）。

## 执行步骤

1. 执行: python3 /opt/skills/cad_text_extractor/run_skill.py --input-root __SKILL_INPUT_DIR__ --output-root __SKILL_OUTPUT_DIR__ --checker 张三 --reviewer 李四
2. 等待脚本执行完成
3. brain-service 会自动将生成的文件通过 SSE skill_end 事件返回给前端，包含可下载链接
`

await db.collection('skill_docs').updateOne(
  { name: 'indicator-verification' },
  { $set: { rawMarkdown: MARKDOWN, updatedAt: new Date() }, $setOnInsert: { name: 'indicator-verification', createdAt: new Date() } },
  { upsert: true }
)

const doc = await db.collection('skill_docs').findOne({ name: 'indicator-verification' })
console.log('Updated:', doc ? 'OK' : 'FAILED', 'markdown length:', doc?.rawMarkdown?.length)
await client.close()
