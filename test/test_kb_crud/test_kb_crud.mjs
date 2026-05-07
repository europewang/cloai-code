#!/usr/bin/env node

/**
 * 知识库 CRUD 测试脚本
 * 测试：创建、读取、更新、删除知识库，以及文档的上传、解析、查看、删除
 */

const API_BASE = process.env.API_BASE || 'http://localhost:8091/api/v1'
const TEST_FILE = process.env.TEST_FILE || './发明专利.pdf'

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

const log = {
  success: (msg) => console.log(`${colors.green}✓ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}✗ ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`),
  step: (msg) => console.log(`${colors.cyan}→ ${msg}${colors.reset}`),
}

// Store test state
let authToken = ''
let testDatasetId = ''
let testDocumentId = ''

// Helper: Make authenticated request
async function apiRequest(method, endpoint, body = null, isFormData = false) {
  const url = `${API_BASE}${endpoint}`
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${authToken}`,
    },
  }

  if (body && !isFormData) {
    options.body = JSON.stringify(body)
    options.headers['Content-Type'] = 'application/json'
  } else if (body && isFormData) {
    // Don't set Content-Type for FormData, let fetch handle it with boundary
    options.body = body
  }

  const response = await fetch(url, options)
  const contentType = response.headers.get('content-type') || ''

  let data
  if (contentType.includes('application/json')) {
    data = await response.json()
  } else if (contentType.includes('application/pdf') || contentType.includes('application/octet-stream') || contentType.includes('image/')) {
    data = await response.blob()
  } else {
    data = await response.text()
  }

  return {
    status: response.status,
    ok: response.ok,
    data,
    contentType,
  }
}

// Login to get auth token
async function login() {
  log.step('登录获取认证令牌...')

  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'admin',
      password: 'admin123456',
    }),
  })

  const data = await response.json()
  if (!response.ok) {
    log.error(`登录失败: ${JSON.stringify(data)}`)
    process.exit(1)
  }

  authToken = data.data?.access_token || data.data?.accessToken || data.access_token || data.accessToken || data.token || ''
  if (!authToken) {
    log.error(`获取令牌失败，响应: ${JSON.stringify(data)}`)
    process.exit(1)
  }

  log.success(`登录成功，令牌: ${authToken.substring(0, 20)}...`)
  return authToken
}

// Test 1: List all datasets
async function testListDatasets() {
  log.step('测试列出所有知识库...')

  const response = await apiRequest('GET', '/admin/datasets')

  if (!response.ok) {
    log.error(`列出知识库失败 (${response.status}): ${JSON.stringify(response.data)}`)
    return null
  }

  const datasets = Array.isArray(response.data) ? response.data : (response.data?.data || [])
  log.success(`列出知识库成功，共 ${datasets.length} 个知识库`)

  if (datasets.length > 0) {
    log.info(`示例知识库: ${JSON.stringify(datasets[0])}`)
  }

  return datasets
}

// Test 2: Create a dataset
async function testCreateDataset() {
  log.step('测试创建知识库...')

  const testName = `测试知识库_${Date.now()}`
  const response = await apiRequest('POST', '/admin/datasets', {
    name: testName,
    description: '自动化测试创建的知识库',
  })

  if (!response.ok) {
    log.error(`创建知识库失败 (${response.status}): ${JSON.stringify(response.data)}`)
    return null
  }

  const dataset = response.data
  const datasetId = dataset?.data?.id || dataset?.id
  log.success(`创建知识库成功: ${testName}, ID: ${datasetId}`)

  return datasetId
}

// Test 3: Update a dataset
async function testUpdateDataset(datasetId) {
  if (!datasetId) {
    log.warn('跳过更新知识库测试（无 datasetId）')
    return false
  }

  log.step('测试更新知识库...')

  const response = await apiRequest('PUT', `/admin/datasets/${datasetId}`, {
    name: `更新后的知识库_${Date.now()}`,
    description: '自动化测试更新的知识库',
  })

  if (!response.ok) {
    log.error(`更新知识库失败 (${response.status}): ${JSON.stringify(response.data)}`)
    return false
  }

  log.success(`更新知识库成功`)
  return true
}

// Test 4: List documents in dataset
async function testListDocuments(datasetId) {
  if (!datasetId) {
    log.warn('跳过列出文档测试（无 datasetId）')
    return []
  }

  log.step('测试列出知识库文档...')

  const response = await apiRequest('GET', `/admin/datasets/${datasetId}/documents`)

  if (!response.ok) {
    log.error(`列出文档失败 (${response.status}): ${JSON.stringify(response.data)}`)
    return []
  }

  const docs = response.data?.data?.docs || response.data?.data || response.data || []
  log.success(`列出文档成功，共 ${Array.isArray(docs) ? docs.length : 'N/A'} 个文档`)

  return Array.isArray(docs) ? docs : []
}

// Test 5: Upload a document
async function testUploadDocument(datasetId) {
  if (!datasetId) {
    log.warn('跳过上传文档测试（无 datasetId）')
    return null
  }

  log.step('测试上传文档...')

  // Check if test file exists
  const fs = await import('fs')
  if (!fs.existsSync(TEST_FILE)) {
    log.error(`测试文件不存在: ${TEST_FILE}`)
    log.info('请设置 TEST_FILE 环境变量指定有效的 PDF 文件路径')
    return null
  }

  const formData = new FormData()
  const fileBuffer = fs.readFileSync(TEST_FILE)
  const fileName = TEST_FILE.split('/').pop() || 'test.pdf'
  const file = new Blob([fileBuffer], { type: 'application/pdf' })
  formData.append('file', file, fileName)

  const response = await apiRequest('POST', `/admin/datasets/${datasetId}/documents`, formData, true)

  if (!response.ok) {
    log.error(`上传文档失败 (${response.status}): ${JSON.stringify(response.data)}`)
    return null
  }

  // Handle array response: data is an array of documents
  const docsArray = Array.isArray(response.data?.data) ? response.data.data : [response.data?.data].filter(Boolean)
  const docData = docsArray[0] || {}
  const docId = docData?.id || response.data?.id || response.data?.document?.id

  if (!docId) {
    log.error(`无法从响应中提取文档ID: ${JSON.stringify(response.data).substring(0, 200)}`)
    return null
  }

  log.success(`上传文档成功, 文件: ${fileName}, 文档ID: ${docId}`)

  return docId
}

// Test 6: Parse/document (run)
async function testParseDocument(datasetId, docId) {
  if (!datasetId || !docId) {
    log.warn('跳过解析文档测试（无 datasetId 或 docId）')
    return false
  }

  log.step('测试解析文档...')

  const response = await apiRequest('POST', `/admin/datasets/${datasetId}/documents/run`, {
    doc_ids: [docId],
  })

  if (!response.ok) {
    log.error(`解析文档失败 (${response.status}): ${JSON.stringify(response.data)}`)
    return false
  }

  log.success(`解析文档请求成功提交`)
  log.info('等待解析完成（这可能需要一些时间）...')

  // Poll for document status
  let attempts = 0
  const maxAttempts = 10
  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 3000))
    const docs = await testListDocuments(datasetId)
    const doc = docs.find(d => d.id === docId)
    if (doc) {
      log.info(`文档状态: ${doc.status || doc.run_status || 'unknown'}`)
      if (doc.status === '1' || doc.run_status === '1' || doc.status === 'SUCCESS') {
        log.success('文档解析完成')
        return true
      }
    }
    attempts++
  }

  log.warn('文档解析可能仍在进行中')
  return true
}

// Test 7: Get document file
async function testGetDocumentFile(datasetId, docId) {
  if (!datasetId || !docId) {
    log.warn('跳过获取文档文件测试（无 datasetId 或 docId）')
    return false
  }

  log.step('测试获取文档文件...')

  const response = await apiRequest('GET', `/admin/datasets/${datasetId}/documents/${docId}/file`)

  if (!response.ok) {
    log.error(`获取文档文件失败 (${response.status})`)
    return false
  }

  if (response.contentType.includes('application/pdf') || response.contentType.includes('application/octet-stream')) {
    const size = response.data instanceof Blob ? response.data.size : 'unknown'
    log.success(`获取文档文件成功，大小: ${size} bytes`)
    return true
  }

  log.warn(`获取文档文件返回类型: ${response.contentType}`)
  return true
}

// Test 8: Delete document
async function testDeleteDocument(datasetId, docId) {
  if (!datasetId || !docId) {
    log.warn('跳过删除文档测试（无 datasetId 或 docId）')
    return false
  }

  log.step('测试删除文档...')

  const response = await apiRequest('DELETE', `/admin/datasets/${datasetId}/documents`, {
    ids: [docId],
  })

  if (!response.ok) {
    log.error(`删除文档失败 (${response.status}): ${JSON.stringify(response.data)}`)
    return false
  }

  log.success(`删除文档成功`)
  return true
}

// Test 9: Delete dataset
async function testDeleteDataset(datasetId) {
  if (!datasetId) {
    log.warn('跳过删除知识库测试（无 datasetId）')
    return false
  }

  log.step('测试删除知识库...')

  const response = await apiRequest('DELETE', `/admin/datasets/${datasetId}`)

  if (!response.ok) {
    log.error(`删除知识库失败 (${response.status}): ${JSON.stringify(response.data)}`)
    return false
  }

  log.success(`删除知识库成功`)
  return true
}

// Run all tests
async function runTests() {
  console.log('\n' + '='.repeat(60))
  console.log('知识库 CRUD 测试开始')
  console.log('='.repeat(60) + '\n')

  let allPassed = true

  try {
    // Login first
    await login()
    console.log('')

    // Test 1: List datasets
    const datasets = await testListDatasets()
    if (datasets === null) allPassed = false
    console.log('')

    // Test 2: Create dataset
    const newDatasetId = await testCreateDataset()
    if (!newDatasetId) allPassed = false
    testDatasetId = newDatasetId
    console.log('')

    // Test 3: Update dataset
    const updateResult = await testUpdateDataset(newDatasetId)
    if (!updateResult) allPassed = false
    console.log('')

    // Test 4: List documents (before upload)
    await testListDocuments(newDatasetId)
    console.log('')

    // Test 5: Upload document
    const docId = await testUploadDocument(newDatasetId)
    if (!docId) allPassed = false
    testDocumentId = docId
    console.log('')

    // Test 6: Parse document
    if (docId) {
      await testParseDocument(newDatasetId, docId)
      console.log('')
    }

    // Test 7: Get document file
    if (docId) {
      await testGetDocumentFile(newDatasetId, docId)
      console.log('')
    }

    // Test 8: Delete document
    if (docId) {
      await testDeleteDocument(newDatasetId, docId)
      console.log('')
    }

    // Test 9: Delete dataset
    if (newDatasetId) {
      await testDeleteDataset(newDatasetId)
      console.log('')
    }

  } catch (error) {
    log.error(`测试过程中发生错误: ${error.message}`)
    allPassed = false
  }

  // Summary
  console.log('='.repeat(60))
  if (allPassed) {
    log.success('所有测试完成！')
  } else {
    log.error('部分测试失败，请检查上方日志')
  }
  console.log('='.repeat(60) + '\n')

  process.exit(allPassed ? 0 : 1)
}

// Run if called directly
runTests()
