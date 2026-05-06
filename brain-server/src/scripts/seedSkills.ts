/**
 * Seed script to initialize default skills in MongoDB
 * 
 * Usage:
 *   npx tsx src/scripts/seedSkills.ts
 * 
 * This seeds the default skills:
 * - rag-query
 * - indicator-verification
 */

import { loadConfig } from '../config.js'
import { initMongoDB, upsertSkillDoc, getSkillDocByName } from '../lib/mongodb.js'
import { prisma } from '../lib/prisma.js'

const DEFAULT_SKILLS = [
  {
    name: 'rag-query',
    displayName: 'RAG 检索',
    rawMarkdown: `---
name: "rag-query"
description: "Queries RagFlow knowledge with governed proxy API. Invoke when user asks to use rag技能/toolcall-style retrieval and expects structured answer."
context: fork
---

# RAG 检索技能

你是一个 RAG 查询助手。请执行以下命令来查询知识库：

\`\`\`bash
cd /app && python3 skills/rag_query/run_skill.py $ARGUMENTS
\`\`\`

重要：
1. 必须实际执行上述命令，不要只是描述要做什么
2. 命令中的 $ARGUMENTS 会被替换为用户的实际查询
3. 执行后，返回命令的 JSON 输出结果
4. 重点提取 JSON 中的 "answer" 字段作为回答内容
`,
    scriptPath: '/opt/skills/rag_query/run_skill.py'
  },
  {
    name: 'indicator-verification',
    displayName: 'CAD 指标校核',
    rawMarkdown: `---
name: "indicator-verification"
description: "Performs CAD indicator verification from DXF and exports JSON/DXF/Excel. Invoke when user asks for 指标校核、面积校核、楼盘表提取."
context: fork
---

# 指标校核技能（CAD）

## 用途

将 DXF 图纸中的"打印图框"范围内文本、面积等信息提取并导出为 JSON/DXF/Excel，供指标校核/面积核验使用。

## 何时调用

1. 用户要求从 DXF 批量提取面积数据。
2. 用户要求生成面积计算表或楼盘导入相关中间结果。
3. 需要对图框内文本进行结构化抽取并做后续审核。
4. 用户在会话中说"请使用指标校核技能"。

## 运行方式

优先使用项目内 runner：

\`\`\`bash
python3 skills/cad_text_extractor/run_skill.py $ARGUMENTS
\`\`\`

或使用显式参数：

\`\`\`bash
python3 skills/cad_text_extractor/run_skill.py \\
  --input-root __SKILL_INPUT_DIR__ \\
  --output-root __SKILL_OUTPUT_DIR__ \\
  --checker 张三 \\
  --reviewer 李四
\`\`\`

参数说明：

1. \`input_root\`：包含 \`.dxf\` 文件的输入目录（支持递归）。**重要：必须使用 \`__SKILL_INPUT_DIR__\` 占位符**，brain-service 会自动替换为本次上传文件所在目录。
2. \`output_root\`：输出目录（使用 \`__SKILL_OUTPUT_DIR__\` 占位符）。
3. \`checker\`：校核人（可选，默认 \`张三\`）。
4. \`reviewer\`：审核人（可选，默认 \`李四\`）。

## 结果说明

脚本执行完成后，会自动返回：
- **打印框数量**、**文本数量**、**多段线数量**
- **下载文件列表**（JSON、DXF、Excel）

请直接向用户展示这些结果，不要自行解读 DXF 文件内容。
`,
    scriptPath: '/opt/skills/cad_text_extractor/run_skill.py'
  }
]

async function seedSkills() {
  console.log('Starting skill seeding...')
  
  // Initialize MongoDB
  await initMongoDB()
  
  let seeded = 0
  
  for (const skill of DEFAULT_SKILLS) {
    console.log(`Seeding skill: ${skill.name}`)
    
    // Upsert to MongoDB
    await upsertSkillDoc(skill.name, skill.rawMarkdown)
    
    // Check if skill exists in PostgreSQL
    const existingSkill = await prisma.skill.findUnique({
      where: { name: skill.name }
    })
    
    if (!existingSkill) {
      // Create skill record in PostgreSQL
      await prisma.skill.create({
        data: {
          name: skill.name,
          displayName: skill.displayName,
          status: 'active',
          allowedRoles: ['user'],
          scriptPath: skill.scriptPath,
        }
      })
      console.log(`  Created PostgreSQL record for: ${skill.name}`)
    } else {
      console.log(`  PostgreSQL record already exists for: ${skill.name}`)
    }
    
    seeded++
  }
  
  console.log(`\nSeeding complete! Seeded ${seeded} skills.`)
}

// Run seeding
seedSkills()
  .then(() => {
    console.log('Done!')
    process.exit(0)
  })
  .catch((err) => {
    console.error('Seeding failed:', err)
    process.exit(1)
  })
