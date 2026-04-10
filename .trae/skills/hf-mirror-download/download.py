import argparse
import json
import os
from typing import List, Optional

DEFAULT_HF_ENDPOINT = "https://hf-mirror.com"

os.environ.setdefault("HF_ENDPOINT", DEFAULT_HF_ENDPOINT)
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
os.environ.setdefault("HF_HUB_DOWNLOAD_TIMEOUT", "60")

from huggingface_hub import snapshot_download


def download(repo_id: str, download_dir: str, allow_patterns: Optional[List[str]] = None, ignore_patterns: Optional[List[str]] = None) -> str:
    if not os.path.exists(download_dir):
        os.makedirs(download_dir, exist_ok=True)

    file_path = snapshot_download(
        repo_id=repo_id,
        local_dir=download_dir,
        local_dir_use_symlinks=False,
        resume_download=True,
        allow_patterns=allow_patterns,
        ignore_patterns=ignore_patterns,
    )
    return file_path


def get_param(model_name: str, config_path: str) -> dict:
    with open(config_path, "r", encoding="utf-8") as f:
        model_dict = json.load(f)
    if model_name not in model_dict:
        raise KeyError(f"未在配置文件中找到 {model_name}，可选项: {list(model_dict.keys())}")
    return model_dict[model_name]


def _parse_allow_patterns(raw: Optional[str]) -> Optional[List[str]]:
    if raw is None:
        return None
    raw = raw.strip()
    if not raw:
        return None
    return [p.strip() for p in raw.split(",") if p.strip()]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config-path", default=os.path.join(os.path.dirname(__file__), "download_config.json"))
    parser.add_argument("--config-name", default=None)
    parser.add_argument("--repo-id", default=None)
    parser.add_argument("--download-dir", default=None)
    parser.add_argument("--allow-patterns", default=None)
    args = parser.parse_args()

    if args.config_name:
        params = get_param(args.config_name, args.config_path)
        repo_id = params["repo_id"]
        download_dir = params["download_dir"]
        allow_patterns = params.get("allow_patterns")
        ignore_patterns = params.get("ignore_patterns")
    else:
        if not args.repo_id or not args.download_dir:
            raise SystemExit("需要提供 --repo-id 与 --download-dir，或提供 --config-name。")
        repo_id = args.repo_id
        download_dir = args.download_dir
        allow_patterns = _parse_allow_patterns(args.allow_patterns)
        ignore_patterns = None  # CLI 暂不通过参数支持 ignore_patterns，如需支持可扩展

    print(f"HF_ENDPOINT={os.environ.get('HF_ENDPOINT')}")
    print(f"HF_HUB_DISABLE_XET={os.environ.get('HF_HUB_DISABLE_XET')}")
    print(f"HF_HUB_DOWNLOAD_TIMEOUT={os.environ.get('HF_HUB_DOWNLOAD_TIMEOUT')}")
    print(f"repo_id={repo_id}")
    print(f"download_dir={download_dir}")
    if allow_patterns is not None:
        print(f"allow_patterns={allow_patterns}")
    if ignore_patterns is not None:
        print(f"ignore_patterns={ignore_patterns}")

    path = download(repo_id=repo_id, download_dir=download_dir, allow_patterns=allow_patterns, ignore_patterns=ignore_patterns)
    print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
