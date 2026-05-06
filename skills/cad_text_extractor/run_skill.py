#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run CAD text extractor batch mode")
    parser.add_argument("input_root_positional", nargs="?", help="输入目录（递归扫描 .dxf）")
    parser.add_argument("output_root_positional", nargs="?", help="输出目录")
    parser.add_argument("checker_positional", nargs="?", help="校核人")
    parser.add_argument("reviewer_positional", nargs="?", help="审核人")
    parser.add_argument("--input-root", help="输入目录（递归扫描 .dxf）")
    parser.add_argument("--output-root", help="输出目录")
    parser.add_argument("--checker", default="张三", help="校核人")
    parser.add_argument("--reviewer", default="李四", help="审核人")
    return parser.parse_args()


def resolve_value(primary: str | None, fallback: str | None, required: bool = False) -> str:
    value = (primary or fallback or "").strip()
    if required and not value:
        raise RuntimeError("required argument missing")
    return value


def collect_outputs(output_root: str, run_start_time: float | None = None) -> list[dict[str, str]]:
    """Collect output files with absolute paths for download links.

    Only returns files created or modified during this run (identified by run_start_time).
    This prevents returning files from previous runs stored in the same output directory.
    """
    import time
    root = Path(output_root)

    # If no run_start_time provided, fall back to collecting all files (legacy behavior)
    if run_start_time is None:
        files = sorted([p for p in root.rglob("*") if p.is_file()])
        return [{"file_name": p.name, "file_path": str(p)} for p in files]

    # Only collect files created at or after run_start_time (exact cutoff)
    cutoff = run_start_time
    files = sorted(
        p for p in root.rglob("*")
        if p.is_file() and p.stat().st_mtime >= cutoff
    )
    return [{"file_name": p.name, "file_path": str(p)} for p in files]


def _write_structured_result(data: dict[str, object]) -> None:
    """把结构化 JSON 写入临时文件，路径通过环境变量传递给 SkillTool."""
    path = os.environ.get("SKILL_STRUCTURED_RESULT_PATH")
    if path:
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"WARNING: failed to write structured result: {e}", file=sys.stderr)


def main() -> int:
    args = parse_args()
    input_root = resolve_value(args.input_root, args.input_root_positional, required=True)
    
    # Use the output_root passed as argument (from brain-server)
    # brain-server already creates a job-specific directory
    output_root = resolve_value(args.output_root, args.output_root_positional)
    
    # Fallback to env var only if no argument provided
    if not output_root:
        output_root = os.environ.get('SKILL_OUTPUT_BASE_DIR', '/tmp/brain-skill-files/outputs')
    
    checker = resolve_value(args.checker_positional, args.checker)
    reviewer = resolve_value(args.reviewer_positional, args.reviewer)

    if not os.path.isdir(input_root):
        print(f"input_root not found: {input_root}", file=sys.stderr)
        return 2

    # Use a unique output directory per run to avoid mixing with previous runs
    # Generate a job-specific subdirectory to isolate each execution
    import time as _time
    import uuid as _uuid
    run_start_time = _time.time()
    job_id = f"job-{_uuid.uuid4().hex[:8]}"
    output_root = os.path.join(output_root, job_id)
    os.makedirs(output_root, exist_ok=True)

    from cad_text_extractor import run_batch

    run_batch(input_root, output_root, checker, reviewer)

    # Collect output files with absolute paths (only files created during this run)
    output_files = collect_outputs(output_root, run_start_time)

    # Build structured result (写入临时文件，供 SkillTool 读取)
    # Include answer field so brainService uses Python script output (not LLM hallucination)
    structured = {
        "ok": True,
        "skill": "indicator-verification",
        "inputRoot": input_root,
        "outputRoot": output_root,
        "checker": checker,
        "reviewer": reviewer,
        "outputFileCount": len(output_files),
        "outputFiles": output_files,
    }

    # Read all content JSONs to extract answer data (aggregate across all input files)
    import glob as _glob
    json_files = _glob.glob(os.path.join(output_root, "*_content.json"))
    if json_files:
        try:
            total_boxes = 0
            total_texts = 0
            total_polylines = 0
            file_details = []
            for jf in sorted(json_files):
                with open(jf, "r", encoding="utf-8") as f:
                    content_data = json.load(f)
                boxes = content_data.get("boxes", [])
                texts = sum(len(b.get("texts", [])) for b in boxes)
                polylines = sum(len(b.get("polylines", [])) for b in boxes)
                total_boxes += len(boxes)
                total_texts += texts
                total_polylines += polylines
                # Derive the input file name from the JSON file name
                import_name = os.path.splitext(os.path.basename(jf))[0].replace("_content", "")
                file_details.append({"name": import_name, "boxes": len(boxes), "texts": texts, "polylines": polylines})
            
            if len(file_details) == 1:
                structured["answer"] = (
                    f"CAD 指标校核完成。\n"
                    f"- 检测到 {total_boxes} 个打印框\n"
                    f"- 提取了 {total_texts} 条文本\n"
                    f"- 提取了 {total_polylines} 个多段线\n"
                    f"- 生成了 {len(output_files)} 个文件\n"
                )
            else:
                detail_lines = "\n".join(
                    f"  - {d['name']}: {d['boxes']} 个打印框, {d['texts']} 条文本, {d['polylines']} 个多段线"
                    for d in file_details
                )
                structured["answer"] = (
                    f"CAD 指标校核完成（共处理 {len(file_details)} 个文件）。\n"
                    f"- 检测到 {total_boxes} 个打印框\n"
                    f"- 提取了 {total_texts} 条文本\n"
                    f"- 提取了 {total_polylines} 个多段线\n"
                    f"- 生成了 {len(output_files)} 个文件\n"
                    f"\n各文件详情:\n{detail_lines}\n"
                )
        except Exception as e:
            print(f"WARNING: failed to aggregate JSON stats: {e}", file=sys.stderr)
            pass

    _write_structured_result(structured)

    # stdout 输出摘要（供模型 / LLM 使用）
    answer_text = structured.get("answer", f"CAD 指标校核完成。共生成 {len(output_files)} 个文件，已保存至 {output_root}。")
    print(answer_text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
