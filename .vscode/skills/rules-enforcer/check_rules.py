from __future__ import annotations

from datetime import datetime
from pathlib import Path


ROOT = Path("/home/ubutnu/code/AI4LocalKnowledgeBase")


def _exists(path: Path) -> str:
    return "存在" if path.exists() else "缺失"


def _tail_contains(path: Path, needle: str, tail_lines: int = 120) -> bool:
    if not path.exists():
        return False
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except UnicodeDecodeError:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    tail = "\n".join(lines[-tail_lines:])
    return needle in tail


def main() -> int:
    rules_path = ROOT / ".trae" / "rules" / "project_rules.md"
    program_doc_dir = ROOT / "programDoc"
    record_path = program_doc_dir / "05_recordAiOperate.md"
    exp_path = program_doc_dir / "00_AI_Experience.md"

    print("== Rules Enforcer 自检（提示性，不修改文件）==")
    print(f"- 项目根目录：{ROOT}")
    print(f"- 规则文件：{rules_path}（{_exists(rules_path)}）")
    print(f"- programDoc：{program_doc_dir}（{_exists(program_doc_dir)}）")
    print(f"- 过程记录：{record_path}（{_exists(record_path)}）")
    print(f"- 经验总结：{exp_path}（{_exists(exp_path)}）")

    today = datetime.now().strftime("%Y-%m-%d")
    if record_path.exists():
        has_today = _tail_contains(record_path, today)
        print(f"- 05_recordAiOperate 末尾是否包含今日日期 {today}：{'是' if has_today else '否（如本次有操作请追加记录）'}")

    if rules_path.exists():
        has_skill_ref = _tail_contains(rules_path, "rules-enforcer", tail_lines=50)
        print(f"- project_rules 是否已引用 rules-enforcer：{'是' if has_skill_ref else '否（请检查规则条款 3-6 是否已替换）'}")

    print("== 建议执行顺序 ==")
    print("1) 开始任务前：阅读 programDoc 相关文档并对照代码规划")
    print("2) 结束任务前：更新 programDoc 相关文档，追加写入 05_recordAiOperate（只追加）")
    print("3) 全程：不主动提交 git")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

