#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any

import requests

# 全局变量：结构化结果，供 get_structured_result() 调用
_structured_result: dict[str, Any] = {}


def _write_rag_token(delta: str) -> None:
    """把 RAG 流式 token 写入临时文件，供 brainService 实时读取并转发给前端."""
    path = os.environ.get("RAG_STREAM_TOKENS_PATH")
    if path:
        try:
            with open(path, "a", encoding="utf-8") as f:
                f.write(json.dumps({"type": "token", "delta": delta}, ensure_ascii=False) + "\n")
        except Exception:
            pass  # 非关键路径，失败不中断执行


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run governed RAG query skill")
    parser.add_argument("--query", help="Question for RAG")
    parser.add_argument("query_positional", nargs="?", help="Question for RAG (positional fallback)")
    parser.add_argument(
        "--base-url",
        default=os.environ.get("BRAIN_SERVER_BASE_URL", "http://127.0.0.1:8091"),
        help="brain-server base URL",
    )
    parser.add_argument("--dataset-id", help="Optional dataset permission scope")
    parser.add_argument("--chat-id", help="Optional ragflow chat id")
    parser.add_argument("--skill-id", help="Skill id for post authorization")
    parser.add_argument("--top-k", type=int, help="Optional retrieval topK")
    parser.add_argument(
        "--access-token",
        default=os.environ.get("BRAIN_SERVER_ACCESS_TOKEN"),
        help="Optional direct access token",
    )
    parser.add_argument(
        "--username",
        default=os.environ.get("BRAIN_SERVER_USERNAME", "admin"),
        help="Login username if access-token not provided",
    )
    parser.add_argument(
        "--password",
        default=os.environ.get("BRAIN_SERVER_PASSWORD", "admin123456"),
        help="Login password if access-token not provided",
    )
    parser.add_argument(
        "--allow-upstream-error",
        action="store_true",
        help="Do not fail when upstream model returns **ERROR** in assistant content",
    )
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


def parse_sse_response(text: str) -> dict[str, Any]:
    """
    Parse SSE (Server-Sent Events) response from RagFlow API.
    The response format is: data:{json}\n\ndata:{json}\n\n
    Returns the parsed JSON from the first data: line.
    """
    lines = text.strip().split('\n')
    for line in lines:
        if line.startswith('data:'):
            json_str = line[5:].strip()
            try:
                return json.loads(json_str)
            except json.JSONDecodeError:
                continue
    raise RuntimeError(f"Failed to parse SSE response: {text[:200]}")


def run_query(base_url: str, token: str, payload: dict[str, Any]) -> dict[str, Any]:
    resp = requests.post(
        f"{base_url.rstrip('/')}/api/v1/rag/query",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json=payload,
        timeout=120,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"rag query failed: {resp.status_code} {resp.text[:500]}")

    # The /api/v1/rag/query returns JSON with 'data' field containing SSE text
    result = resp.json()

    # If 'data' field is a string starting with 'data:', parse it as SSE
    data_field = result.get("data", "")
    if isinstance(data_field, str) and data_field.startswith("data:"):
        sse_data = parse_sse_response(data_field)
        # Update result with parsed SSE data
        result["data"] = sse_data

    return result


def run_query_streaming(base_url: str, token: str, payload: dict[str, Any]) -> dict[str, Any]:
    """
    流式执行 RAG 查询，实时写入 tokens 到临时文件。
    同时收集完整结果供返回。
    """
    # 首先尝试流式端点
    stream_url = f"{base_url.rstrip('/')}/api/v1/rag/query/stream"
    
    try:
        resp = requests.post(
            stream_url,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Accept": "text/event-stream",
            },
            json=payload,
            timeout=120,
            stream=True,
        )
        
        if resp.status_code >= 400:
            raise RuntimeError(f"Stream request failed: {resp.status_code}")
        
        full_answer = ""
        references = []
        trace_id = None
        chat_id = None
        
        for line in resp.iter_lines(decode_unicode=True):
            if not line:
                continue
            if line.startswith("data:"):
                json_str = line[5:].strip()
                try:
                    data = json.loads(json_str)
                    # 提取 delta（流式 token）
                    delta = None
                    if isinstance(data, dict):
                        # RagFlow 流式格式
                        choices = data.get("choices", [])
                        if choices:
                            delta = choices[0].get("delta", {}).get("content")
                            msg = choices[0].get("message", {})
                            refs = msg.get("reference")
                            if refs and not references:
                                references = refs
                            trace_id = data.get("traceId") or trace_id
                            chat_id = data.get("chatId") or chat_id
                        # 或者更简单的格式
                        elif "delta" in data:
                            delta = data.get("delta")
                        elif "content" in data:
                            delta = data.get("content")
                    
                    if delta:
                        full_answer += delta
                        _write_rag_token(delta)
                        
                except json.JSONDecodeError:
                    continue
            elif line.startswith("traceId:"):
                trace_id = line[8:].strip()
            elif line.startswith("chatId:"):
                chat_id = line[7:].strip()
        
        return {
            "traceId": trace_id,
            "chatId": chat_id,
            "data": {
                "choices": [{
                    "message": {
                        "content": full_answer,
                        "reference": references,
                    }
                }]
            }
        }
        
    except Exception as e:
        # 流式失败，回退到普通查询
        print(f"Streaming failed, falling back to blocking: {e}", file=sys.stderr)
        result = run_query(base_url, token, payload)
        content, refs = extract_result(result)
        # 写入所有 content 作为单个 token
        if content:
            _write_rag_token(content)
        return result


