---
name: "rules-enforcer"
description: "强制执行文档对齐与过程记录规则。每次任务前后调用，确保固定文档（progress/summary/plan/record）同步更新，记录只追加不覆盖。"
---

# Rules Enforcer（规则强制执行）

## 目标

把以下规则变成“每次任务必经流程”，避免做完事但文档/记录缺失：

1. 对齐项目文档与代码（programDoc）
2. 追加记录到 05_recordAiOperate（只追加，不覆盖不删除；只追加，不覆盖不删除；只追加，不覆盖不删除！！！）
3. 不主动提交 git
4. 无上下文先看 programDoc 再规划
5. 命令/改动先解释再执行（目的 + 为什么这么做）
6. 每次任务必须同步这 3 份主文档：
   - `programDoc/project-progress-tracker-zh.md`
   - `programDoc/project-summary-zh.md`
   - `programDoc/ts-unified-governance-migration-plan-zh.md`

## 什么时候调用

1. 任何编码、排障、配置修改、执行命令之前
2. 任务完成准备交付之前（用于复核：文档是否已对齐、记录是否已追加）

## 执行流程（对话内的硬性检查点）

1. 开始任务前：
   1) 打开 `.trae/rules/project_rules.md`，确认本次任务必须遵守的条款
   2) 打开 `programDoc/` 下固定必读文档：
      - `project-progress-tracker-zh.md`
      - `project-summary-zh.md`
      - `ts-unified-governance-migration-plan-zh.md`
      - `05_recordAiOperate.md`
   3) 若任务无上下文，先阅读 `programDoc` 再对照代码做规划与实施
2. 实施过程中：
   1) 所有“要执行的命令”与“要改代码的动作”，先给出中文解释（目的 + 为什么这么做）
   2) 不进行任何 git commit（除非用户明确要求）
3. 任务结束前：
   1) 对齐并更新以下固定文档（按本次改动范围更新）：
      - `programDoc/project-progress-tracker-zh.md`
      - `programDoc/project-summary-zh.md`
      - `programDoc/ts-unified-governance-migration-plan-zh.md`
   2) 把本次新增/修复内容追加写到 `programDoc/05_recordAiOperate.md` 文件末尾，注明时间，不覆盖不删除

## 可选：快速自检脚本

该脚本只做“存在性/提示性检查”，不修改任何文件：

```bash
python3 /home/ubutnu/code/AI4LocalKnowledgeBase/.trae/skills/rules-enforcer/check_rules.py
```
