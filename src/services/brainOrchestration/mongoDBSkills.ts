/**
 * MongoDB-backed skill commands for brain service.
 * 
 * These skills are stored in MongoDB (skill_docs collection) and their metadata
 * in PostgreSQL (skills table). This module provides command objects that can
 * be used by SkillTool to execute skills.
 */

import type { Command, PromptCommand } from 'src/types/command.js'
import type { ToolUseContext } from 'src/Tool.js'
import { substituteArguments } from 'src/utils/argumentSubstitution.js'

const BRAIN_SERVER_BASE_URL = process.env.BRAIN_SERVER_BASE_URL || 'http://127.0.0.1:8091'

// Cache for skill metadata from PostgreSQL
interface SkillMetadata {
  name: string
  displayName: string | null
  status: string
  scriptPath: string | null
}

const skillMetadataCache = new Map<string, { metadata: SkillMetadata; timestamp: number }>()
const CACHE_TTL_MS = 60_000 // 1 minute

// Cache for skill markdown content
const skillMarkdownCache = new Map<string, { content: string; timestamp: number }>()

/**
 * Fetch skill list from brain-server (PostgreSQL metadata)
 * Uses public API endpoint (skills are public for now)
 */
async function fetchSkillList(): Promise<SkillMetadata[]> {
  try {
    // Use internal endpoint without auth (brain-service and brain-server are internal services)
    // If endpoint requires auth, we'll get 401 and return empty list
    const response = await fetch(`${BRAIN_SERVER_BASE_URL}/api/v1/skills?status=active`, {
      headers: {
        'Content-Type': 'application/json',
      },
    })
    
    if (!response.ok) {
      // Try alternative: get all skills without filter
      const altResponse = await fetch(`${BRAIN_SERVER_BASE_URL}/api/v1/skills`, {
        headers: {
          'Content-Type': 'application/json',
        },
      })
      if (!altResponse.ok) {
        console.error(`Failed to fetch skill list: ${response.status} / ${altResponse.status}`)
        return []
      }
      const skills = await altResponse.json() as any[]
      return skills.map(s => ({
        name: s.name,
        displayName: s.displayName || s.display_name || null,
        status: s.status,
        scriptPath: s.scriptPath || s.script_path || null,
      }))
    }
    
    return await response.json() as SkillMetadata[]
  } catch (error) {
    console.error('Error fetching skill list:', error)
    return []
  }
}

/**
 * Fetch skill markdown from brain-server (MongoDB)
 */
async function fetchSkillMarkdown(skillName: string): Promise<string | null> {
  try {
    // Try public API first
    const response = await fetch(`${BRAIN_SERVER_BASE_URL}/api/v1/skills/${skillName}`, {
      headers: {
        'Content-Type': 'application/json',
      },
    })
    
    if (!response.ok) {
      return null
    }
    
    const data = await response.json() as { rawMarkdown?: string; markdown?: string }
    return data.rawMarkdown || data.markdown || null
  } catch (error) {
    console.error(`Error fetching markdown for skill ${skillName}:`, error)
    return null
  }
}

/**
 * Parse frontmatter from markdown content
 */
function parseFrontmatter(content: string): { name: string; description?: string; context?: string; agent?: string } | null {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/)
  if (!match) return null
  
  const yamlContent = match[1]
  const result: Record<string, string> = {}
  
  // Simple YAML parser
  for (const line of yamlContent.split('\n')) {
    const colonIndex = line.indexOf(':')
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim()
      let value = line.slice(colonIndex + 1).trim()
      // Remove quotes
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      result[key] = value
    }
  }
  
  return {
    name: result.name || '',
    description: result.description,
    context: result.context,
    agent: result.agent,
  }
}

/**
 * Get MongoDB-backed skill commands
 * Returns PromptCommand objects for skills stored in MongoDB
 */
export async function getMongoDBSkills(): Promise<Command[]> {
  // Check cache
  const now = Date.now()
  const cached = skillMetadataCache.get('skills')
  let skillList: SkillMetadata[] = []
  
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    skillList = cached.metadata as unknown as SkillMetadata[]
  } else {
    skillList = await fetchSkillList()
    skillMetadataCache.set('skills', { metadata: skillList as unknown as SkillMetadata, timestamp: now })
  }
  
  const commands: Command[] = []
  
  for (const skill of skillList) {
    if (skill.status !== 'active') continue
    
    // Get markdown content
    const cachedMarkdown = skillMarkdownCache.get(skill.name)
    let markdownContent: string
    
    if (cachedMarkdown && now - cachedMarkdown.timestamp < CACHE_TTL_MS) {
      markdownContent = cachedMarkdown.content
    } else {
      const markdown = await fetchSkillMarkdown(skill.name)
      if (!markdown) {
        console.warn(`No markdown found for skill: ${skill.name}`)
        continue
      }
      markdownContent = markdown
      skillMarkdownCache.set(skill.name, { content: markdownContent, timestamp: now })
    }
    
    // Parse frontmatter
    const frontmatter = parseFrontmatter(markdownContent)
    if (!frontmatter) {
      console.warn(`Invalid frontmatter for skill: ${skill.name}`)
      continue
    }
    
    // Build PromptCommand
    const command: PromptCommand = {
      type: 'prompt',
      name: skill.name,
      description: frontmatter.description || `Skill: ${skill.displayName || skill.name}`,
      context: frontmatter.context === 'inline' ? 'inline' : 'fork',
      agent: frontmatter.agent || 'general-purpose',
      source: 'prompt' as const,
      loadedFrom: 'skills' as const,
      userInvocable: true,
      disableModelInvocation: false,
      contentLength: markdownContent.length,
      isHidden: false,
      progressMessage: 'running',
      skillRoot: skill.scriptPath || null,
      userFacingName(): string {
        return skill.displayName || skill.name
      },
      async getPromptForCommand(args: string, _toolUseContext: ToolUseContext) {
        // Build the skill execution prompt
        // The skill script is located at /opt/skills/<skill_name>/run_skill.py in the brain container
        const skillScriptDir = skill.scriptPath ? skill.scriptPath.replace(/\/run_skill\.py$/, '') : `/opt/skills/${skill.name}`
        
        // Prepend execution instruction to ensure the model executes the skill
        const executionInstruction = `You are executing the "${skill.name}" skill. Follow the instructions below to complete the task.\n\n`
        
        let content = `${executionInstruction}Base directory for this skill: ${skillScriptDir}\n\n${markdownContent}`
        
        // Substitute arguments
        content = substituteArguments(content, args, true, [])
        
        // Replace ${CLAUDE_SKILL_DIR} with actual skill script directory
        content = content.replace(/\$\{CLAUDE_SKILL_DIR\}/g, skillScriptDir.replace(/\\/g, '/'))
        
        return [{ type: 'text' as const, text: content }]
      },
    }
    
    commands.push(command)
  }
  
  return commands
}

/**
 * Clear all caches (useful for testing)
 */
export function clearSkillCaches(): void {
  skillMetadataCache.clear()
  skillMarkdownCache.clear()
}