def extract_result(result: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
    """
    Extract content and references from RagFlow API response.

    The response structure from /api/v1/rag/query is:
    {
        "traceId": "...",
        "chatId": "...",
        "data": {
            "choices": [{
                "message": {
                    "content": "...",  // May be empty
                    "reference": [...]   // Contains retrieval results
                }
            }]
        }
    }
    """
    data = result.get("data") or {}

    # Handle nested SSE parsed structure
    if isinstance(data, dict):
        choices = data.get("choices") or []
        if not choices:
            # Try to get answer from reference if choices is empty
            inner_data = data.get("data", {})
            if isinstance(inner_data, dict):
                refs = inner_data.get("reference") or []
                answer = inner_data.get("answer", "")
                if answer:
                    return str(answer), refs if isinstance(refs, list) else []
            return "", []
        msg = (choices[0] or {}).get("message") or {}
        content = str(msg.get("content") or "") or ""
        refs = msg.get("reference") or []

        # If content is empty but we have references, generate answer from references
        if not content and refs and isinstance(refs, list) and len(refs) > 0:
            content = "以下是检索到的相关内容：\n\n"
            for i, ref in enumerate(refs[:3], 1):  # Limit to first 3 references
                doc_name = ref.get("document_name", "未知文档")
                ref_content = ref.get("content", "")
                if ref_content:
                    content += f"[{i}] {doc_name}:\n{ref_content[:200]}...\n\n"

        if not isinstance(refs, list):
            refs = []
        return content, refs

    return "", []


def main() -> int:
    args = parse_args()
    query = (args.query or args.query_positional or "").strip()
    if not query:
        raise RuntimeError("query is required")
    token = args.access_token or login(args.base_url, args.username, args.password)
    payload: dict[str, Any] = {"query": query}
    if args.dataset_id:
        payload["datasetId"] = args.dataset_id
    if args.chat_id:
        payload["chatId"] = args.chat_id
    if args.top_k:
        payload["topK"] = args.top_k
    if args.skill_id:
        payload["skillId"] = args.skill_id

    # 使用非流式查询获取完整引用（更稳定）
    result = run_query(args.base_url, token, payload)
    content, refs = extract_result(result)

    # Build structured result (保留完整元数据)
    global _structured_result
    _structured_result = {
        "ok": True,
        "skill": "rag-query",
        "traceId": result.get("traceId"),
        "chatId": result.get("chatId"),
        "answer": content,
        "referenceCount": len(refs),
        "references": refs,
        "raw": result,
    }

    # 写结构化结果到临时文件（供 SkillTool 读取）
    _write_structured_result(_structured_result)

    # stdout 输出 Markdown 格式（供模型消费）
    output_md = {
        "ok": True,
        "skill": "rag-query",
        "traceId": result.get("traceId"),
        "chatId": result.get("chatId"),
        # Markdown body：引用原文 + answer 总结
        "markdown": _build_markdown_output(content, refs),
    }
    print(json.dumps(output_md, ensure_ascii=False, indent=2))
    if content.startswith("**ERROR**") and not args.allow_upstream_error:
        return 3
    return 0


def _write_structured_result(data: dict[str, Any]) -> None:
    """把结构化 JSON 写入临时文件，路径通过环境变量传递给 SkillTool."""
    path = os.environ.get("SKILL_STRUCTURED_RESULT_PATH")
    print(f"DEBUG _write_structured_result: path={path}, answer length={len(data.get('answer', ''))}, refs={len(data.get('references', []))}", file=sys.stderr, flush=True)
    if path:
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f"DEBUG _write_structured_result: wrote to {path}", file=sys.stderr, flush=True)
        except Exception as e:
            print(f"DEBUG _write_structured_result: error writing: {e}", file=sys.stderr, flush=True)
            pass  # 非关键路径，失败不中断执行


def _build_markdown_output(answer: str, refs: list[dict[str, Any]]) -> str:
    """把 answer + references 组装成 Markdown 格式，供 src 大脑的模型直接使用."""
    lines = []
    lines.append("# RAG 查询结果\n")

    if answer:
        lines.append("## 摘要")
        lines.append(answer)
        lines.append("")

    if refs and isinstance(refs, list) and len(refs) > 0:
        lines.append("## 引用列表（共 {} 条）".format(len(refs)))
        lines.append("")
        for i, ref in enumerate(refs, 1):
            doc_name = ref.get("document_name") or ref.get("doc_name") or "未知文档"
            ref_id = ref.get("id") or ref.get("source_id") or f"ref-{i}"
            ref_content = ref.get("content") or ref.get("text") or ""
            # 图片/附件链接
            images = ref.get("images") or []
            image_links = ""
            if images:
                links = []
                for img in (images if isinstance(images, list) else []):
                    if isinstance(img, dict):
                        url = img.get("url") or img.get("src") or ""
                    else:
                        url = str(img)
                    if url:
                        links.append(url)
                if links:
                    image_links = "\n".join(
                        f"  - ![附件]({url})" for url in links
                    )

            # 原始链接（如有）
            source_url = ref.get("source") or ref.get("url") or ""

            lines.append(f"### [{i}] {doc_name}")
            if source_url:
                lines.append(f"**来源**: {source_url}")
            if ref_content:
                # 截取前 300 字符避免上下文过长
                snippet = ref_content[:300] + ("..." if len(ref_content) > 300 else "")
                lines.append("**摘录**:")
                lines.append("> " + snippet.replace("\n", "\n> "))
            if image_links:
                lines.append("**附件**:")
                lines.append(image_links)
            lines.append("")
    else:
        lines.append("*（无引用内容）*")

    return "\n".join(lines)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(2)
