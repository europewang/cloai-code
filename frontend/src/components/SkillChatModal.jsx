import { useEffect, useRef, useState } from 'react'
import { X, Zap, User, Bot, Loader2, Send } from 'lucide-react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'

function cn(...inputs) {
  return twMerge(clsx(inputs))
}

// 技能库中的即时对话弹窗，复用普通对话接口，但统一改写为“请使用 xxx 技能”。
export function SkillChatModal({ skill, onClose, apiFetch, authSession, onRecordSkillUsage }) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [conversationId, setConversationId] = useState(null)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const ensureConversation = async () => {
    if (conversationId) {
      return conversationId
    }
    const res = await apiFetch('/v1/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: `技能:${skill.displayName || skill.name}` }),
    })
    const data = await res.json()
    setConversationId(data.id)
    return data.id
  }

  const handleSend = async () => {
    if (!input.trim() || loading) return

    const text = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: text }])
    setLoading(true)
    setError('')

    try {
      const ensuredConversationId = await ensureConversation()
      const msgRes = await apiFetch(`/v1/conversations/${ensuredConversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'user', content: text }),
      })
      await msgRes.json()

      onRecordSkillUsage?.(skill.displayName || skill.name)

      const res = await apiFetch('/v1/brain/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authSession?.token || ''}`,
        },
        body: JSON.stringify({
          query: `请使用 ${skill.displayName || skill.name} 技能 ${text}`,
          conversationId: ensuredConversationId,
        }),
      })
      if (!res.ok) throw new Error(`请求失败: ${res.status}`)

      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.answer || data.message || '处理完成' }])
    } catch (e) {
      setError(e.message)
      setMessages(prev => [...prev, { role: 'assistant', content: `错误: ${e.message}` }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col overflow-hidden">
        <div className="px-5 py-3 border-b flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center text-amber-500">
              <Zap size={14} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800">{skill.displayName || skill.name}</h3>
              <p className="text-[10px] text-slate-400">技能对话 · 自动转为技能调用提示</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-lg">
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-3">
          <div className="text-center text-xs text-slate-400 py-2">
            {'发送内容会自动转为“请使用 '}
            <span className="font-mono bg-slate-100 px-1 rounded">{skill.displayName || skill.name}</span>
            {' 技能”的语义提示'}
          </div>

          {messages.map((msg, index) => (
            <div key={`${msg.role}-${index}`} className={cn('flex gap-2', msg.role === 'user' ? 'flex-row-reverse' : '')}>
              <div className={cn('w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-medium', msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-emerald-500 text-white')}>
                {msg.role === 'user' ? <User size={12} /> : <Bot size={12} />}
              </div>
              <div className={cn('max-w-[80%] px-3 py-2 rounded-xl text-sm', msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-slate-100 text-slate-700 rounded-tl-sm')}>
                {msg.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                <Bot size={12} />
              </div>
              <div className="bg-slate-100 rounded-xl rounded-tl-sm px-3 py-2">
                <Loader2 size={14} className="animate-spin text-slate-400" />
              </div>
            </div>
          )}

          {error && <p className="text-red-500 text-xs text-center">{error}</p>}
          <div ref={bottomRef} />
        </div>

        <div className="p-3 border-t flex gap-2 shrink-0">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder={`发送 ${skill.displayName || skill.name} 技能请求...`}
            className="flex-1 px-3 py-2 border rounded-lg text-sm"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
          >
            <Send size={14} /> 发送
          </button>
        </div>
      </div>
    </div>
  )
}
