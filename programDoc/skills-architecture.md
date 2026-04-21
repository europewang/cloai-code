# Skills 技能管理系统架构

## 概述

Skills 技能管理系统采用 **双数据库架构**：
- **PostgreSQL**：存储技能元数据、权限配置、快捷方式
- **MongoDB**：存储技能的核心内容（SKILL.md 的原始 Markdown）
- **文件系统**：保留脚本文件（run_skill.py 等）

## 架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         前端 (Frontend)                                   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 技能管理页面                                                      │   │
│  │ - 列表查看（从 PostgreSQL 获取）                                  │   │
│  │ - Markdown 编辑器（左侧编辑，右侧预览）                           │   │
│  │ - 保存时写入 MongoDB                                              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     brain-server (Fastify)                               │
│                                                                          │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐      │
│  │   Skills API    │    │  Pre-Server    │    │  Post-Server    │      │
│  │ (CRUD + 快捷方式) │    │ (allowedSkills)│    │ (权限校验)      │      │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘      │
│           │                        │                        │              │
│           │  skills 表             │  permissions 表        │              │
│           ▼                        ▼                        │              │
│  ┌─────────────────────────────────────────────────────────────┐        │
│  │                    PostgreSQL                                 │        │
│  │  ┌──────────────────────────────────────────────────────┐  │        │
│  │  │ skills 表 { id, name, displayName, mongoDocId,      │  │        │
│  │  │           status, allowedRoles, scriptPath }        │  │        │
│  │  └──────────────────────────────────────────────────────┘  │        │
│  │  ┌──────────────────────────────────────────────────────┐  │        │
│  │  │ skill_shortcuts 表 { id, skillId, name,            │  │        │
│  │  │                    displayName, fixedParams }       │  │        │
│  │  └──────────────────────────────────────────────────────┘  │        │
│  └─────────────────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ mongoDocId
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        MongoDB                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  skill_docs 集合                                                 │   │
│  │  {                                                            │   │
│  │    _id: ObjectId,                                              │   │
│  │    name: "rag-query",                                          │   │
│  │    rawMarkdown: "# RAG检索技能\n\n你是一个...",                │   │
│  │    createdAt, updatedAt                                        │   │
│  │  }                                                            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ rawMarkdown
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    src brain (SkillTool)                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  mongoDBSkills.ts                                             │   │
│  │  - 从 brain-server 获取技能列表                                  │   │
│  │  - 解析 frontmatter 获取元数据                                  │   │
│  │  - 构建 PromptCommand 对象                                      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  SkillTool.call()                                              │   │
│  │  - 执行 prepareForkedCommandContext                              │   │
│  │  - 运行子代理执行技能                                            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

## 数据库表结构

### PostgreSQL

#### skills 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGSERIAL | 主键 |
| name | VARCHAR(128) | 技能唯一名称（唯一索引） |
| display_name | VARCHAR(256) | 显示名称 |
| mongo_doc_id | VARCHAR(64) | MongoDB 文档 ID |
| status | VARCHAR(32) | 状态：active / inactive |
| allowed_roles | TEXT[] | 允许访问的角色 |
| script_path | VARCHAR(512) | 脚本路径（可选） |
| created_at | TIMESTAMPTZ | 创建时间 |
| updated_at | TIMESTAMPTZ | 更新时间 |

#### skill_shortcuts 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGSERIAL | 主键 |
| skill_id | BIGINT | 关联 skills.id |
| name | VARCHAR(128) | 快捷方式名称 |
| display_name | VARCHAR(256) | 显示名称 |
| fixed_params | JSONB | 固定参数 |
| description | TEXT | 描述 |
| created_at | TIMESTAMPTZ | 创建时间 |
| updated_at | TIMESTAMPTZ | 更新时间 |

### MongoDB

#### skill_docs 集合
| 字段 | 类型 | 说明 |
|------|------|------|
| _id | ObjectId | 主键 |
| name | string | 技能名称（唯一索引） |
| rawMarkdown | string | 完整 SKILL.md 内容 |
| createdAt | Date | 创建时间 |
| updatedAt | Date | 更新时间 |

## SKILL.md 格式

SKILL.md 使用 YAML frontmatter 定义元数据：

