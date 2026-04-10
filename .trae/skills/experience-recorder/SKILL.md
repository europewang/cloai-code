---
name: "experience-recorder"
description: "将本次排障/开发过程总结为经验并追加到 00_AI_Experience.md。用户明确说“这段过程折磨我很久/写入经验”时调用。"
---

# Experience Recorder（经验总结写入）

## 目标

当用户明确要求“把这段过程总结成新的经验/写入经验”时，把经验条目追加写入：

- `programDoc/00_AI_Experience.md`

要求：

1. 只追加到文件末尾，不覆盖、不删除原有内容
2. 必须包含时间（精确到日期即可，必要时加时分）
3. 内容要可复用：现象、判断思路、关键命令/操作、最终解决方案、验收标准

## 什么时候调用

用户出现任一明确意图时：

1. “这段过程折磨我很久/花了很久才成功”
2. “帮我写入 00_AI_Experience.md / 经验总结”
3. “请把这次排障总结成经验”

## 输出结构（建议模板）

追加一个新小节到文档末尾，结构如下（可按场景增删）：

1. 标题：`## YYYY-MM-DD：<一句话概括>`
2. 典型现象（为什么难）
3. 核心判断思路（如何定位）
4. 关键动作与命令（只列关键且可复用）
5. 根因与解决方案（最终怎么解决）
6. 验收标准（如何确认真好了）

## 可选：辅助追加脚本

该脚本用于把“经验正文”以条目形式追加到文档末尾（只追加，不覆盖）：

```bash
python3 /home/ubutnu/code/AI4LocalKnowledgeBase/.trae/skills/experience-recorder/append_experience.py \
  --title "YYYY-MM-DD：一句话概括" \
  --body-file /tmp/experience.md
```

其中 `/tmp/experience.md` 为你准备好的正文内容（不包含标题行）。

