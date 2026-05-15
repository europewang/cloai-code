import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function MarkdownWithCitations({ content, references, onViewReference }) {
  if (!content) return null

  const formattedContent = content
    .replace(/\[(?:ID:\s*)?(\d+)\]/gi, (match, id) => ` [${parseInt(id, 10) + 1}](#citation-${id})`)
    .replace(/\[(?:引用来源|来源)\s*(\d+)\]/gi, (match, id) => {
      const oneBased = Number.parseInt(id, 10)
      if (!Number.isFinite(oneBased) || oneBased <= 0) return match
      const zeroBased = oneBased - 1
      return ` [${oneBased}](#citation-${zeroBased})`
    })

  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        pre: ({ _node, ...props }) => <div className="overflow-auto w-full my-2 bg-slate-800 text-slate-100 p-2 rounded" {...props} />,
        code: ({ _node, ...props }) => <code className="bg-slate-100 text-slate-800 px-1 py-0.5 rounded text-xs" {...props} />,
        table: ({ _node, ...props }) => (
          <div className="overflow-x-auto my-4">
            <table className="min-w-full border-collapse border border-slate-300 text-sm" {...props} />
          </div>
        ),
        thead: ({ _node, ...props }) => <thead className="bg-slate-100" {...props} />,
        th: ({ _node, ...props }) => <th className="border border-slate-300 px-3 py-2 text-left font-semibold" {...props} />,
        td: ({ _node, ...props }) => <td className="border border-slate-300 px-3 py-2" {...props} />,
        a: ({ _node, href, children, ...props }) => {
          if (href?.startsWith('#citation-')) {
            const index = parseInt(href.replace('#citation-', ''))
            const ref = references?.[index]
            if (ref) {
              return (
                <button
                  onClick={(e) => { e.preventDefault(); onViewReference(ref) }}
                  className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 ml-0.5 text-[10px] font-bold text-blue-600 bg-blue-50 rounded-full border border-blue-200 hover:bg-blue-100 align-top transition-colors transform -translate-y-0.5 cursor-pointer select-none"
                  title={ref.document_name}
                >
                  {index + 1}
                </button>
              )
            }
            return <span className="text-gray-400 text-[10px] ml-0.5">[{index + 1}]</span>
          }
          return <a href={href} className="text-blue-600 hover:underline" {...props}>{children}</a>
        },
      }}
    >
      {formattedContent}
    </Markdown>
  )
}
