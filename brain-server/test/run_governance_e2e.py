#!/usr/bin/env python3
"""
统一治理功能端到端回归脚本。

说明：
- 该脚本在 Docker 服务启动后执行；
- 覆盖鉴权、权限管理、上下文返回、审计查询等核心能力；
- 与文件治理相关的接口由现有脚本 `ops:smoke-admin-file-status` 单独覆盖。
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


BASE_URL = os.getenv("BRAIN_BASE_URL", "http://127.0.0.1:8091")
ADMIN_USERNAME = os.getenv("BRAIN_ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("BRAIN_ADMIN_PASSWORD", "admin123456")


class TestFailure(Exception):
    """统一抛错类型，便于在主流程里捕获并输出。"""


def http_json(path: str, method: str = "GET", token: str | None = None, body: dict | None = None):
    """发起 JSON 请求并返回 (status_code, payload_dict)。"""
    headers = {"Content-Type": "application/json"}
    if token:
      headers["Authorization"] = f"Bearer {token}"

    data = None
    if body is not None:
      data = json.dumps(body).encode("utf-8")

    req = urllib.request.Request(
      url=f"{BASE_URL}{path}",
      data=data,
      headers=headers,
      method=method,
    )

    try:
      with urllib.request.urlopen(req, timeout=20) as resp:
        raw = resp.read().decode("utf-8")
        payload = json.loads(raw) if raw else {}
        return resp.getcode(), payload
    except urllib.error.HTTPError as e:
      raw = e.read().decode("utf-8")
      try:
        payload = json.loads(raw) if raw else {}
      except Exception:
        payload = {"raw": raw}
      return e.code, payload


def ensure(status: bool, message: str):
    """断言辅助函数。"""
    if not status:
      raise TestFailure(message)


def wait_ready():
    """等待服务 ready，避免容器刚启动时出现偶发失败。"""
    for _ in range(20):
      code, payload = http_json("/api/ready")
      if code == 200 and payload.get("status") == "ok":
        return
      time.sleep(1)
    raise TestFailure("服务未就绪：/api/ready 未在预期时间内返回 ok")


def main():
    report = {
      "ok": False,
      "baseUrl": BASE_URL,
      "checks": {},
      "artifacts": {},
    }

    try:
      # 1) 就绪检查
      wait_ready()
      report["checks"]["ready"] = 200

      # 2) 登录 + 刷新 + me
      code, login = http_json(
        "/api/v1/auth/login",
        method="POST",
        body={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD},
      )
      report["checks"]["auth_login"] = code
      ensure(code == 200 and "accessToken" in login and "refreshToken" in login, "登录失败")
      access_token = login["accessToken"]
      refresh_token = login["refreshToken"]

      code, refreshed = http_json(
        "/api/v1/auth/refresh",
        method="POST",
        body={"refreshToken": refresh_token},
      )
      report["checks"]["auth_refresh"] = code
      ensure(code == 200 and "accessToken" in refreshed, "refresh 失败")

      code, me = http_json("/api/v1/auth/me", method="GET", token=access_token)
      report["checks"]["auth_me"] = code
      ensure(code == 200 and me.get("username") == ADMIN_USERNAME, "me 接口失败")
      user_id = int(me["id"])
      code, ctx_before = http_json("/api/v1/brain/context", method="GET", token=access_token)
      report["checks"]["brain_context_before_mutation"] = code
      ensure(code == 200, "brain/context 初始查询失败")
      policy_before = str(ctx_before.get("policyVersion", ""))
      ensure(policy_before != "", "policyVersion 缺失")

      # 3) 四类权限授予/撤销 + context 联动验证
      dataset_id = "e2e-dataset-001"
      dataset_owner_id = "e2e-dataset-owner-001"
      skill_id = "e2e-skill-001"
      profile_id = me["profileId"]

      mutate_cases = [
        {
          "name": "perm_dataset",
          "path": "/api/v1/admin/permissions/datasets",
          "body": {"userId": user_id, "action": "grant", "datasetIds": [dataset_id]},
        },
        {
          "name": "perm_dataset_owner",
          "path": "/api/v1/admin/permissions/dataset-owners",
          "body": {"userId": user_id, "action": "grant", "datasetIds": [dataset_owner_id]},
        },
        {
          "name": "perm_skill",
          "path": "/api/v1/admin/permissions/skills",
          "body": {"userId": user_id, "action": "grant", "skillIds": [skill_id]},
        },
        {
          "name": "perm_memory_profile",
          "path": "/api/v1/admin/permissions/memory-profiles",
          "body": {"userId": user_id, "action": "grant", "profileIds": [profile_id]},
        },
      ]

      for case in mutate_cases:
        code, payload = http_json(case["path"], method="POST", token=access_token, body=case["body"])
        report["checks"][case["name"]] = code
        ensure(code == 200 and payload.get("success") is True, f"{case['name']} grant 失败")

      code, ctx = http_json("/api/v1/brain/context", method="GET", token=access_token)
      report["checks"]["brain_context_after_grant"] = code
      ensure(code == 200, "brain/context grant 后查询失败")
      policy_after_grant = str(ctx.get("policyVersion", ""))
      ensure(policy_after_grant != "", "grant 后 policyVersion 缺失")
      ensure(policy_after_grant != policy_before, "grant 后 policyVersion 未变化")
      ensure(dataset_id in ctx.get("allowedDatasets", []), "allowedDatasets 未命中 grant 项")
      ensure(dataset_owner_id in ctx.get("allowedDatasetOwners", []), "allowedDatasetOwners 未命中 grant 项")
      ensure(skill_id in ctx.get("allowedSkills", []), "allowedSkills 未命中 grant 项")
      ensure(profile_id in ctx.get("allowedMemoryProfiles", []), "allowedMemoryProfiles 未命中预期项")

      revoke_cases = [
        {
          "name": "perm_dataset_revoke",
          "path": "/api/v1/admin/permissions/datasets",
          "body": {"userId": user_id, "action": "revoke", "datasetIds": [dataset_id]},
        },
        {
          "name": "perm_dataset_owner_revoke",
          "path": "/api/v1/admin/permissions/dataset-owners",
          "body": {"userId": user_id, "action": "revoke", "datasetIds": [dataset_owner_id]},
        },
        {
          "name": "perm_skill_revoke",
          "path": "/api/v1/admin/permissions/skills",
          "body": {"userId": user_id, "action": "revoke", "skillIds": [skill_id]},
        },
      ]
      for case in revoke_cases:
        code, payload = http_json(case["path"], method="POST", token=access_token, body=case["body"])
        report["checks"][case["name"]] = code
        ensure(code == 200 and payload.get("success") is True, f"{case['name']} revoke 失败")

      code, ctx2 = http_json("/api/v1/brain/context", method="GET", token=access_token)
      report["checks"]["brain_context_after_revoke"] = code
      ensure(code == 200, "brain/context revoke 后查询失败")
      policy_after_revoke = str(ctx2.get("policyVersion", ""))
      ensure(policy_after_revoke != "", "revoke 后 policyVersion 缺失")
      ensure(policy_after_revoke != policy_after_grant, "revoke 后 policyVersion 未变化")
      ensure(dataset_id not in ctx2.get("allowedDatasets", []), "allowedDatasets revoke 后仍命中")
      ensure(dataset_owner_id not in ctx2.get("allowedDatasetOwners", []), "allowedDatasetOwners revoke 后仍命中")
      ensure(skill_id not in ctx2.get("allowedSkills", []), "allowedSkills revoke 后仍命中")

      # 4) 审计查询（确认权限动作已经落库）
      code, audits = http_json(
        f"/api/v1/admin/audits?{urllib.parse.urlencode({'action': 'admin.permissions.dataset_owners', 'page': 1, 'pageSize': 5})}",
        method="GET",
        token=access_token,
      )
      report["checks"]["audits_query_dataset_owner"] = code
      ensure(code == 200 and isinstance(audits.get("items"), list), "审计查询失败")

      # 5) 触发细分审计（故意传非法 body，走 fail 路径）
      code, _ = http_json("/api/v1/rag/query", method="POST", token=access_token, body={"bad": "x"})
      report["checks"]["rag_query_invalid_for_audit"] = code
      ensure(code == 400, "rag/query 非法请求返回码异常")

      code, _ = http_json(
        "/api/v1/skills/indicator-verification/run",
        method="POST",
        token=access_token,
        body={"bad": "x"},
      )
      report["checks"]["tool_call_invalid_for_audit"] = code
      ensure(code == 400, "indicator-verification 非法请求返回码异常")

      # 6) 查询细分审计接口
      code, skill_audits = http_json(
        f"/api/v1/admin/audits/skills?{urllib.parse.urlencode({'toolName': 'indicator-verification', 'page': 1, 'pageSize': 10})}",
        method="GET",
        token=access_token,
      )
      report["checks"]["audits_query_skills"] = code
      ensure(code == 200 and isinstance(skill_audits.get("items"), list), "skills 审计查询失败")
      ensure(len(skill_audits.get("items", [])) > 0, "skills 审计无数据")

      code, rag_audits = http_json(
        f"/api/v1/admin/audits/rag?{urllib.parse.urlencode({'result': 'fail', 'page': 1, 'pageSize': 10})}",
        method="GET",
        token=access_token,
      )
      report["checks"]["audits_query_rag"] = code
      ensure(code == 200 and isinstance(rag_audits.get("items"), list), "rag 审计查询失败")
      ensure(len(rag_audits.get("items", [])) > 0, "rag 审计无数据")

      report["artifacts"] = {
        "userId": user_id,
        "profileId": profile_id,
      }
      report["ok"] = True
      print(json.dumps(report, ensure_ascii=False, indent=2))
      return 0
    except Exception as e:
      report["ok"] = False
      report["error"] = str(e)
      print(json.dumps(report, ensure_ascii=False, indent=2))
      return 1


if __name__ == "__main__":
    sys.exit(main())
