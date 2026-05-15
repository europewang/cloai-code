import { useEffect, useRef, useState } from 'react'
import { X, FileText, Image as ImageIcon, Loader2, ZoomOut, ZoomIn } from 'lucide-react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'
import { Document, Page, pdfjs } from 'react-pdf'
import { apiFetch } from '../../lib/appApi'

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function SourceViewer({ reference, onClose }) {
  const [activeTab, setActiveTab] = useState('summary')
  const [numPages, setNumPages] = useState(null)
  const [scale, setScale] = useState(1.0)
  const [imageError, setImageError] = useState(false)
  const [pdfUrl, setPdfUrl] = useState('')
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfLoadError, setPdfLoadError] = useState('')
  const pdfUrlRef = useRef('')

  useEffect(() => {
    setActiveTab('summary')
    setImageError(false)
    setScale(1.0)
    setNumPages(null)
    setPdfLoadError('')
    if (pdfUrlRef.current) {
      URL.revokeObjectURL(pdfUrlRef.current)
      pdfUrlRef.current = ''
    }
    setPdfUrl('')
  }, [reference])

  useEffect(() => {
    if (activeTab !== 'pdf' || !reference?.document_id) return
    let disposed = false
    let nextPdfUrl = ''
    setPdfLoading(true)
    setPdfLoadError('')
    ;(async () => {
      try {
        const res = await apiFetch(`/document/get/${encodeURIComponent(reference.document_id)}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        if (!blob || blob.size === 0) throw new Error('EMPTY_BLOB')
        nextPdfUrl = URL.createObjectURL(blob)
        if (disposed) {
          URL.revokeObjectURL(nextPdfUrl)
          return
        }
        if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current)
        pdfUrlRef.current = nextPdfUrl
        setPdfUrl(nextPdfUrl)
      } catch {
        if (!disposed) {
          setPdfLoadError('Failed to load PDF. Please check permissions.')
          if (pdfUrlRef.current) {
            URL.revokeObjectURL(pdfUrlRef.current)
            pdfUrlRef.current = ''
          }
          setPdfUrl('')
        }
      } finally {
        if (!disposed) setPdfLoading(false)
      }
    })()
    return () => {
      disposed = true
      if (nextPdfUrl) URL.revokeObjectURL(nextPdfUrl)
    }
  }, [activeTab, reference?.document_id])

  useEffect(() => {
    if (activeTab === 'pdf' && numPages && reference?.positions?.[0]) {
      setTimeout(() => {
        const pageNum = reference.positions[0][0]
        const pageElement = document.getElementById(`pdf-page-${pageNum}`)
        if (pageElement) pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }
  }, [activeTab, numPages, reference])

  if (!reference) return null

  const imageId = reference.image_id || reference.img_id
  const hasImage = !!imageId
  const hasPdf = !!reference.document_id

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-3 border-b flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-4 overflow-hidden">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2 text-sm truncate pr-4 max-w-[300px]">
              <FileText size={18} className="text-blue-600 flex-shrink-0" />
              <span className="truncate" title={reference.document_name}>{reference.document_name}</span>
            </h3>
            <div className="flex bg-slate-200 p-1 rounded-lg shrink-0">
              <button onClick={() => setActiveTab('summary')} className={cn('px-3 py-1 rounded-md text-xs font-medium transition-all', activeTab === 'summary' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700')}>Summary</button>
              {hasPdf && (
                <button onClick={() => setActiveTab('pdf')} className={cn('px-3 py-1 rounded-md text-xs font-medium transition-all', activeTab === 'pdf' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700')}>Full PDF</button>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-hidden relative bg-slate-100/50">
          {activeTab === 'summary' && (
            <div className="h-full scroll-container p-6">
              <div className="max-w-3xl mx-auto space-y-6">
                <div className="flex items-center gap-4 text-xs text-slate-500 uppercase tracking-wider font-semibold">
                  <span>Matched Content</span>
                  {reference.similarity && (
                    <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                      Score: {(reference.similarity * 100).toFixed(1)}%
                    </span>
                  )}
                </div>
                <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm text-slate-700 whitespace-pre-wrap leading-relaxed text-sm font-mono">
                  {reference.content_with_weight ? <div dangerouslySetInnerHTML={{ __html: reference.content_with_weight }} /> : (reference.content || 'No content preview available.')}
                </div>
                {hasImage && !imageError && (
                  <div className="space-y-2">
                    <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold flex items-center gap-2">
                      <ImageIcon size={14} />
                      <span>Page Snapshot</span>
                    </div>
                    <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-white group relative">
                      <img src={`/api/document/image/${imageId}`} alt="Document Snapshot" className="w-full h-auto object-contain max-h-[500px]" onError={() => setImageError(true)} />
                      {hasPdf && (
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <button onClick={() => setActiveTab('pdf')} className="px-4 py-2 bg-white text-slate-900 rounded-lg shadow-lg font-medium text-sm transform translate-y-2 group-hover:translate-y-0 transition-all">
                            View in PDF
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'pdf' && (
            <div className="h-full flex flex-col">
              <div className="p-2 border-b bg-white flex items-center justify-between shrink-0 z-10 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-slate-500 px-2">Total {numPages || '--'} Pages</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setScale(s => Math.max(0.5, s - 0.1))} className="p-1.5 hover:bg-slate-100 rounded"><ZoomOut size={16} /></button>
                  <span className="text-xs font-mono w-12 text-center select-none">{(scale * 100).toFixed(0)}%</span>
                  <button onClick={() => setScale(s => Math.min(2.0, s + 0.1))} className="p-1.5 hover:bg-slate-100 rounded"><ZoomIn size={16} /></button>
                </div>
              </div>
              <div className="flex-1 overflow-auto bg-slate-500/10 flex justify-center p-8">
                <Document
                  file={pdfUrl || undefined}
                  onLoadSuccess={({ numPages: pages }) => setNumPages(pages)}
                  className="shadow-xl flex flex-col gap-4"
                  loading={<div className="flex items-center gap-2 text-slate-500"><Loader2 className="animate-spin" /> Loading PDF...</div>}
                  error={<div className="text-red-500 text-sm p-4 bg-red-50 rounded">{pdfLoadError || 'Failed to load PDF. Please check permissions.'}</div>}
                >
                  {numPages && Array.from(new Array(numPages), (el, index) => {
                    const pageNum = index + 1
                    return (
                      <div key={`page_${pageNum}`} id={`pdf-page-${pageNum}`} className="relative">
                        <Page pageNumber={pageNum} scale={scale} renderTextLayer={false} renderAnnotationLayer={false} className="shadow-md">
                          {reference.positions && reference.positions.filter((pos) => pos[0] === pageNum).map((pos, idx) => {
                            const [p, xMin, xMax, yMin, yMax] = pos
                            return (
                              <div
                                key={`${pageNum}-${idx}`}
                                style={{
                                  position: 'absolute',
                                  left: xMin * scale,
                                  top: yMin * scale,
                                  width: (xMax - xMin) * scale,
                                  height: (yMax - yMin) * scale,
                                  backgroundColor: 'rgba(255, 255, 0, 0.2)',
                                  border: '1px solid rgba(255, 200, 0, 0.4)',
                                  pointerEvents: 'none',
                                }}
                              />
                            )
                          })}
                        </Page>
                      </div>
                    )
                  })}
                </Document>
                {pdfLoading && (
                  <div className="absolute top-4 right-4 px-3 py-1.5 rounded bg-white text-xs text-slate-500 border border-slate-200 shadow-sm">
                    PDF 加载中...
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
