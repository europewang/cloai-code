# 资源卡片左上角移出按钮悬浮显示修复

- 日期：2026-05-15
- 类型：前端交互优化
- 范围：
  - `frontend/src/App.jsx`
  - `frontend/src/pages/knowledge/KnowledgePage.jsx`

## 需求

知识库、技能库、数据库、模型库中的内容卡片，左上角的 `×` 按钮不要持久显示，而是在鼠标悬浮到卡片上时才显示，并与右上角操作区的显示逻辑保持一致。

## 根因

- 知识库页与 `App.jsx` 内共享分组区块中的“移出分组”按钮使用了绝对定位
- 按钮始终可见，没有使用 `group-hover` 控制显示
- 因此在卡片静止状态下，左上角 `×` 会长期占位并影响视觉整洁度

## 修复

### 1. 统一卡片 hover 容器

- 为卡片外层包装节点补充 `group` 类

### 2. 左上角移出按钮改为悬浮显示

- 按钮默认 `opacity-0`
- 悬浮卡片时通过 `group-hover:opacity-100` 显示
- 为键盘操作保留 `focus:opacity-100`

## 影响范围

- 知识库页中的分组卡片
- 技能库中的分组卡片
- 数据库中的分组卡片
- 模型库中的分组卡片

## 验证

### 诊断

- `frontend/src/pages/knowledge/KnowledgePage.jsx` 无错误
- `frontend/src/App.jsx` 无新增错误，仅有原有 Hint

### 构建

```bash
cd frontend
npm run build
```

构建通过。
