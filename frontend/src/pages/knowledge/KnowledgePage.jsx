import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import {
  CheckSquare,
  ChevronLeft,
  Clock,
  Database,
  Edit,
  FileText,
  Folder,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  Upload,
  User,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import clsx from 'clsx'
import mammoth from 'mammoth'
import { Document, Page, pdfjs } from 'react-pdf'
import { twMerge } from 'tailwind-merge'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import {
  apiFetch,
  createDataset,
  deleteDataset,
  deleteDatasets,
  deleteDocuments,
  fetchChunks,
  fetchDatasets,
  fetchDocuments,
  getDocumentFile,
  runDocuments,
  updateDataset,
  updateDatasetShare,
  updateDocument,
  uploadDocument,
} from '../../lib/appApi'

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

function cn(...inputs) {
  return twMerge(clsx(inputs))
}

function ChunkHighlights({ chunk, scale, pageNumber }) {
  if (!chunk?.positions?.length) return null

  const rects = chunk.positions
    .filter((pos) => pos[0] === pageNumber)
    .map((pos, index) => {
      const [, x1, x2, y1, y2] = pos
      return (
        <div
          key={index}
          className="absolute z-[100] border-2 border-yellow-600 bg-yellow-400/50"
          style={{
            left: x1 * scale,
            top: y1 * scale,
            width: (x2 - x1) * scale,
            height: (y2 - y1) * scale,
          }}
        />
      )
    })

  if (rects.length === 0) return null
  return <div className="pointer-events-none absolute inset-0 z-[100]">{rects}</div>
}

function DocumentViewer({ doc, datasetId, onClose }) {
  const [chunks, setChunks] = useState([])
  const [loadingChunks, setLoadingChunks] = useState(false)
  const [numPages, setNumPages] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [scale, setScale] = useState(1.0)
  const [pdfError, setPdfError] = useState(null)
  const [activeChunk, setActiveChunk] = useState(null)
  const [docxContent, setDocxContent] = useState(null)
  const [loadingDocx, setLoadingDocx] = useState(false)

  useEffect(() => {
    const isParsed = doc.run === 'DONE' || doc.run_status === '1'
    if (!isParsed) return

    setLoadingChunks(true)
    fetchChunks(datasetId, doc.id)
      .then((data) => {
        if (Array.isArray(data)) {
          setChunks(data)
        } else if (Array.isArray(data?.chunks)) {
          setChunks(data.chunks)
        } else {
          setChunks([])
        }
      })
      .catch(() => setChunks([]))
      .finally(() => setLoadingChunks(false))
  }, [datasetId, doc.id, doc.run, doc.run_status])

  useEffect(() => {
    const isDocx = doc.suffix === 'docx' || doc.name?.toLowerCase().endsWith('.docx')
    if (!isDocx || !doc.url) return

    setLoadingDocx(true)
    fetch(doc.url)
      .then((res) => res.arrayBuffer())
      .then((buffer) => mammoth.convertToHtml({ arrayBuffer: buffer }))
      .then((result) => setDocxContent(result?.value || null))
      .catch(() => setDocxContent(null))
      .finally(() => setLoadingDocx(false))
  }, [doc.id, doc.name, doc.suffix, doc.url])

  useEffect(() => {
    if (!activeChunk) return
    let targetPage = 1
    if (activeChunk.positions?.length) {
      targetPage = activeChunk.positions[0][0]
    } else if (activeChunk.page_num?.length) {
      targetPage = activeChunk.page_num[0]
    }

    const timer = setTimeout(() => {
      const pageEl = document.getElementById(`pdf-page-${targetPage}`)
      pageEl?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
    return () => clearTimeout(timer)
  }, [activeChunk])

  const filteredChunks = chunks.filter((chunk) => {
    const content = chunk.content_with_weight || chunk.content || ''
    return content.toLowerCase().includes(searchTerm.toLowerCase())
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
      <div className="relative flex h-full w-full max-w-[95vw] flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b bg-slate-50 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2">
              <FileText className="text-blue-600" size={20} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800">{doc.name}</h3>
              <p className="text-xs text-slate-500">
                {numPages ? `${numPages} 页` : '加载中...'} · {chunks.length} 个切片
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setScale((value) => Math.max(0.5, value - 0.1))} className="rounded-lg p-2 hover:bg-slate-200">
              <ZoomOut size={18} />
            </button>
            <span className="w-12 text-center font-mono text-sm">{Math.round(scale * 100)}%</span>
            <button onClick={() => setScale((value) => Math.min(2.5, value + 0.1))} className="rounded-lg p-2 hover:bg-slate-200">
              <ZoomIn size={18} />
            </button>
            <div className="mx-2 h-6 w-px bg-slate-300" />
            <button onClick={onClose} className="rounded-full bg-slate-200 p-2 transition-colors hover:bg-slate-300">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="relative flex flex-1 justify-center overflow-auto bg-slate-100 p-8 scroll-smooth">
            {doc.type === 'pdf' ? (
              <div className="relative flex w-full flex-col items-center">
                <Document
                  file={doc.url}
                  className="flex flex-col items-center"
                  onLoadSuccess={({ numPages: loadedPages }) => {
                    setNumPages(loadedPages)
                    setPdfError(null)
                  }}
                  onLoadError={(error) => setPdfError(error.message)}
                  loading={<div className="flex items-center gap-2 p-4"><Loader2 className="animate-spin" /> 加载PDF中...</div>}
                >
                  {Array.from(new Array(numPages || 0), (_, index) => {
                    const currentPage = index + 1
                    return (
                      <div
                        key={`page_${currentPage}`}
                        id={`pdf-page-${currentPage}`}
                        className="relative mb-6 inline-block border border-slate-200 shadow-lg"
                      >
                        <Page
                          pageNumber={currentPage}
                          scale={scale}
                          renderTextLayer
                          renderAnnotationLayer
                          className="bg-white"
                        />
                        <ChunkHighlights chunk={activeChunk} scale={scale} pageNumber={currentPage} />
                      </div>
                    )
                  })}
                </Document>
                {pdfError && <div className="rounded bg-white p-4 text-red-500 shadow">无法加载PDF: {pdfError}</div>}
              </div>
            ) : doc.suffix === 'docx' || doc.name?.toLowerCase().endsWith('.docx') ? (
              <div className="h-full w-full overflow-auto rounded-lg border bg-white p-6">
                {loadingDocx ? (
                  <div className="flex h-64 items-center justify-center">
                    <Loader2 className="mr-2 animate-spin" /> 加载文档中...
                  </div>
                ) : docxContent ? (
                  <div className="prose prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: docxContent }} />
                ) : (
                  <div className="flex h-64 flex-col items-center justify-center text-slate-500">
                    <FileText size={48} className="mb-4 opacity-50" />
                    <p>无法预览此文档</p>
                    <p className="mt-2 text-sm">文档内容已解析为 {chunks.length} 个切片，可在右侧查看</p>
                  </div>
                )}
              </div>
            ) : (
              <iframe src={doc.url} className="h-full w-full rounded-lg border bg-white" />
            )}
          </div>

          <div className="flex w-96 shrink-0 flex-col border-l bg-white">
            <div className="border-b p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  placeholder="搜索切片内容..."
                  className="w-full rounded-lg border bg-slate-50 py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>
            </div>

            <div className="scroll-container flex-1 space-y-3 bg-slate-50 p-4">
              {loadingChunks ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center text-slate-500">
                  <Loader2 className="animate-spin" />
                  <span className="text-xs">加载切片中...</span>
                </div>
              ) : filteredChunks.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-500">
                  {searchTerm ? '未找到匹配的切片' : '暂无切片数据'}
                </div>
              ) : (
                filteredChunks.map((chunk, index) => (
                  <div
                    key={chunk.id || index}
                    onClick={() => setActiveChunk(chunk)}
                    className={cn(
                      'group cursor-pointer rounded-lg border bg-white p-3 transition-all hover:border-blue-400 hover:shadow-md',
                      activeChunk?.id === chunk.id && 'border-blue-500 ring-2 ring-blue-200'
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-400">
                        Page {chunk.page_num?.[0]}
                      </span>
                      <span className="text-xs text-slate-300 group-hover:text-blue-400">#{index + 1}</span>
                    </div>
                    <p className="line-clamp-4 text-sm leading-relaxed text-slate-700">
                      {chunk.content_with_weight ? (
                        <span dangerouslySetInnerHTML={{ __html: chunk.content_with_weight }} />
                      ) : (
                        chunk.content
                      )}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function RenameModal({ isOpen, onClose, onConfirm, initialValue, initialDescription, title, isSubmitting }) {
  const [value, setValue] = useState(initialValue)
  const [description, setDescription] = useState(initialDescription || '')

  useEffect(() => {
    setValue(initialValue)
    setDescription(initialDescription || '')
  }, [initialDescription, initialValue])

  if (!isOpen) return null

  return (
    <div className="animate-in fade-in fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 duration-200 backdrop-blur-sm">
      <div className="animate-in zoom-in-95 w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl duration-200">
        <div className="flex items-center justify-between border-b bg-slate-50 p-4">
          <h3 className="flex items-center gap-2 font-bold text-slate-800">
            <Edit size={18} className="text-blue-500" />
            {title}
          </h3>
          <button onClick={onClose} className="rounded-full p-1 transition-colors hover:bg-slate-200">
            <X size={20} className="text-slate-500" />
          </button>
        </div>
        <div className="space-y-4 p-6">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">名称</label>
            <input
              type="text"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="w-full rounded-lg border bg-slate-50 px-4 py-2 transition-colors focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === 'Enter' && value.trim() && initialDescription === undefined) {
                  onConfirm(value)
                }
              }}
            />
          </div>

          {initialDescription !== undefined && (
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">描述 (可选)</label>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="min-h-[100px] w-full resize-none rounded-lg border bg-slate-50 px-4 py-2 transition-colors focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="请输入知识库描述..."
              />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t bg-slate-50 p-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200">
            取消
          </button>
          <button
            onClick={() => onConfirm(value, description)}
            disabled={!value.trim() || isSubmitting}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting && <Loader2 className="animate-spin" size={16} />}
            确定
          </button>
        </div>
      </div>
    </div>
  )
}

function ShareModal({ isOpen, dataset, isShared, isSubmitting, onClose, onConfirm }) {
  const [shared, setShared] = useState(false)

  useEffect(() => {
    setShared(isShared)
  }, [isShared])

  if (!isOpen) return null

  return (
    <div className="animate-in fade-in fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 duration-200 backdrop-blur-sm">
      <div className="animate-in zoom-in-95 w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-2xl duration-200">
        <div className="flex items-center justify-between border-b bg-slate-50 p-4">
          <h3 className="flex items-center gap-2 font-bold text-slate-800">
            <Lock size={18} className="text-blue-500" />
            共享设置
          </h3>
          <button onClick={onClose} className="rounded-full p-1 transition-colors hover:bg-slate-200">
            <X size={20} className="text-slate-500" />
          </button>
        </div>
        <div className="space-y-4 p-6">
          {dataset && (
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              知识库：<span className="font-medium text-slate-800">{dataset.name}</span>
            </div>
          )}
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={shared}
              onChange={(event) => setShared(event.target.checked)}
              className="mt-0.5 rounded border-gray-300 text-blue-600"
            />
            <div>
              <p className="text-sm font-medium text-slate-700">共享知识库</p>
              <p className="mt-0.5 text-xs text-slate-400">
                {shared ? '管理员可见，其他管理员可分配给用户使用' : '仅自己可见，其他用户需单独授权'}
              </p>
            </div>
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t bg-slate-50 p-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200">
            取消
          </button>
          <button
            onClick={() => onConfirm(shared)}
            disabled={isSubmitting}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting && <Loader2 className="animate-spin" size={16} />}
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

function SettingsModal({ isOpen, dataset, isSubmitting, onClose, onConfirm }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [language, setLanguage] = useState('English')
  const [permission, setPermission] = useState('me')
  const [layoutRecognize, setLayoutRecognize] = useState('DeepDOC')
  const [chunkTokenNum, setChunkTokenNum] = useState(128)
  const [useRaptor, setUseRaptor] = useState(false)
  const [raptorPrompt, setRaptorPrompt] = useState('')
  const [autoKeywords, setAutoKeywords] = useState(0)
  const [autoQuestions, setAutoQuestions] = useState(0)

  const defaultRaptorPrompt = '请总结以下段落。注意数字，不要编造。段落如下：\n      {cluster_content}\n以上是你需要总结的内容。'

  useEffect(() => {
    if (!isOpen || !dataset) return

    setName(dataset.name || '')
    setDescription(dataset.description || '')
    setLanguage(dataset.language || 'Chinese')
    setPermission(dataset.permission || 'me')

    const config = dataset.parser_config || {}
    setLayoutRecognize(config.layout_recognize || 'DeepDOC')
    setChunkTokenNum(config.chunk_token_num || 128)
    setAutoKeywords(config.auto_keywords || 0)
    setAutoQuestions(config.auto_questions || 0)

    const raptor = config.raptor || {}
    setUseRaptor(raptor.use_raptor || false)
    setRaptorPrompt(raptor.prompt || defaultRaptorPrompt)
  }, [dataset, isOpen])

  if (!isOpen) return null

  const handleConfirm = () => {
    const parserConfig = {
      ...dataset.parser_config,
      chunk_token_num: Number.parseInt(chunkTokenNum, 10),
      layout_recognize: layoutRecognize,
      auto_keywords: Number.parseInt(autoKeywords, 10),
      auto_questions: Number.parseInt(autoQuestions, 10),
      raptor: {
        ...dataset.parser_config?.raptor,
        use_raptor: useRaptor,
        prompt: raptorPrompt,
      },
    }
    onConfirm({ name, description, language, permission, parser_config: parserConfig })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b p-4">
          <h3 className="text-lg font-bold text-slate-800">知识库设置</h3>
          <button onClick={onClose} className="rounded-full p-1 transition-colors hover:bg-slate-200">
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        <div className="scroll-container space-y-6 p-6">
          <div className="space-y-4">
            <h4 className="border-b pb-2 font-semibold text-slate-900">基本信息</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">名称</label>
                <input value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-lg border bg-slate-50 px-3 py-2 focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">语言</label>
                <select value={language} onChange={(event) => setLanguage(event.target.value)} className="w-full rounded-lg border bg-slate-50 px-3 py-2 focus:ring-2 focus:ring-blue-500">
                  <option value="Chinese">Chinese</option>
                  <option value="English">English</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">描述</label>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} className="h-20 w-full resize-none rounded-lg border bg-slate-50 px-3 py-2 focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">权限</label>
              <select value={permission} onChange={(event) => setPermission(event.target.value)} className="w-full rounded-lg border bg-slate-50 px-3 py-2 focus:ring-2 focus:ring-blue-500">
                <option value="me">仅自己 (Me)</option>
                <option value="team">团队 (Team)</option>
              </select>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="border-b pb-2 font-semibold text-slate-900">解析配置</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Layout Recognize</label>
                <select value={layoutRecognize} onChange={(event) => setLayoutRecognize(event.target.value)} className="w-full rounded-lg border bg-slate-50 px-3 py-2 focus:ring-2 focus:ring-blue-500">
                  <option value="DeepDOC">DeepDOC</option>
                  <option value="Naive">Naive</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Chunk Token Number</label>
                <input type="number" value={chunkTokenNum} onChange={(event) => setChunkTokenNum(event.target.value)} className="w-full rounded-lg border bg-slate-50 px-3 py-2 focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input id="useRaptor" type="checkbox" checked={useRaptor} onChange={(event) => setUseRaptor(event.target.checked)} className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500" />
              <label htmlFor="useRaptor" className="text-sm font-medium text-slate-700">启用 RAPTOR (递归摘要)</label>
            </div>

            {useRaptor && (
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">RAPTOR Prompt</label>
                <textarea value={raptorPrompt} onChange={(event) => setRaptorPrompt(event.target.value)} className="h-32 w-full resize-none rounded-lg border bg-slate-50 px-3 py-2 font-mono text-xs focus:ring-2 focus:ring-blue-500" />
                <p className="mt-1 text-xs text-slate-500">请保持 `{'{cluster_content}'}` 占位符。</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t bg-slate-50 p-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200">
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting && <Loader2 className="animate-spin" size={16} />}
            保存配置
          </button>
        </div>
      </div>
    </div>
  )
}

function GroupNavBar({ groups, onGroupClick, onCreateGroup, onRenameGroup, onDeleteGroup }) {
  return (
    <div className="sticky top-0 z-10 border-b bg-white/95 px-6 py-3 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        {groups.map((group) => (
          <div key={group.id} className="flex items-center gap-1 rounded-full border bg-slate-50 px-1 py-1">
            <button onClick={() => onGroupClick(group.id)} className="rounded-full px-3 py-1 text-sm text-slate-700 transition-colors hover:bg-white hover:text-blue-600">
              {group.name} ({group.count})
            </button>
            {group.id !== '__ungrouped__' && (
              <>
                <button
                  onClick={() => {
                    const nextName = window.prompt('输入新的分组名称：', group.name)
                    if (nextName && nextName.trim()) {
                      onRenameGroup(group.id, nextName.trim())
                    }
                  }}
                  className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-slate-700"
                  title="重命名分组"
                >
                  <Edit size={12} />
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`确定删除分组「${group.name}」吗？`)) {
                      onDeleteGroup(group.id)
                    }
                  }}
                  className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-red-600"
                  title="删除分组"
                >
                  <Trash2 size={12} />
                </button>
              </>
            )}
          </div>
        ))}

        <button onClick={onCreateGroup} className="ml-auto flex items-center gap-1 rounded-full border border-blue-200 px-3 py-1.5 text-sm text-blue-600 transition-colors hover:bg-blue-50">
          <Plus size={14} />
          新建分组
        </button>
      </div>
    </div>
  )
}

function DatasetCard({ dataset, onClick, onDelete, onRename, onShare, selected, onSelect, selectionMode, currentRole }) {
  const manageable = dataset?.manageable !== false
  const canShare = dataset?.isOwner === true || currentRole === 'super_admin'
  const canSelect = manageable
  const cardClickable = selectionMode ? canSelect : manageable

  return (
    <div
      onClick={selectionMode ? (event) => canSelect && onSelect(dataset.id, event) : (cardClickable ? onClick : undefined)}
      className={cn(
        'group relative rounded-xl border bg-white p-6 transition-all hover:shadow-lg',
        cardClickable ? 'cursor-pointer' : 'cursor-not-allowed opacity-90',
        selected ? 'border-blue-500 bg-blue-50/10 ring-1 ring-blue-500' : 'border-slate-100 hover:border-blue-200'
      )}
    >
      <div className="absolute right-4 top-4 z-10 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
        {!selectionMode && manageable && (
          <>
            {canShare && onShare && (
              <button
                onClick={(event) => {
                  event.stopPropagation()
                  onShare(dataset, event)
                }}
                className="flex h-5 w-5 items-center justify-center rounded text-slate-400 transition-all hover:bg-blue-50 hover:text-blue-500"
                title="共享设置"
              >
                <Lock size={12} />
              </button>
            )}
            <button
              onClick={(event) => {
                event.stopPropagation()
                onRename(dataset, event)
              }}
              className="flex h-5 w-5 items-center justify-center rounded text-slate-400 transition-all hover:bg-blue-50 hover:text-blue-500"
              title="重命名"
            >
              <FileText size={12} />
            </button>
            <button
              onClick={(event) => {
                event.stopPropagation()
                onDelete(dataset.id, event)
              }}
              className="flex h-5 w-5 items-center justify-center rounded text-slate-400 transition-all hover:bg-red-50 hover:text-red-500"
              title="删除知识库"
            >
              <Trash2 size={12} />
            </button>
          </>
        )}
        <div
          onClick={(event) => {
            event.stopPropagation()
            if (canSelect) onSelect(dataset.id, event)
          }}
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded border transition-all',
            canSelect ? '' : 'cursor-not-allowed opacity-40',
            selected ? 'border-blue-500 bg-blue-500 text-white' : 'border-slate-300 bg-white hover:border-blue-400'
          )}
        >
          {selected && <CheckSquare size={14} />}
        </div>
      </div>

      <div className="mb-4 flex items-start justify-between">
        <div className="rounded-lg bg-blue-50 p-3 transition-colors group-hover:bg-blue-100">
          <Database className="h-6 w-6 text-blue-500" />
        </div>
      </div>

      <h3 className="mb-1 line-clamp-1 pr-14 font-bold text-slate-800 transition-colors group-hover:text-blue-600">{dataset.name}</h3>
      <p className="mb-4 line-clamp-2 text-sm text-slate-400">{dataset.description || '暂无描述'}</p>
      <div className="mb-3 text-xs text-slate-500">
        创建人：{dataset.creatorUsername || dataset.creator_username || dataset.creatorUserName || dataset.owner_username || dataset.ownerUsername || dataset.created_by || '未知'}
        {dataset.created_at && <> · {new Date(dataset.created_at).toLocaleDateString()}</>}
      </div>

      {dataset.isOwner ? (
        <div className="mb-3 flex items-center gap-1 text-[11px] text-blue-600">
          <User size={10} /> 我创建的 · {dataset.isShared ? '已共享' : '私有'}
        </div>
      ) : dataset.isShared ? (
        <div className="mb-3 flex items-center gap-1 text-[11px] text-green-600">
          <Lock size={10} /> 他人共享
        </div>
      ) : (
        <div className="mb-3 flex items-center gap-1 text-[11px] text-orange-600">
          <Lock size={10} /> 他人私有
        </div>
      )}

      <div className="flex items-center justify-between border-t pt-4 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <FileText size={14} />
          全部文件: {dataset.document_count || 0}
        </span>
        <span className="flex items-center gap-1">
          <Clock size={14} />
          {dataset.created_at ? new Date(dataset.created_at).toLocaleDateString() : (dataset.create_time ? new Date(dataset.create_time).toLocaleDateString() : '未知')}
        </span>
      </div>
    </div>
  )
}

