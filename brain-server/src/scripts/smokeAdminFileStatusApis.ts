type JsonObject = Record<string, unknown>

function getEnv(name: string, fallback: string) {
  return process.env[name] && String(process.env[name]).trim()
    ? String(process.env[name]).trim()
    : fallback
}

async function fetchJson(url: string, init?: RequestInit) {
  const resp = await fetch(url, init)
  const text = await resp.text()
  let body: unknown = text
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  return { resp, body }
}

async function fetchJsonWithRetry(url: string, init: RequestInit | undefined, attempts = 5, delayMs = 1500) {
  let lastError: unknown = null
  for (let i = 0; i < attempts; i += 1) {
    try {
      const result = await fetchJson(url, init)
      if (result.resp.status >= 500 && i < attempts - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs))
        continue
      }
      return result
    } catch (error) {
      lastError = error
      if (i < attempts - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs))
        continue
      }
      throw error
    }
  }
  throw lastError ?? new Error('request failed after retries')
}

async function main() {
  const baseUrl = getEnv('BRAIN_BASE_URL', 'http://127.0.0.1:8091')
  const username = getEnv('BRAIN_ADMIN_USERNAME', 'admin')
  const password = getEnv('BRAIN_ADMIN_PASSWORD', 'admin123456')

  // 1) 登录拿 token，后续复用同一个 token 做管理接口冒烟。
  const login = await fetchJsonWithRetry(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!login.resp.ok || typeof login.body !== 'object' || !login.body) {
    throw new Error(`login failed: ${login.resp.status}`)
  }
  const token = String((login.body as JsonObject).accessToken ?? '')
  if (!token) {
    throw new Error('login success but accessToken is empty')
  }
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }

  // 2) 查询 missing 资产列表。
  const list = await fetchJsonWithRetry(`${baseUrl}/api/v1/admin/files?status=missing&pageSize=5`, {
    headers,
  })
  if (!list.resp.ok || typeof list.body !== 'object' || !list.body) {
    throw new Error(`list missing failed: ${list.resp.status}`)
  }
  const items = ((list.body as JsonObject).items ?? []) as Array<JsonObject>

  if (items.length === 0) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          note: 'no missing file assets, skip single/batch update checks',
          checks: {
            login: login.resp.status,
            listMissing: list.resp.status,
          },
        },
        null,
        2,
      ),
    )
    return
  }

  const firstId = String(items[0].id ?? '')
  const batchIds = items.slice(0, 2).map(i => String(i.id ?? '')).filter(Boolean)
  if (!firstId || batchIds.length === 0) {
    throw new Error('invalid file ids from list api')
  }

  // 3) 单条更新（设为 missing，避免破坏现有状态）。
  const single = await fetchJsonWithRetry(`${baseUrl}/api/v1/admin/files/${firstId}/status`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ status: 'missing', reason: 'smoke_single' }),
  })
  if (!single.resp.ok) {
    throw new Error(`single status update failed: ${single.resp.status}`)
  }

  // 4) 批量更新（同样设为 missing，确保幂等）。
  const batch = await fetchJsonWithRetry(`${baseUrl}/api/v1/admin/files/status/batch`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ fileIds: batchIds, status: 'missing', reason: 'smoke_batch' }),
  })
  if (!batch.resp.ok) {
    throw new Error(`batch status update failed: ${batch.resp.status}`)
  }

  // 5) 导出 CSV，并验证响应头。
  const exportResp = await fetch(`${baseUrl}/api/v1/admin/files/export?status=missing`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const csvText = await exportResp.text()
  if (!exportResp.ok) {
    throw new Error(`export failed: ${exportResp.status}`)
  }
  const contentType = exportResp.headers.get('content-type') ?? ''
  if (!contentType.includes('text/csv')) {
    throw new Error(`unexpected export content-type: ${contentType}`)
  }
  const firstLine = csvText.split('\n')[0] ?? ''
  if (!firstLine.includes('fileId,ownerUserId')) {
    throw new Error('unexpected export csv header')
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        checks: {
          login: login.resp.status,
          listMissing: list.resp.status,
          singleUpdate: single.resp.status,
          batchUpdate: batch.resp.status,
          exportMissing: exportResp.status,
        },
        sample: {
          firstId,
          batchCount: batchIds.length,
          csvHeader: firstLine,
        },
      },
      null,
      2,
    ),
  )
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
