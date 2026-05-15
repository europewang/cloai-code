import { useEffect, useState } from 'react'
import { Brain } from 'lucide-react'
import { MarkdownWithCitations } from './MarkdownWithCitations'

export function ThoughtBlock({ content, references, onViewReference, isStreaming }) {
  const [expanded, setExpanded] = useState(true)

  useEffect(() => {
    if (isStreaming) {
      setExpanded(true)
    } else {
      setExpanded(false)
    }
  }, [isStreaming])

  return (
    <div className="mb-4 rounded-lg overflow-hidden border border-amber-200 bg-amber-50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-amber-100/50 hover:bg-amber-100 transition-colors text-xs font-semibold text-amber-700 uppercase tracking-wide select-none"
      >
        <Brain size={14} className="text-amber-600" />
        <span>深度思考过程 (Deep Thinking)</span>
        <span className="ml-auto text-amber-500 text-[10px]">
          {expanded ? '收起' : '展开'}
        </span>
      </button>

      {expanded && (
        <div className="p-3 text-sm text-slate-600 italic leading-relaxed border-t border-amber-100 bg-white/50">
          <MarkdownWithCitations
            content={content}
            references={references}
            onViewReference={onViewReference}
          />
        </div>
      )}
    </div>
  )
}
