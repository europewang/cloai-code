import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'
import { FolderOpen, Loader2, Paperclip, Send } from 'lucide-react'

function cn(...inputs) {
  return twMerge(clsx(inputs))
}

// 输入区组件专注于文本、附件和 @技能候选，不持有业务状态。
export function ChatComposer({
  inputRef,
  input,
  setInput,
  conversationLoading,
  loading,
  uploadedFiles,
  removeUploadedFile,
  mentionOpen,
  mentionCandidates,
  mentionIndex,
  getToolDisplayLabel,
  closeMention,
  resolveMentionContext,
  setMentionOpen,
  setMentionQuery,
  setMentionStart,
  setMentionEnd,
  setMentionIndex,
  applyMentionTool,
  handleSend,
  handleSendButtonClick,
  handleFileDrop,
  handleFileSelect,
  handleFolderSelect,
}) {
  return (
    <div className="p-4 bg-white border-t">
      <div className="relative">
        {uploadedFiles.length > 0 && (
          <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex flex-wrap gap-2">
              {uploadedFiles.map((file, idx) => (
                <div key={`${file.name}-${idx}`} className="flex items-center gap-1 bg-white px-2 py-1 rounded border text-xs">
                  <span className="text-slate-600 max-w-[120px] truncate">{file.name}</span>
                  <span className="text-slate-400">({(file.size / 1024).toFixed(1)}KB)</span>
                  <button
                    onClick={() => removeUploadedFile(idx)}
                    className="text-red-500 hover:text-red-700 ml-1"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => {
            const nextValue = e.target.value
            setInput(nextValue)
            const ctx = resolveMentionContext(nextValue, e.target.selectionStart ?? nextValue.length)
            if (!ctx) {
              closeMention()
              return
            }
            setMentionOpen(true)
            setMentionQuery(ctx.query)
            setMentionStart(ctx.start)
            setMentionEnd(ctx.end)
            setMentionIndex(0)
          }}
          onKeyDown={(e) => {
            if (mentionOpen && mentionCandidates.length > 0) {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setMentionIndex(prev => (prev + 1) % mentionCandidates.length)
                return
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setMentionIndex(prev => (prev - 1 + mentionCandidates.length) % mentionCandidates.length)
                return
              }
              if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                e.preventDefault()
                applyMentionTool(mentionCandidates[mentionIndex] || mentionCandidates[0])
                return
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                closeMention()
                return
              }
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          onBlur={() => {
            setTimeout(() => closeMention(), 120)
          }}
          onDragOver={(e) => {
            e.preventDefault()
            e.currentTarget.classList.add('border-blue-400', 'bg-blue-50')
          }}
          onDragLeave={(e) => {
            e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50')
          }}
          onDrop={(e) => {
            e.preventDefault()
            e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50')
            handleFileDrop(e)
          }}
          placeholder="请输入您的问题...（可拖拽文件到此处上传）"
          className="w-full pl-4 pr-24 py-3 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none h-[80px] text-sm transition-colors"
          disabled={conversationLoading}
        />

        {mentionOpen && mentionCandidates.length > 0 && (
          <div className="absolute left-0 right-14 bottom-[88px] rounded-lg border border-slate-200 bg-white shadow-lg z-20 max-h-56 scroll-container">
            {mentionCandidates.map((tool, idx) => (
              <button
                key={tool.name || `${tool.displayName}-${idx}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  applyMentionTool(tool)
                }}
                className={cn(
                  'w-full text-left px-3 py-2 border-b last:border-b-0',
                  idx === mentionIndex ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-700'
                )}
              >
                <div className="text-xs font-medium">{getToolDisplayLabel(tool) || tool.name}</div>
                <div className="text-[11px] text-slate-500 truncate">{tool.description || tool.name}</div>
              </button>
            ))}
          </div>
        )}

        <div className="absolute right-12 top-2 flex items-center gap-1">
          <label className="p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors" title="上传文件">
            <input
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <Paperclip size={18} />
          </label>
          <label className="p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors" title="上传文件夹">
            <input
              type="file"
              multiple
              webkitdirectory=""
              onChange={handleFolderSelect}
              className="hidden"
            />
            <FolderOpen size={18} />
          </label>
        </div>

        <button
          onClick={handleSendButtonClick}
          disabled={conversationLoading || (!loading && !input.trim() && uploadedFiles.length === 0)}
          className="absolute right-2 top-2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
        >
          {(loading || conversationLoading) ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </div>

      <p className="text-[11px] text-slate-400 mt-1">输入 `@` 可选择技能名称，支持拖拽上传文件。</p>
      <p className="text-center text-xs text-slate-400 mt-2">
        AI 生成内容仅供参考，请以原始文档为准。
      </p>
    </div>
  )
}