```markdown
---
name: "skill-name"
description: "技能描述"
context: fork        # inline 或 fork
agent: general-purpose  # 可选，指定代理类型
---

# 技能标题

## 用途
简要说明技能的用途。

## 运行方式

```bash
python3 skills/my_skill/run_skill.py $ARGUMENTS
```

## 参数说明
- `ARGUMENTS`: 用户查询内容
```

### Frontmatter 字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 技能唯一标识 |
| description | string | 否 | 技能描述 |
| context | string | 否 | 执行上下文：inline / fork（默认 fork） |
| agent | string | 否 | 代理类型，默认 general-purpose |

## API 接口

### Skills CRUD

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/skills | 获取技能列表 |
| GET | /api/v1/skills/:name | 获取单个技能（含 Markdown） |
| POST | /api/v1/skills | 创建技能 |
| PUT | /api/v1/skills/:name | 更新技能 |
| DELETE | /api/v1/skills/:name | 删除技能 |

### Skill Shortcuts

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/skills/:name/shortcuts | 获取快捷方式列表 |
| POST | /api/v1/skills/:name/shortcuts | 创建快捷方式 |
| PUT | /api/v1/skills/:name/shortcuts/:id | 更新快捷方式 |
| DELETE | /api/v1/skills/:name/shortcuts/:id | 删除快捷方式 |

### Internal API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/internal/skills/:name/markdown | 获取技能 Markdown（供 brain 使用） |

## 部署配置

### Docker Compose

```yaml
services:
  brain-server:
    # ...
    environment:
      - MONGO_URL=mongodb://brain-mongo:27017
      - MONGO_DB_NAME=ai4kb_brain
    depends_on:
      brain-mongo:
        condition: service_healthy

  brain-mongo:
    image: mongo:7
    # ...
    volumes:
      - brain_mongo_data:/data/db

volumes:
  brain_mongo_data:
```

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| MONGO_URL | mongodb://127.0.0.1:27017 | MongoDB 连接地址 |
| MONGO_DB_NAME | ai4kb_brain | 数据库名称 |

## 运维命令

### 初始化默认技能

```bash
cd brain-server
npx tsx src/scripts/seedSkills.ts
```

### 迁移现有技能到 MongoDB

```bash
cd brain-server
npx tsx src/scripts/migrateSkillsToMongoDB.ts
```

### 运行数据库迁移

```bash
cd brain-server
npx prisma migrate deploy
```

## 前端使用

1. **登录**：访问前端，使用 admin 账号登录
2. **进入技能管理**：点击侧边栏 "技能管理"
3. **查看技能列表**：默认显示所有技能
4. **创建新技能**：
   - 点击 "新增技能" 按钮
   - 填写技能名称和显示名称
   - 在左侧 Markdown 编辑器中编写 SKILL.md 内容
   - 右侧实时预览
   - 点击提交保存
5. **编辑现有技能**：
   - 点击列表中的 "修改" 按钮
   - 左侧显示现有 Markdown 内容
   - 编辑后点击提交保存
6. **上线/下线技能**：使用列表中的上线/下线按钮

## 脚本文件管理

脚本文件（run_skill.py 等）**保留在文件系统**，不需要迁移到数据库。

### 目录结构

```
skills/
├── cad_text_extractor/
│   ├── SKILL.md          # 可删除（已迁移到 MongoDB）
│   └── run_skill.py      # 保留在文件系统
├── rag_query/
│   ├── SKILL.md          # 可删除（已迁移到 MongoDB）
│   └── run_skill.py      # 保留在文件系统
└── my_custom_skill/
    ├── SKILL.md          # 可删除（已迁移到 MongoDB）
    └── run_skill.py      # 保留在文件系统
```

### 脚本路径配置

在 PostgreSQL 的 `skills.script_path` 字段中配置脚本路径，或在 SKILL.md 中使用相对路径引用。

## 权限控制

- **admin** 和 **super_admin** 可以创建、修改、删除技能
- **user** 只能查看技能列表
- 技能的 `allowedRoles` 字段控制哪些角色可以调用该技能
- `loadUserPermissionContext` 函数会从 `permissions` 表获取用户的 `allowedSkills`
