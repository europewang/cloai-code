from __future__ import annotations

import argparse
from datetime import datetime
from pathlib import Path


ROOT = Path("/home/ubutnu/code/AI4LocalKnowledgeBase")
EXPERIENCE_PATH = ROOT / "programDoc" / "00_AI_Experience.md"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--title", required=True)
    parser.add_argument("--body-file", required=True)
    args = parser.parse_args()

    body_path = Path(args.body_file)
    body = body_path.read_text(encoding="utf-8")
    title = args.title.strip()
    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    block = "\n".join(
        [
            "",
            f"## {title}",
            "",
            f"写入时间：{now}",
            "",
            body.rstrip(),
            "",
        ]
    )

    EXPERIENCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    EXPERIENCE_PATH.write_text(
        EXPERIENCE_PATH.read_text(encoding="utf-8") + block if EXPERIENCE_PATH.exists() else block.lstrip(),
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

