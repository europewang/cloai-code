# Skills 技能架构

> 更新时间：2026-05-12

## 1. 技能类型

| 类型 | 挂载位置 | 作用 |
|---|---|---|
| 对话技能 | `.trae/skills/<name>/SKILL.md` | 控制 Agent 在对话里何时调用、怎么执行 |
| 运行时技能 | `skills/<name>/` | 被 brain-server 调用，执行真实任务并返回结果 |

## 2. 运行时技能目录

```
skills/
├── rag_query/                ← RAG 检索技能
│   ├── SKILL.md
│   ├── run_skill.py
│   └── requirements.txt
└── cad_text_extractor/       ← CAD 指标校核（原 indicator-verification）
    ├── SKILL.md
    └── run_skill.py
```

## 3. SKILL.md 格式

```markdown
---
name: "rag-query"
description: "知识库检索"
context: fork        # 必填：inline（读文件内容）/ fork（执行子进程）
agent: general-purpose
---

# 知识库检索

## 用途
从 RagFlow 知识库检索相关片段并返回结构化答案。

## 运行方式
python3 skills/rag_query/run_skill.py $ARGUMENTS
```

**`context: fork`** 是关键——没有此配置，skill 内容只被当作 markdown 说明读给 LLM，不会真正执行。

## 4. 运行时接口

brain-server 通过以下接口调用技能：

| 端点 | 说明 |
|---|---|
| `GET /api/v1/skills` | 获取技能目录 |
| `POST /api/v1/skills/<name>/run` | 执行技能（indicator-verification 用此接口） |
| `POST /api/v1/rag/query` | RAG 检索（非流式） |
| `POST /api/v1/rag/query/stream` | RAG 检索（流式 SSE） |

## 5. 前端技能意图识别

`frontend/server.js` 的 `/agent/chat/stream` 根据关键词自动适配：

- 命中 RAG 关键词 → 自动携带 `skillId=rag-query`
- 命中 CAD 关键词 → 先返回 `tool_draft`，引导上传文件

## 6. run_skill.py 输出格式

统一 JSON 包装：

```json
{
  "ok": true,
  "skill": "rag-query",
  "traceId": "...",
  "answer": "...",
  "referenceCount": 6,
  "references": [...]
}
```
