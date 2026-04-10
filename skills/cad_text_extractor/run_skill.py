#!/usr/bin/env python3
"""
CAD 文本提取技能运行入口。
用途：将 cad_text_extractor 的批处理能力封装为稳定命令行入口，便于技能系统调用。
"""

from __future__ import annotations

import argparse
import os
import sys


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run CAD text extractor batch mode")
    parser.add_argument("input_root", help="输入目录（递归扫描 .dxf）")
    parser.add_argument("output_root", help="输出目录")
    parser.add_argument("checker", nargs="?", default="张三", help="校核人")
    parser.add_argument("reviewer", nargs="?", default="李四", help="审核人")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not os.path.isdir(args.input_root):
        print(f"input_root not found: {args.input_root}", file=sys.stderr)
        return 2
    os.makedirs(args.output_root, exist_ok=True)

    # 延迟导入，避免仅查看参数时触发重依赖加载。
    from cad_text_extractor import run_batch

    run_batch(args.input_root, args.output_root, args.checker, args.reviewer)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
