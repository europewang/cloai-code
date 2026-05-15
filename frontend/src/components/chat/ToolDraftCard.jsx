import { Download } from 'lucide-react'

// 技能草稿卡片只负责展示参数、文件和执行结果，不感知上层业务状态来源。
export function ToolDraftCard({
  toolDraft,
  toolForms,
  toolPending,
  toolResults,
  onArgChange,
  onFileChange,
  onApprove,
  appendAuthToken,
}) {
  if (!toolDraft) return null

  const toolCallId = toolDraft.toolCallId
  const toolForm = toolForms?.[toolCallId] || {}
  const toolResult = toolResults?.[toolCallId] || null

  return (
    <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
      <div className="text-xs text-blue-700 font-semibold mb-2">
        已识别技能：{toolDraft.toolName}
      </div>
      <div className="text-xs text-slate-600 mb-3">
        {toolDraft.toolSpec?.description || '请填写参数并执行'}
      </div>

      {toolDraft.toolSpec?.parameters_schema?.properties && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
          {Object.keys(toolDraft.toolSpec.parameters_schema.properties).map((key) => (
            <input
              key={key}
              value={toolForm?.args?.[key] || ''}
              onChange={(e) => onArgChange(toolCallId, key, e.target.value)}
              placeholder={key}
              className="px-2 py-1.5 rounded border border-slate-300 text-xs bg-white"
            />
          ))}
        </div>
      )}

      {toolDraft.toolSpec?.upload_required && (
        <div className="mb-3">
          <div className="text-[11px] text-slate-500 mb-1">
            支持文件：{(toolDraft.toolSpec.accepted_file_types || []).join(', ') || '不限'}
          </div>
          <input
            type="file"
            multiple
            onChange={(e) => onFileChange(toolCallId, e.target.files)}
            className="text-xs"
          />
          {toolForm?.files?.length > 0 && (
            <div className="mt-1 text-[11px] text-slate-600">
              已选择 {toolForm.files.length} 个文件
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => onApprove(toolDraft)}
        disabled={!!toolPending?.[toolCallId]}
        className="px-3 py-1.5 rounded bg-blue-600 text-white text-xs hover:bg-blue-700 disabled:opacity-50"
      >
        {toolPending?.[toolCallId] ? '执行中...' : '执行技能'}
      </button>

      {toolResult && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2">
          <div className="text-xs font-semibold text-emerald-700">
            {toolResult.summary || '执行完成'}
          </div>
          {toolResult.error_message && (
            <div className="text-xs text-rose-600 mt-1">
              {toolResult.error_message}
            </div>
          )}
          {toolResult.files && toolResult.files.length > 0 && (
            <div className="mt-2 space-y-1">
              {toolResult.files.map((file) => (
                <a
                  key={file.file_id}
                  href={appendAuthToken(file.download_url)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-blue-700 hover:underline"
                >
                  <Download size={12} />
                  <span>{file.file_name}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
