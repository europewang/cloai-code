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


def collect_outputs(output_root: str) -> dict[str, object]:
    root = Path(output_root)
    files = [p for p in root.rglob("*") if p.is_file()]
    rels = [str(p.relative_to(root)) for p in files]
    return {
        "outputFileCount": len(files),
        "jsonCount": sum(1 for p in files if p.suffix.lower() == ".json"),
        "dxfCount": sum(1 for p in files if p.suffix.lower() == ".dxf"),
        "excelCount": sum(1 for p in files if p.suffix.lower() in {".xls", ".xlsx"}),
        "outputFiles": rels,
    }


def main() -> int:
    args = parse_args()
    input_root = resolve_value(args.input_root, args.input_root_positional, required=True)
    output_root = resolve_value(args.output_root, args.output_root_positional, required=True)
    checker = resolve_value(args.checker_positional, args.checker)
    reviewer = resolve_value(args.reviewer_positional, args.reviewer)

    if not os.path.isdir(input_root):
        print(f"input_root not found: {input_root}", file=sys.stderr)
        return 2
    os.makedirs(output_root, exist_ok=True)

    from cad_text_extractor import run_batch

    run_batch(input_root, output_root, checker, reviewer)
    output = {
        "ok": True,
        "skill": "indicator-verification",
        "inputRoot": input_root,
        "outputRoot": output_root,
        "checker": checker,
        "reviewer": reviewer,
    }
    output.update(collect_outputs(output_root))
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
