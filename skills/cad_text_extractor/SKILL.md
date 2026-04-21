---
name: "indicator-verification"
description: "Performs CAD indicator verification from DXF and exports JSON/DXF/Excel. Invoke when user asks for 指标校核、面积校核、楼盘表提取."
context: fork
---

# 指标校核技能（CAD）

## 用途

将 DXF 图纸中的"打印图框"范围内文本、面积等信息提取并导出为，供指标校核/面积核验使用：

1. `*_content.json`
2. `*_area_result.dxf`
3. `*_面积计算表.xlsx`

## 何时调用

1. 用户要求从 DXF 批量提取面积数据。
2. 用户要求生成面积计算表或楼盘导入相关中间结果。
3. 需要对图框内文本进行结构化抽取并做后续审核。
4. 用户在会话中说"请使用指标校核技能"。
5. **用户上传了 DXF 文件进行面积校核**。

## 文件输入说明

当用户通过前端界面上传 DXF 文件时，这些文件会被保存到：
- 路径：`/shared/brain-skill-files/inputs/{toolCallId}/`

## 运行方式

```bash
python3 skills/cad_text_extractor/run_skill.py \
  --input-root /shared/brain-skill-files/inputs \
  --output-root /tmp/cad_output \
  --checker 张三 \
  --reviewer 李四
```

## 重要：输出文件信息

**你必须在回复中包含以下格式的结构化信息，以便前端能够生成下载链接：**

```
__OUTPUT_FILES__
[
  {"file_name": "A地块_content.json", "file_path": "/tmp/cad_output/A地块_content.json"},
  {"file_name": "A地块_area_result.dxf", "file_path": "/tmp/cad_output/A地块_area_result.dxf"},
  {"file_name": "A地块_面积计算表.xlsx", "file_path": "/tmp/cad_output/A地块_面积计算表.xlsx"}
]
__OUTPUT_FILES_END__
```

**要求：**
1. 执行完 Python 脚本后，必须列出生成的所有文件
2. 使用 `find /tmp/cad_output -type f` 列出实际生成的文件
3. 文件路径必须与实际路径完全一致（注意文件名中的空格）
4. 这个信息会被前端解析用于生成下载链接

## 产物约定

1. 每个 dxf 生成同名前缀结果文件。
2. 输出目录结构与输入目录结构保持一致。
3. 若单文件失败，不阻断其余文件处理。
4. 运行结束输出 JSON 汇总：`outputFileCount/jsonCount/dxfCount/excelCount/outputFiles`。

## 参数说明

1. `input_root`：包含 `.dxf` 文件的输入目录（支持递归）。
2. `output_root`：输出目录。
3. `checker`：校核人（可选，默认 `张三`）。
4. `reviewer`：审核人（可选，默认 `李四`）。
5. 支持"位置参数 + 命名参数"两种形式，命名参数优先。

## 执行示例

```bash
# 1. 执行 CAD 提取
python3 skills/cad_text_extractor/run_skill.py \
  --input-root /shared/brain-skill-files/inputs \
  --output-root /tmp/cad_output \
  --checker 张三 \
  --reviewer 李四

# 2. 列出输出文件
find /tmp/cad_output -type f

# 3. 在回复中包含 __OUTPUT_FILES__ 标记
```