function DraggableDatasetCard(props) {
  const { dataset } = props
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: String(dataset.id),
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.4 : 1,
        cursor: 'grab',
      }}
      {...listeners}
      {...attributes}
    >
      <DatasetCard {...props} />
    </div>
  )
}

function DroppableGroupSection({ groupId, groupName, items, renderCard, overGroupId, isDragging, onRemove }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `droppable-group_${groupId}`,
  })

  return (
    <section id={`knowledge-group-${groupId}`} ref={setNodeRef} className={cn('scroll-mt-24 rounded-2xl border p-4 transition-colors', (isOver || overGroupId === groupId) && isDragging ? 'border-blue-300 bg-blue-50/60' : 'border-transparent bg-transparent')}>
      <div className="mb-4 flex items-center gap-2">
        <Folder size={16} className="text-blue-500" />
        <h3 className="text-base font-semibold text-slate-800">{groupName}</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{items.length}</span>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white/80 px-4 py-8 text-center text-sm text-slate-400">
          拖拽知识库到这里完成分组
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <div key={item.id} className="group relative">
              {groupId !== '__ungrouped__' && (
                <button
                  onClick={() => onRemove(item)}
                  className="absolute left-3 top-3 z-10 rounded-full bg-white/90 p-1 text-slate-400 shadow opacity-0 transition-opacity transition-colors hover:text-red-500 group-hover:opacity-100 focus:opacity-100"
                  title="移出分组"
                >
                  <X size={12} />
                </button>
              )}
              {renderCard(item)}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function DatasetDetail({ dataset, onBack, onUpdate }) {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [parsingId, setParsingId] = useState(null)
  const [parsingError, setParsingError] = useState(null)
  const [viewingDoc, setViewingDoc] = useState(null)
  const [selectedDocs, setSelectedDocs] = useState([])
  const [batchDeleting, setBatchDeleting] = useState(false)
  const [renameModal, setRenameModal] = useState({
    isOpen: false,
    doc: null,
    initialValue: '',
    isSubmitting: false,
  })
  const [settingsModal, setSettingsModal] = useState({
    isOpen: false,
    isSubmitting: false,
  })

  const loadDocs = useCallback(() => {
    setLoading(true)
    setSelectedDocs([])
    fetchDocuments(dataset.id)
      .then((data) => setDocs(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [dataset.id])

  useEffect(() => {
    loadDocs()
    const interval = setInterval(async () => {
      try {
        const data = await fetchDocuments(dataset.id)
        if (!Array.isArray(data)) return
        setDocs(data)
        if (!parsingId) return
        const target = data.find((item) => item.id === parsingId)
        if (!target) return
        const isDone = target.run === 'DONE'
        const isFail = target.run === 'FAIL'
        if (isDone || isFail) {
          setParsingId(null)
          setParsingError(isFail ? target.error_msg || '解析失败' : null)
        }
      } catch {
        // keep polling
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [dataset.id, loadDocs, parsingId])

  const handleUpdateSettings = async (newSettings) => {
    setSettingsModal((prev) => ({ ...prev, isSubmitting: true }))
    try {
      await updateDataset(
        dataset.id,
        newSettings.name,
        newSettings.description,
        newSettings.language,
        newSettings.permission,
        newSettings.parser_config
      )
      onUpdate?.()
      alert('配置已更新')
      setSettingsModal({ isOpen: false, isSubmitting: false })
    } catch (error) {
      alert(`更新失败: ${error.message}`)
      setSettingsModal((prev) => ({ ...prev, isSubmitting: false }))
    }
  }

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      await uploadDocument(dataset.id, file)
      loadDocs()
    } catch (error) {
      alert(`上传失败: ${error.message}`)
    } finally {
      setUploading(false)
      event.target.value = null
    }
  }

  const handleDeleteDoc = async (docId) => {
    if (!window.confirm('确定删除此文件吗？')) return
    setDeletingId(docId)
    try {
      await deleteDocuments(dataset.id, [docId])
      loadDocs()
    } catch (error) {
      alert(`删除失败: ${error.message}`)
    } finally {
      setDeletingId(null)
    }
  }

  const handleParseDoc = async (docId) => {
    setParsingId(docId)
    setParsingError(null)
    try {
      const result = await runDocuments(dataset.id, [docId])
      if (result?.code === 0) return
      setParsingId(null)
      setParsingError(result?.message || '解析请求失败')
    } catch (error) {
      setParsingId(null)
      setParsingError(error.message || '解析失败')
    }
  }

  const handleBatchDeleteDocs = async () => {
    if (selectedDocs.length === 0) return
    if (!window.confirm(`确定删除选中的 ${selectedDocs.length} 个文件吗？`)) return

    setBatchDeleting(true)
    try {
      await deleteDocuments(dataset.id, selectedDocs)
      loadDocs()
    } catch (error) {
      alert(`批量删除失败: ${error.message}`)
    } finally {
      setBatchDeleting(false)
    }
  }

  const handleRenameDoc = (doc) => {
    setRenameModal({
      isOpen: true,
      doc,
      initialValue: doc.name,
      isSubmitting: false,
    })
  }

  const handleConfirmRename = async (newName) => {
    if (!newName || newName === renameModal.initialValue) {
      setRenameModal((prev) => ({ ...prev, isOpen: false }))
      return
    }

    setRenameModal((prev) => ({ ...prev, isSubmitting: true }))
    try {
      await updateDocument(dataset.id, renameModal.doc.id, newName)
      loadDocs()
      setRenameModal((prev) => ({ ...prev, isOpen: false }))
    } catch (error) {
      alert(`重命名失败: ${error.message}`)
      setRenameModal((prev) => ({ ...prev, isSubmitting: false }))
    }
  }

  const handleViewDoc = async (doc) => {
    try {
      const blob = await getDocumentFile(dataset.id, doc.id)
      const url = URL.createObjectURL(blob)
      setViewingDoc({
        ...doc,
        url,
        type: doc.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'text',
        suffix: doc.name.split('.').pop()?.toLowerCase(),
      })
    } catch (error) {
      alert(`无法预览文件: ${error.message}`)
    }
  }

  return (
    <div className="relative mx-auto h-full max-w-6xl p-8">
      {viewingDoc && (
        <DocumentViewer
          doc={viewingDoc}
          datasetId={dataset.id}
          onClose={() => {
            URL.revokeObjectURL(viewingDoc.url)
            setViewingDoc(null)
          }}
        />
      )}

      <button onClick={onBack} className="mb-4 flex items-center gap-1 text-slate-500 transition-colors hover:text-slate-800">
        <ChevronLeft size={16} /> 返回知识库列表
      </button>

      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
            <Database className="text-blue-500" size={24} />
            {dataset.name}
            <button
              onClick={() => setSettingsModal((prev) => ({ ...prev, isOpen: true }))}
              className="ml-2 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
              title="设置"
            >
              <Settings size={20} />
            </button>
          </h2>
          <p className="mt-1 select-all font-mono text-sm text-slate-500">ID: {dataset.id}</p>
        </div>
        <div className="relative flex gap-2">
          {selectedDocs.length > 0 && (
            <button
              onClick={handleBatchDeleteDocs}
              disabled={batchDeleting}
              className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
            >
              {batchDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              批量删除 ({selectedDocs.length})
            </button>
          )}
          <div className="relative">
            <input type="file" onChange={handleFileUpload} className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0" disabled={uploading} />
            <button className="flex h-full items-center gap-2 rounded-lg bg-blue-600 px-6 py-2 text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50">
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              上传文件
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50 font-medium text-slate-500">
            <tr>
              <th className="w-12 px-6 py-4">
                <input
                  type="checkbox"
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  checked={docs.length > 0 && selectedDocs.length === docs.length}
                  onChange={(event) => setSelectedDocs(event.target.checked ? docs.map((item) => item.id) : [])}
                  disabled={docs.length === 0}
                />
              </th>
              <th className="px-6 py-4">文件名</th>
              <th className="px-6 py-4">上传时间</th>
              <th className="px-6 py-4">分块数</th>
              <th className="px-6 py-4">状态</th>
              <th className="px-6 py-4 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                  <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />
                  加载中...
                </td>
              </tr>
            ) : docs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                  暂无文档，请上传文件
                </td>
              </tr>
            ) : (
              docs.map((doc) => (
                <tr key={doc.id} className={cn('transition-colors hover:bg-slate-50', selectedDocs.includes(doc.id) && 'bg-blue-50/50')}>
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      checked={selectedDocs.includes(doc.id)}
                      onChange={() => setSelectedDocs((prev) => prev.includes(doc.id) ? prev.filter((id) => id !== doc.id) : [...prev, doc.id])}
                    />
                  </td>
                  <td className="flex items-center gap-2 px-6 py-4 font-medium text-slate-700">
                    <FileText size={16} className="text-slate-400" />
                    <button onClick={() => handleViewDoc(doc)} className="text-left hover:text-blue-600 hover:underline">
                      {doc.name}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-slate-500">{new Date(doc.create_time).toLocaleString()}</td>
                  <td className="px-6 py-4 font-mono text-slate-500">{doc.chunk_count !== undefined ? doc.chunk_count : '-'}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <span
                        className={cn(
                          'w-fit rounded-full px-2 py-1 text-xs font-medium',
                          (doc.run === 'DONE' || doc.run_status === '1') ? 'bg-emerald-100 text-emerald-700' :
                            (doc.progress > 0 && doc.progress < 1) ? 'bg-amber-100 text-amber-700' :
                              (doc.run === '1') ? 'bg-amber-100 text-amber-700' :
                                'bg-slate-100 text-slate-500'
                        )}
                      >
                        {parsingId === doc.id ? (
                          <span className="flex items-center gap-1">
                            <Loader2 size={10} className="animate-spin" />
                            解析中…
                          </span>
                        ) : (doc.run === 'DONE' || doc.run_status === '1') ? '已解析' :
                            (doc.progress > 0 && doc.progress < 1) ? `解析中 ${Math.round(doc.progress * 100)}%` :
                              (doc.run === '1') ? '解析中…' :
                                parsingError ? '解析失败' : '未解析'}
                      </span>
                      {parsingError && parsingId === null && (
                        <span className="max-w-40 truncate text-xs text-red-500" title={parsingError}>
                          {parsingError}
                        </span>
                      )}
                      {(parsingId === doc.id || (doc.progress > 0 && doc.progress < 1)) && (
                        <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full animate-pulse bg-blue-500"
                            style={{ width: doc.progress > 0 ? `${doc.progress * 100}%` : '100%' }}
                          />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleParseDoc(doc.id)}
                        disabled={parsingId === doc.id || (doc.progress > 0 && doc.progress < 1)}
                        className="rounded-lg p-2 text-blue-600 transition-colors hover:bg-blue-50 disabled:opacity-50"
                        title="解析文档"
                      >
                        {parsingId === doc.id ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                      </button>
                      <button onClick={() => handleRenameDoc(doc)} className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100" title="重命名">
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteDoc(doc.id)}
                        disabled={deletingId === doc.id}
                        className="rounded-lg p-2 text-red-600 transition-colors hover:bg-red-50"
                        title="删除文档"
                      >
                        {deletingId === doc.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <RenameModal
        isOpen={renameModal.isOpen}
        title="重命名文件"
        initialValue={renameModal.initialValue}
        isSubmitting={renameModal.isSubmitting}
        onClose={() => setRenameModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={handleConfirmRename}
      />
      <SettingsModal
        isOpen={settingsModal.isOpen}
        dataset={dataset}
        isSubmitting={settingsModal.isSubmitting}
        onClose={() => setSettingsModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={handleUpdateSettings}
      />
    </div>
  )
}

export default function KnowledgePage({ currentRole }) {
  const [datasets, setDatasets] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newDatasetName, setNewDatasetName] = useState('')
  const [newDatasetShared, setNewDatasetShared] = useState(false)
  const [viewingDataset, setViewingDataset] = useState(null)
  const [selectedDatasets, setSelectedDatasets] = useState([])
  const [batchDeleting, setBatchDeleting] = useState(false)
  const [renameModal, setRenameModal] = useState({
    isOpen: false,
    dataset: null,
    initialValue: '',
    initialDescription: '',
    isSubmitting: false,
  })
  const [shareModal, setShareModal] = useState({
    isOpen: false,
    dataset: null,
    isShared: false,
    isSubmitting: false,
  })
  const [scrollGroupId, setScrollGroupId] = useState(null)
  const [datasetGroups, setDatasetGroups] = useState([])
  const [showAssignPanel, setShowAssignPanel] = useState(false)
  const [activeId, setActiveId] = useState(null)
  const [overGroupId, setOverGroupId] = useState(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const loadGroups = useCallback(async () => {
    try {
      const res = await apiFetch('/v1/user/settings?type=knowledge')
      if (!res.ok) return
      const data = await res.json()
      if (Array.isArray(data)) {
        setDatasetGroups(data)
      } else if (Array.isArray(data?.knowledge)) {
        setDatasetGroups(data.knowledge)
      } else {
        setDatasetGroups([])
      }
    } catch {
      setDatasetGroups([])
    }
  }, [])

  const saveGroups = useCallback(async (newGroups) => {
    setDatasetGroups(newGroups)
    try {
      await apiFetch('/v1/user/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ knowledge: newGroups }),
      })
    } catch {
      // ignore save failures to avoid blocking the page
    }
  }, [])

  const loadData = useCallback(() => {
    setLoading(true)
    setSelectedDatasets([])
    fetchDatasets()
      .then((data) => setDatasets(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadGroups()
  }, [loadGroups])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (!scrollGroupId) return
    const target = document.getElementById(`knowledge-group-${scrollGroupId}`)
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [scrollGroupId])

  const manageableDatasets = useMemo(
    () => datasets.filter((item) => item?.manageable !== false),
    [datasets]
  )

  const navGroups = useMemo(() => {
    const groupedIds = new Set(datasetGroups.flatMap((group) => group.items || []))
    const ungroupedCount = datasets.filter((item) => !groupedIds.has(item.id)).length
    return [
      ...datasetGroups.map((group) => ({
        id: group.id,
        name: group.name,
        count: datasets.filter((item) => (group.items || []).includes(item.id)).length,
      })),
      ...(ungroupedCount > 0 ? [{ id: '__ungrouped__', name: '未分组', count: ungroupedCount }] : []),
    ]
  }, [datasetGroups, datasets])

  const sectionGroups = useMemo(() => {
    const groupedIds = new Set(datasetGroups.flatMap((group) => group.items || []))
    const ungrouped = datasets.filter((item) => !groupedIds.has(item.id))
    return [
      ...datasetGroups.map((group) => ({
        id: group.id,
        name: group.name,
        count: datasets.filter((item) => (group.items || []).includes(item.id)).length,
      })),
      ...(ungrouped.length > 0 ? [{ id: '__ungrouped__', name: '未分组', count: ungrouped.length }] : []),
    ]
  }, [datasetGroups, datasets])

  const handleCreate = async () => {
    if (!newDatasetName.trim()) return
    setCreating(true)
    try {
      await createDataset(newDatasetName, newDatasetShared)
      setNewDatasetName('')
      setNewDatasetShared(false)
      loadData()
    } catch (error) {
      alert(`创建失败: ${error.message}`)
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id, event) => {
    event?.stopPropagation()
    if (!window.confirm('确定要删除这个知识库吗？此操作不可恢复。')) return
    try {
      await deleteDataset(id)
      loadData()
    } catch (error) {
      alert(`删除失败: ${error.message}`)
    }
  }

  const handleConfirmRename = async (newName, newDescription) => {
    if (!newName || (newName === renameModal.initialValue && newDescription === renameModal.initialDescription)) {
      setRenameModal((prev) => ({ ...prev, isOpen: false }))
      return
    }

    setRenameModal((prev) => ({ ...prev, isSubmitting: true }))
    try {
      await updateDataset(renameModal.dataset.id, newName, newDescription)
      loadData()
      setRenameModal((prev) => ({ ...prev, isOpen: false }))
    } catch (error) {
      alert(`修改失败: ${error.message}`)
      setRenameModal((prev) => ({ ...prev, isSubmitting: false }))
    }
  }

  const handleConfirmShare = async (isShared) => {
    setShareModal((prev) => ({ ...prev, isSubmitting: true }))
    try {
      await updateDatasetShare(shareModal.dataset.id, isShared)
      loadData()
      setShareModal((prev) => ({ ...prev, isOpen: false }))
    } catch (error) {
      alert(`更新失败: ${error.message}`)
      setShareModal((prev) => ({ ...prev, isSubmitting: false }))
    }
  }

  const handleBatchDelete = async () => {
    if (selectedDatasets.length === 0) return
    if (!window.confirm(`确定要删除选中的 ${selectedDatasets.length} 个知识库吗？此操作不可恢复。`)) return

    setBatchDeleting(true)
    try {
      const result = await deleteDatasets(selectedDatasets)
      if (result?.partial && Array.isArray(result.results)) {
        const deletedIds = result.results.filter((item) => item.ok).map((item) => item.id)
        setDatasets((prev) => prev.filter((item) => !deletedIds.includes(item.id)))
        const failedCount = result.results.filter((item) => !item.ok).length
        if (failedCount > 0) {
          alert(`已删除 ${deletedIds.length} 个知识库，${failedCount} 个删除失败。`)
        }
      } else {
        loadData()
      }
      setSelectedDatasets([])
    } catch (error) {
      alert(`批量删除失败: ${error.message}`)
      loadData()
    } finally {
      setBatchDeleting(false)
    }
  }

  const handleAssignToGroup = (groupId) => {
    if (selectedDatasets.length === 0) return
    const next = datasetGroups.map((group) => {
      if (group.id !== groupId) return group
      const existing = new Set(group.items || [])
      selectedDatasets.forEach((id) => existing.add(id))
      return { ...group, items: [...existing] }
    })
    saveGroups(next)
    setSelectedDatasets([])
    setShowAssignPanel(false)
  }

  const handleRemoveFromGroup = (groupId, datasetId) => {
    saveGroups(datasetGroups.map((group) => (
      group.id === groupId ? { ...group, items: (group.items || []).filter((id) => id !== datasetId) } : group
    )))
  }

  const handleCreateGroup = () => {
    const name = window.prompt('输入分组名称：')
    if (!name || !name.trim()) return
    saveGroups([...datasetGroups, { id: `group_${Date.now()}`, name: name.trim(), items: [] }])
  }

  if (viewingDataset) {
    return (
      <div className="h-full overflow-hidden bg-[#f5f5f7]" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif' }}>
        <DatasetDetail
          dataset={viewingDataset}
          onBack={() => {
            setViewingDataset(null)
            loadData()
          }}
          onUpdate={loadData}
        />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-[#f5f5f7]" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif' }}>
      <div className="shrink-0 border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">知识库管理</h2>
            <p className="mt-1 text-sm text-gray-500">创建和管理知识库</p>
          </div>
          <div className="flex items-center gap-3">
            {manageableDatasets.length > 0 && (
              <button onClick={() => setSelectedDatasets(selectedDatasets.length === manageableDatasets.length ? [] : manageableDatasets.map((item) => item.id))} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900">
                {selectedDatasets.length === manageableDatasets.length ? '取消全选' : '全选'}
              </button>
            )}
            {selectedDatasets.length > 0 && (
              <>
                <button onClick={() => setShowAssignPanel(true)} className="rounded-lg border border-blue-200 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50">
                  加入分组 ({selectedDatasets.length})
                </button>
                <button onClick={handleBatchDelete} disabled={batchDeleting} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50">
                  {batchDeleting ? <Loader2 size={14} className="mr-1 inline animate-spin" /> : null}
                  删除 ({selectedDatasets.length})
                </button>
              </>
            )}
            <input
              type="text"
              placeholder="新知识库名称"
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400"
              value={newDatasetName}
              onChange={(event) => setNewDatasetName(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && handleCreate()}
            />
            <label className="flex cursor-pointer select-none items-center gap-1.5 text-sm text-gray-600">
              <input type="checkbox" checked={newDatasetShared} onChange={(event) => setNewDatasetShared(event.target.checked)} className="rounded" />
              共享
            </label>
            <button onClick={handleCreate} disabled={creating || !newDatasetName.trim()} className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
              新建
            </button>
          </div>
        </div>
      </div>

      <GroupNavBar
        groups={navGroups}
        onGroupClick={setScrollGroupId}
        onCreateGroup={handleCreateGroup}
        onRenameGroup={(groupId, newName) => saveGroups(datasetGroups.map((group) => group.id === groupId ? { ...group, name: newName } : group))}
        onDeleteGroup={(groupId) => saveGroups(datasetGroups.filter((group) => group.id !== groupId))}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={rectIntersection}
        onDragStart={({ active }) => setActiveId(String(active.id))}
        onDragOver={({ over }) => {
          if (!over) {
            setOverGroupId(null)
            return
          }
          const match = String(over.id).match(/^droppable-group_(.+)$/)
          setOverGroupId(match ? match[1] : null)
        }}
        onDragEnd={({ active, over }) => {
          if (over && active) {
            const draggedId = String(active.id)
            const match = String(over.id).match(/^droppable-group_(.+)$/)
            if (match) {
              const targetGroupId = match[1]
              if (targetGroupId === '__ungrouped__') {
                saveGroups(datasetGroups.map((group) => ({ ...group, items: (group.items || []).filter((id) => id !== draggedId) })))
              } else {
                saveGroups(datasetGroups.map((group) => {
                  if (group.id === targetGroupId) {
                    return group.items?.includes(draggedId)
                      ? group
                      : { ...group, items: [...(group.items || []), draggedId] }
                  }
                  return { ...group, items: (group.items || []).filter((id) => id !== draggedId) }
                }))
              }
            }
          }
          setActiveId(null)
          setOverGroupId(null)
        }}
      >
        <div className="scroll-container flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : datasets.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-gray-400">
              <Database size={48} className="mb-4 text-gray-300" />
              <p className="text-sm">暂无知识库</p>
            </div>
          ) : sectionGroups.length === 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {datasets.map((dataset) => (
                <DraggableDatasetCard
                  key={dataset.id}
                  dataset={dataset}
                  currentRole={currentRole}
                  selected={selectedDatasets.includes(dataset.id)}
                  selectionMode={selectedDatasets.length > 0}
                  onSelect={(id) => setSelectedDatasets((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id])}
                  onClick={() => {
                    if (dataset?.manageable === false) {
                      alert('该知识库不是你创建的，仅可查看存在')
                      return
                    }
                    setViewingDataset(dataset)
                  }}
                  onDelete={handleDelete}
                  onRename={(target, event) => {
                    event?.stopPropagation()
                    setRenameModal({
                      isOpen: true,
                      dataset: target,
                      initialValue: target.name,
                      initialDescription: target.description || '',
                      isSubmitting: false,
                    })
                  }}
                  onShare={(target, event) => {
                    event?.stopPropagation()
                    setShareModal({ isOpen: true, dataset: target, isShared: !!target.isShared, isSubmitting: false })
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-0">
              {sectionGroups.map((group) => {
                const items = datasets.filter((dataset) => {
                  if (group.id === '__ungrouped__') {
                    const groupedIds = new Set(datasetGroups.flatMap((entry) => entry.items || []))
                    return !groupedIds.has(dataset.id)
                  }
                  const currentGroup = datasetGroups.find((entry) => entry.id === group.id)
                  return currentGroup ? (currentGroup.items || []).includes(dataset.id) : false
                })

                return (
                  <DroppableGroupSection
                    key={group.id}
                    groupId={group.id}
                    groupName={group.name}
                    items={items}
                    overGroupId={overGroupId}
                    isDragging={!!activeId}
                    onRemove={(item) => handleRemoveFromGroup(group.id, item.id)}
                    renderCard={(dataset) => (
                      <DraggableDatasetCard
                        dataset={dataset}
                        currentRole={currentRole}
                        selected={selectedDatasets.includes(dataset.id)}
                        selectionMode={selectedDatasets.length > 0}
                        onSelect={(id) => setSelectedDatasets((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id])}
                        onClick={() => {
                          if (dataset?.manageable === false) {
                            alert('该知识库不是你创建的，仅可查看存在')
                            return
                          }
                          setViewingDataset(dataset)
                        }}
                        onDelete={handleDelete}
                        onRename={(target, event) => {
                          event?.stopPropagation()
                          setRenameModal({
                            isOpen: true,
                            dataset: target,
                            initialValue: target.name,
                            initialDescription: target.description || '',
                            isSubmitting: false,
                          })
                        }}
                        onShare={(target, event) => {
                          event?.stopPropagation()
                          setShareModal({ isOpen: true, dataset: target, isShared: !!target.isShared, isSubmitting: false })
                        }}
                      />
                    )}
                  />
                )
              })}
            </div>
          )}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeId ? (
            <div className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 opacity-90 shadow-xl">
              {datasets.find((item) => String(item.id) === activeId)?.name || activeId}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {showAssignPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-80 overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b bg-slate-50 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-700">选择分组</h3>
              <button onClick={() => setShowAssignPanel(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>
            <div className="max-h-64 space-y-2 overflow-y-auto p-4">
              {datasetGroups.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">暂无分组，请先创建分组</p>
              ) : datasetGroups.map((group) => (
                <button
                  key={group.id}
                  onClick={() => handleAssignToGroup(group.id)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-blue-50"
                >
                  <Folder size={14} className="text-blue-500" />
                  <span className="flex-1">{group.name}</span>
                  <span className="text-xs text-slate-400">({(group.items || []).length})</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <ShareModal
        isOpen={shareModal.isOpen}
        dataset={shareModal.dataset}
        isShared={shareModal.isShared}
        isSubmitting={shareModal.isSubmitting}
        onClose={() => setShareModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={handleConfirmShare}
      />
      <RenameModal
        isOpen={renameModal.isOpen}
        title="编辑知识库"
        initialValue={renameModal.initialValue}
        initialDescription={renameModal.initialDescription}
        isSubmitting={renameModal.isSubmitting}
        onClose={() => setRenameModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={handleConfirmRename}
      />
    </div>
  )
}
