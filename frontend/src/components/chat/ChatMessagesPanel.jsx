import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'
import { BookOpen, Bot, ChevronDown, FileText, Loader2, Paperclip, User } from 'lucide-react'
import { ToolDraftCard } from './ToolDraftCard'

function cn(...inputs) {
  return twMerge(clsx(inputs))
}

// 消息流容器负责滚动、头像布局和消息外壳，具体内容由上层 render 函数注入。
export function ChatMessagesPanel({
  messages,
  messageLoadingMore,
  messagesContainerRef,
  handleMessagesScroll,
  messagesEndRef,
  showScrollToBottom,
  handleScrollToBottom,
  setViewingRef,
  setMentionOpen,
  ToolDraftProps,
  renderPlanDraft,
  renderClarify,
  renderMessageMainContent,
  appendAuthToken,
}) {
  return (
    <>
      <div
        ref={messagesContainerRef}
        onScroll={handleMessagesScroll}
        className="flex-1 scroll-container p-4 space-y-6 scroll-smooth"
      >
        {messageLoadingMore && (
          <div className="text-center text-[11px] text-slate-400 flex items-center justify-center gap-1">
            <Loader2 size={12} className="animate-spin" />
            加载更早消息...
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={msg.id || idx} className={cn('flex gap-4', msg.role === 'user' ? 'flex-row-reverse' : '')}>
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm',
              msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-emerald-500 text-white'
            )}>
              {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
            </div>

            <div className={cn(
              'px-5 py-3 rounded-2xl max-w-[85%] text-sm leading-relaxed shadow-sm',
              msg.role === 'user'
                ? 'bg-blue-600 text-white rounded-tr-sm'
                : 'bg-white border border-slate-100 text-slate-700 rounded-tl-sm'
            )}>
              {msg.isFile && (
                <div className="mb-2 flex items-center gap-2 text-xs text-slate-600">
                  <Paperclip size={14} className="text-blue-500" />
                  <span>已上传文件:</span>
                  <span className="font-medium">{msg.fileNames?.join(', ')}</span>
                </div>
              )}

              {msg.attachments && msg.attachments.length > 0 && !msg.isFile && (
                <div className="mb-2 flex items-center gap-2 text-xs text-slate-600">
                  <Paperclip size={14} className="text-blue-500" />
                  <span>附件:</span>
                  <span className="font-medium">{msg.attachments.map(a => a.name).join(', ')}</span>
                </div>
              )}

              {msg.toolDraft && (
                <ToolDraftCard
                  {...ToolDraftProps}
                  toolDraft={msg.toolDraft}
                  appendAuthToken={appendAuthToken}
                />
              )}

              {renderClarify?.(msg)}
              {renderPlanDraft?.(msg)}
              {renderMessageMainContent?.(msg)}

              {msg.outputFiles && msg.outputFiles.length > 0 && !msg.isStreaming && (
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <div className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1">
                    <FileText size={14} />
                    下载文件
                  </div>
                  <div className="flex flex-col gap-1">
                    {msg.outputFiles.map((file, fileIndex) => (
                      <a
                        key={`${file.file_name}-${fileIndex}`}
                        href={appendAuthToken(file.download_url)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 p-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-left transition-colors"
                      >
                        <FileText size={14} className="text-blue-600" />
                        <span className="text-xs text-blue-700 flex-1 truncate">{file.file_name}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {msg.references && msg.references.length > 0 && !msg.isStreaming && (
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <div className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1">
                    <BookOpen size={14} />
                    参考资料
                  </div>
                  <div className="flex flex-col gap-2">
                    {msg.references.map((ref, refIndex) => (
                      <button
                        key={`${ref.document_name || 'ref'}-${refIndex}`}
                        onClick={() => setViewingRef(ref)}
                        className="flex items-start gap-2 p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-left transition-colors group"
                      >
                        <FileText size={16} className="text-blue-500 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-slate-700 group-hover:text-blue-700 truncate">
                            {ref.document_name}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2">
                            <span className="bg-slate-200 px-1.5 rounded text-slate-600">
                              {(ref.similarity * 100).toFixed(0)}%
                            </span>
                            <span className="truncate max-w-[200px]">
                              {ref.content ? `${ref.content.slice(0, 50)}...` : 'No preview'}
                            </span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {showScrollToBottom && (
        <button
          onClick={handleScrollToBottom}
          className="absolute left-1/2 -translate-x-1/2 bottom-28 z-20 inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-slate-200 bg-white/95 shadow hover:bg-slate-50 text-xs text-slate-700"
          title="回到底部"
        >
          <ChevronDown size={14} />
          回到底部
        </button>
      )}
    </>
  )
}
