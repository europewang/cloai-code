---
name: "rag-query"
description: "Queries RagFlow knowledge with governed proxy API. Invoke when user asks to use rag技能/toolcall-style retrieval and expects structured answer."
---

# RAG 检索技能

## 用途

通过统一治理后端 `brain-server` 的受控接口执行知识库检索：

1. 统一入口：`POST /api/v1/rag/query`
2. 自动继承权限与审计策略（由后端执行）
3. 返回结构化 JSON 结果，适配 toolcall 风格消费

## 何时调用

1. 用户明确说“请使用rag技能/请检索知识库”。
2. 需要可追溯（audit）与可控权限的数据检索。
3. 需要结构化结果（traceId/chatId/data）而不是自由文本。

## 运行方式

```bash
python3 skills/rag_query/run_skill.py \
  --query "什么是半面积" \
  --base-url "http://127.0.0.1:8091" \
  --username "admin" \
  --password "admin123456"
```

可选参数：

1. `--dataset-id`：指定数据集权限范围（普通用户建议必填）。
2. `--chat-id`：指定 RagFlow 会话 ID。
3. `--top-k`：检索条数上限。
4. `--access-token`：已拿到 token 时可直接传入，跳过登录。

## 输出格式

标准输出为 JSON，关键字段如下：

1. `traceId`
2. `chatId`
3. `data`（上游 RagFlow 返回）
