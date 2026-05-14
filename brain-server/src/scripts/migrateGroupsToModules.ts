/**
 * 一次性迁移脚本：将 settings.groups 迁移到 settings.skills，
 * 并清空旧 groups 字段（避免 GET 三个模块都读到同一份数据）。
 *
 * 用法：npx tsx src/scripts/migrateGroupsToModules.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function migrate() {
  console.log('开始迁移 settings.groups → settings.skills/databases/models ...\n')

  // Prisma 6 不支持 select settings，改用原始 SQL
  const result = await prisma.$queryRaw<Array<{ id: bigint; username: string; settings: any }>>`
    SELECT id, username, settings FROM users
  `

  const usersWithGroups = result.filter(u => {
    const s = u.settings || {}
    return Array.isArray(s.groups) && s.groups.length > 0
  })

  console.log(`扫描 ${result.length} 个用户，找到 ${usersWithGroups.length} 个有待迁移的 settings.groups\n`)

  for (const user of usersWithGroups) {
    const settings = user.settings || {}
    const rawGroups = settings.groups

    if (!Array.isArray(rawGroups) || rawGroups.length === 0) {
      console.log(`  [${user.username}] groups 为空，跳过`)
      continue
    }

    // 旧数据都是技能库的 groups，迁移到 settings.skills
    const skillsGroups = rawGroups

    const existingSkills = settings.skills
    const existingDbs = settings.databases
    const existingModels = settings.models

    const updated = {
      ...settings,
      skills: existingSkills ?? skillsGroups,
      databases: existingDbs ?? [],
      models: existingModels ?? [],
      // 清除旧 groups，避免 fallback 干扰
      groups: undefined,
    }

    // 用原始 SQL 更新（Prisma 6 JSON 字段不支持直接 update）
    await prisma.$executeRaw`
      UPDATE users
      SET settings = ${JSON.stringify(updated)}::jsonb
      WHERE id = ${user.id}
    `

    console.log(
      `  [${user.username}] 迁移 ${skillsGroups.length} 个分组到 skills，` +
        `databases=${Array.isArray(existingDbs) ? existingDbs.length + '(已有)' : '空(新建)'}, ` +
        `models=${Array.isArray(existingModels) ? existingModels.length + '(已有)' : '空(新建)'}`
    )
  }

  console.log('\n迁移完成！')
  await prisma.$disconnect()
}

migrate().catch((e) => {
  console.error('迁移失败:', e)
  process.exit(1)
})
