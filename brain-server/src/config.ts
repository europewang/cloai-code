import { z } from 'zod'

// 统一配置入口：先用环境变量驱动，后续可扩展为配置中心。
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8091),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@127.0.0.1:5433/ai4kb_brain'),
  REDIS_URL: z.string().default('redis://127.0.0.1:6380'),
  JWT_SECRET: z.string().min(8),
  JWT_ACCESS_EXPIRES_IN: z.string().default('8h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  BOOTSTRAP_ADMIN_USERNAME: z.string().default('admin'),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().default('admin123456'),
  BOOTSTRAP_ADMIN_ROLE: z.enum(['super_admin', 'admin']).default('super_admin'),
  BOOTSTRAP_ADMIN_PROFILE_ID: z.string().default('profile-admin'),
  BOOTSTRAP_SUPERADMIN_USERNAME: z.string().default('superadmin'),
  BOOTSTRAP_SUPERADMIN_PASSWORD: z.string().default('ChangeMe123!'),
  BOOTSTRAP_SUPERADMIN_PROFILE_ID: z.string().default('profile-superadmin'),
  BOOTSTRAP_MANAGER_USERNAME: z.string().default('admin'),
  BOOTSTRAP_MANAGER_PASSWORD: z.string().default('ChangeMe123!'),
  BOOTSTRAP_MANAGER_PROFILE_ID: z.string().default('profile-admin'),
  BOOTSTRAP_USER_A_USERNAME: z.string().default('zhangsan'),
  BOOTSTRAP_USER_A_PASSWORD: z.string().default('ChangeMe123!'),
  BOOTSTRAP_USER_A_PROFILE_ID: z.string().default('profile-49'),
  BOOTSTRAP_USER_B_USERNAME: z.string().default('lisi'),
  BOOTSTRAP_USER_B_PASSWORD: z.string().default('ChangeMe123!'),
  BOOTSTRAP_USER_B_PROFILE_ID: z.string().default('profile-79'),
  RAGFLOW_BASE_URL: z.string().default('http://127.0.0.1:8084'),
  RAGFLOW_API_KEY: z.string().optional(),
  RAGFLOW_BEARER_TOKEN: z.string().optional(),
  RAGFLOW_AUTHORIZATION: z.string().optional(),
  RAGFLOW_QUERY_PATH: z.string().default('/api/v1/chats_openai/{chatId}/chat/completions'),
  RAGFLOW_CHAT_ID: z.string().optional(),
  RAGFLOW_MODEL: z.string().default('deepseek-r1-distill-qwen-14b@Xinference'),
  SKILL_FILE_BASE_DIR: z.string().default('/tmp/brain-skill-files'),
  SKILL_INPUT_BASE_DIR: z.string().default('/tmp/brain-skill-files/inputs'),
  SKILL_OUTPUT_BASE_DIR: z.string().default('/tmp/brain-skill-files/outputs'),
  SKILL_INDICATOR_SCRIPT_PATH: z
    .string()
    .default('/opt/skills/cad_text_extractor/run_skill.py'),
  FILE_STORAGE_BACKEND: z.enum(['local', 's3']).default('local'),
  FILE_S3_ENDPOINT: z.string().default('http://host.docker.internal:9002'),
  FILE_S3_REGION: z.string().default('us-east-1'),
  FILE_S3_ACCESS_KEY_ID: z.string().default('ragflow'),
  FILE_S3_SECRET_ACCESS_KEY: z.string().default('infini_rag_flow'),
  FILE_S3_BUCKET: z.string().default('brain-skill-files'),
  FILE_S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
})

export type AppConfig = z.infer<typeof envSchema>

export function loadConfig(): AppConfig {
  return envSchema.parse(process.env)
}
