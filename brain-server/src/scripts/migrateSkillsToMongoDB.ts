/**
 * Migration script to import existing skills from filesystem to MongoDB
 * 
 * Usage:
 *   npx tsx src/scripts/migrateSkillsToMongoDB.ts
 * 
 * This will:
 * 1. Scan skills/ directory for SKILL.md files
 * 2. Import each skill's content into MongoDB
 * 3. Create/update skill records in PostgreSQL
 */

import { loadConfig } from '../config.js'
import { initMongoDB, getSkillDocsCollection, type SkillDoc } from '../lib/mongodb.js'
import { prisma } from '../lib/prisma.js'
import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

async function scanSkillsDir(skillsDir: string): Promise<string[]> {
  const skillDirs: string[] = []
  
  async function scan(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        const skillMdPath = join(fullPath, 'SKILL.md')
        try {
          await readFile(skillMdPath, 'utf-8')
          skillDirs.push(fullPath)
        } catch {
          // Not a skill directory (no SKILL.md)
        }
      }
    }
  }
  
  await scan(skillsDir)
  return skillDirs
}

async function migrateSkillsToMongoDB() {
  const config = loadConfig()
  
  console.log('Starting skill migration to MongoDB...')
  
  // Initialize connections
  await initMongoDB()
  
  // Get skill directories
  const projectRoot = resolve(process.cwd(), '..')
  const skillsDir = join(projectRoot, 'skills')
  
  console.log(`Scanning ${skillsDir} for skills...`)
  const skillDirs = await scanSkillsDir(skillsDir)
  console.log(`Found ${skillDirs.length} skills`)
  
  const collection = getSkillDocsCollection()
  let imported = 0
  let skipped = 0
  
  for (const skillDir of skillDirs) {
    const skillName = skillDir.split('/').pop() || ''
    const skillMdPath = join(skillDir, 'SKILL.md')
    
    try {
      const rawMarkdown = await readFile(skillMdPath, 'utf-8')
      
      // Upsert to MongoDB
      await collection.updateOne(
        { name: skillName },
        {
          $set: { 
            rawMarkdown,
            updatedAt: new Date()
          },
          $setOnInsert: {
            name: skillName,
            createdAt: new Date()
          }
        },
        { upsert: true }
      )
      
      // Check if skill exists in PostgreSQL
      const existingSkill = await prisma.skill.findUnique({
        where: { name: skillName }
      })
      
      if (!existingSkill) {
        // Create skill record in PostgreSQL
        const scriptPath = join(skillDir, 'run_skill.py')
        let scriptPathValue: string | null = null
        try {
          await readFile(scriptPath, 'utf-8')
          scriptPathValue = scriptPath
        } catch {
          // No run_skill.py
        }
        
        await prisma.skill.create({
          data: {
            name: skillName,
            displayName: skillName.replace(/-/g, ' '),
            status: 'active',
            allowedRoles: ['user'],
            scriptPath: scriptPathValue,
          }
        })
        console.log(`  Created skill: ${skillName}`)
      }
      
      imported++
      console.log(`  Imported: ${skillName}`)
    } catch (err) {
      console.error(`  Failed to import ${skillName}:`, err)
      skipped++
    }
  }
  
  console.log(`\nMigration complete!`)
  console.log(`  Imported: ${imported}`)
  console.log(`  Skipped: ${skipped}`)
}

// Run migration
migrateSkillsToMongoDB()
  .then(() => {
    console.log('Done!')
    process.exit(0)
  })
  .catch((err) => {
    console.error('Migration failed:', err)
    process.exit(1)
  })
