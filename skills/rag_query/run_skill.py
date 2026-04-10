#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from typing import Any

import requests


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run governed RAG query skill")
    parser.add_argument("--query", required=True, help="Question for RAG")
    parser.add_argument("--base-url", default="http://127.0.0.1:8091", help="brain-server base URL")
    parser.add_argument("--dataset-id", help="Optional dataset permission scope")
    parser.add_argument("--chat-id", help="Optional ragflow chat id")
    parser.add_argument("--top-k", type=int, help="Optional retrieval topK")
    parser.add_argument("--access-token", help="Optional direct access token")
    parser.add_argument("--username", default="admin", help="Login username if access-token not provided")
    parser.add_argument("--password", default="admin123456", help="Login password if access-token not provided")
    return parser.parse_args()


def login(base_url: str, username: str, password: str) -> str:
    resp = requests.post(
        f"{base_url.rstrip('/')}/api/v1/auth/login",
        json={"username": username, "password": password},
        timeout=20,
    )
    resp.raise_for_status()
    token = resp.json().get("accessToken")
    if not token:
        raise RuntimeError("login succeeded but no accessToken in response")
    return token


def run_query(base_url: str, token: str, payload: dict[str, Any]) -> dict[str, Any]:
    resp = requests.post(
        f"{base_url.rstrip('/')}/api/v1/rag/query",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json=payload,
        timeout=120,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"rag query failed: {resp.status_code} {resp.text[:500]}")
    return resp.json()


def main() -> int:
    args = parse_args()
    token = args.access_token or login(args.base_url, args.username, args.password)
    payload: dict[str, Any] = {"query": args.query}
    if args.dataset_id:
        payload["datasetId"] = args.dataset_id
    if args.chat_id:
        payload["chatId"] = args.chat_id
    if args.top_k:
        payload["topK"] = args.top_k

    result = run_query(args.base_url, token, payload)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(2)
