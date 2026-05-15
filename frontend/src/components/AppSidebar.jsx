import { useEffect, useMemo, useState } from 'react'
import { DndContext, closestCenter, PointerSensor, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { LogOut, ChevronDown, ChevronUp, Plus, Loader2, Pin, PinOff, Edit, Trash2, MessageSquare, Database, Server, Zap, Cpu, Users, User, Lock, Settings, Brain } from 'lucide-react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'

function cn(...inputs) {
  return twMerge(clsx(inputs))
}

function isAdminLikeRole(role) {
  const normalizedRole = String(role || '').toLowerCase()
  return normalizedRole === 'admin' || normalizedRole === 'super_admin'
}

export const COMMON_MENU_ITEMS = [
  { id: 'chat', label: '智能问答', icon: MessageSquare },
  { id: 'memory', label: '记忆管理', icon: Brain },
  { id: 'knowledge', label: '知识库', icon: Database },
  { id: 'databases', label: '数据库', icon: Server },
  { id: 'skill_lib', label: '技能库', icon: Zap },
  { id: 'models', label: '模型库', icon: Cpu },
]

export const ADMIN_MENU_ITEMS = [
  { id: 'super_overview', label: '管理员总览', icon: Users },
  { id: 'user_management', label: '用户管理', icon: User },
  { id: 'permissions', label: '权限分配', icon: Lock },
  { id: 'skills', label: '技能管理', icon: Settings },
]

export function getBaseMenuItemsByRole(role) {
  if (isAdminLikeRole(role)) {
    return [...ADMIN_MENU_ITEMS, ...COMMON_MENU_ITEMS]
  }
  return COMMON_MENU_ITEMS
}

export function orderMenuItems(baseMenuItems, menuOrder) {
  if (!Array.isArray(menuOrder) || menuOrder.length === 0) {
    return baseMenuItems
  }
  const itemMap = new Map(baseMenuItems.map(item => [item.id, item]))
  const ordered = menuOrder.map(id => itemMap.get(id)).filter(Boolean)
  const remaining = baseMenuItems.filter(item => !menuOrder.includes(item.id))
  return [...ordered, ...remaining]
}

// 智能问答菜单既是主导航项，也是会话子侧边栏入口。
function ChatSidebarItem({
  item,
  isActive,
  onMainClick,
  conversations,
  activeConversationId,
  convOrder,
  loading,
  renamingId,
  renamingTitle,
  hasMore,
  loadingMore,
  onSelect,
  onNew,
  onTogglePin,
  onStartRename,
  onSubmitRename,
  onCancelRename,
  onDelete,
  onRenameTitleChange,
  onDragEnd,
  onLoadMore,
  dragListeners,
  dragAttributes,
}) {
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (isActive) {
      setExpanded(true)
    }
  }, [isActive])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  )

  const orderedConversations = useMemo(() => {
    const items = Array.isArray(conversations) ? conversations : []
    if (items.length === 0) {
      return { pinned: [], regular: [] }
    }

    const byId = new Map(items.map(item => [item.id, item]))
    const pinned = (convOrder?.pinned || []).map(id => byId.get(id)).filter(Boolean)
    const regularFromOrder = (convOrder?.order || []).map(id => byId.get(id)).filter(Boolean)
    const usedIds = new Set([...pinned, ...regularFromOrder].map(item => item.id))
    // 兼容排序状态缺失或脏数据：把未命中的历史会话自动补回列表末尾，避免“已有会话不显示”。
    const remaining = items.filter(item => !usedIds.has(item.id))

    return {
      pinned,
      regular: [...regularFromOrder, ...remaining],
    }
  }, [conversations, convOrder])

  const pinnedConvs = orderedConversations.pinned
  const displayedOrder = orderedConversations.regular

  return (
    <div className="space-y-0.5">
      <div className="flex items-center">
        <button
          onClick={onMainClick}
          {...dragListeners}
          {...dragAttributes}
          className={cn(
            'flex-1 flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all text-left',
            isActive && !expanded
              ? 'bg-gray-100 text-gray-900 font-medium'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          )}
        >
          <item.icon size={18} className={isActive ? 'text-gray-700' : 'text-gray-400'} />
          <span className="flex-1">{item.label}</span>
        </button>
        <button
          onClick={() => setExpanded(v => !v)}
          className="p-1.5 mr-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          title={expanded ? '收起对话列表' : '展开对话列表'}
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {expanded && (
        <div className="ml-3 pl-3 border-l border-gray-200 space-y-1 py-1">
          <button
            onClick={onNew}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-slate-600 hover:bg-slate-100 hover:text-blue-600 transition-colors"
          >
            <Plus size={14} />
            <span>新建对话</span>
          </button>

          {loading ? (
            <div className="px-2 py-2 text-[10px] text-slate-400 flex items-center gap-1">
              <Loader2 size={10} className="animate-spin" />加载中...
            </div>
          ) : conversations.length === 0 ? (
            <div className="px-2 py-2 text-[10px] text-slate-400">暂无对话</div>
          ) : (
            <>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                {pinnedConvs.length > 0 && (
                  <div className="mb-1">
                    <div className="text-[9px] text-slate-400 font-medium px-1 mb-0.5 flex items-center gap-0.5">
                      <Pin size={8} />置顶
                    </div>
                    <SortableContext items={pinnedConvs.map(conv => conv.id)} strategy={verticalListSortingStrategy}>
                      {pinnedConvs.map(conv => (
                        <MiniConvItem
                          key={conv.id}
                          conv={conv}
                          isPinned
                          isActive={activeConversationId === conv.id}
                          isRenaming={renamingId === conv.id}
                          renamingTitle={renamingId === conv.id ? renamingTitle : ''}
                          onSelect={() => onSelect(conv.id)}
                          onTogglePin={() => onTogglePin(conv.id)}
                          onStartRename={() => onStartRename(conv)}
                          onSubmitRename={() => onSubmitRename(conv.id)}
                          onCancelRename={onCancelRename}
                          onDelete={() => onDelete(conv.id)}
                          onRenameTitleChange={onRenameTitleChange}
                        />
                      ))}
                    </SortableContext>
                  </div>
                )}

                {displayedOrder.length > 0 && (
                  <SortableContext items={displayedOrder.map(c => c.id)} strategy={verticalListSortingStrategy}>
                    {displayedOrder.map(conv => (
                      <MiniConvItem
                        key={conv.id}
                        conv={conv}
                        isPinned={convOrder.pinned.includes(conv.id)}
                        isActive={activeConversationId === conv.id}
                        isRenaming={renamingId === conv.id}
                        renamingTitle={renamingId === conv.id ? renamingTitle : ''}
                        onSelect={() => onSelect(conv.id)}
                        onTogglePin={() => onTogglePin(conv.id)}
                        onStartRename={() => onStartRename(conv)}
                        onSubmitRename={() => onSubmitRename(conv.id)}
                        onCancelRename={onCancelRename}
                        onDelete={() => onDelete(conv.id)}
                        onRenameTitleChange={onRenameTitleChange}
                      />
                    ))}
                  </SortableContext>
                )}
              </DndContext>

            </>
          )}

          {hasMore && (
            <button
              onClick={onLoadMore}
              disabled={loadingMore}
              className="w-full text-[10px] text-slate-400 hover:text-blue-500 py-1 disabled:opacity-50"
            >
              {loadingMore ? '加载中...' : '加载更多'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// 将智能问答菜单项也纳入同一套拖拽排序体系。
function SortableChatSidebarItem(props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.item.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
  }

  return (
    <div ref={setNodeRef} style={style}>
      <ChatSidebarItem {...props} dragListeners={listeners} dragAttributes={attributes} />
    </div>
  )
}

function MiniConvItem({ conv, isPinned, isActive, isRenaming, renamingTitle, onSelect, onTogglePin, onStartRename, onSubmitRename, onCancelRename, onDelete, onRenameTitleChange }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: conv.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'group relative flex items-center gap-1 px-2 py-1.5 rounded-md transition-colors cursor-grab active:cursor-grabbing',
        isActive ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'hover:bg-slate-100'
      )}
    >

      {isRenaming ? (
        <input
          value={renamingTitle}
          onChange={e => onRenameTitleChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onSubmitRename()
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              onCancelRename()
            }
          }}
          onBlur={onSubmitRename}
          autoFocus
          maxLength={120}
          className="flex-1 min-w-0 px-1 py-0.5 text-sm rounded border border-blue-400 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      ) : (
        <>
          <button
            onClick={onSelect}
            className={cn(
              'flex-1 min-w-0 pr-1 text-left text-sm truncate transition-all group-hover:pr-16',
              isActive ? 'font-medium text-blue-700' : 'text-slate-600 hover:text-blue-600'
            )}
          >
            {conv.title || '未命名会话'}
          </button>
          <div className="pointer-events-none absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-md bg-white/90 px-1 opacity-0 shadow-sm ring-1 ring-slate-200/80 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
            <button
              onClick={onTogglePin}
              className={cn(
                'p-0.5 rounded shrink-0 transition-colors',
                isPinned ? 'text-blue-400 hover:bg-blue-100' : 'text-slate-300 hover:text-blue-400 hover:bg-blue-50'
              )}
              title={isPinned ? '取消置顶' : '置顶'}
            >
              {isPinned ? <PinOff size={10} /> : <Pin size={10} />}
            </button>

            <button
              onClick={onStartRename}
              className="p-0.5 rounded shrink-0 text-slate-300 hover:text-slate-600 hover:bg-slate-200 transition-colors"
              title="重命名"
            >
              <Edit size={10} />
            </button>

            <button
              onClick={onDelete}
              className="p-0.5 rounded shrink-0 text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors"
              title="删除"
            >
              <Trash2 size={10} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function SidebarItem({ item, isActive, onClick }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <button
        onClick={onClick}
        {...listeners}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all text-left group',
          isActive ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        )}
      >
        <item.icon size={18} className={isActive ? 'text-gray-700' : 'text-gray-400'} />
        <span>{item.label}</span>
      </button>
    </div>
  )
}

// 主应用壳层侧边栏，仅负责导航、排序与会话入口展示。
export function Sidebar({
  role,
  username,
  activeTab,
  onNavigateTab,
  onLogout,
  menuOrder,
  onMenuOrderChange,
  chatConversations,
  chatActiveConvId,
  chatConvOrder,
  chatLoading,
  chatRenamingId,
  chatRenamingTitle,
  chatHasMore,
  chatLoadingMore,
  onChatSelect,
  onChatNew,
  onChatTogglePin,
  onChatStartRename,
  onChatSubmitRename,
  onChatCancelRename,
  onChatDelete,
  onChatRenameTitleChange,
  onChatDragEnd,
  onChatLoadMore,
}) {
  const baseMenuItems = useMemo(() => getBaseMenuItemsByRole(role), [role])
  const orderedMenuItems = useMemo(() => orderMenuItems(baseMenuItems, menuOrder), [baseMenuItems, menuOrder])

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const handleDragEnd = (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = orderedMenuItems.findIndex(item => item.id === active.id)
    const newIndex = orderedMenuItems.findIndex(item => item.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const nextOrder = arrayMove(orderedMenuItems, oldIndex, newIndex).map(item => item.id)
    onMenuOrderChange(nextOrder)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={orderedMenuItems.map(item => item.id)} strategy={verticalListSortingStrategy}>
        <div className="w-56 bg-white border-r border-gray-200 flex flex-col h-screen shrink-0" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif' }}>
          <div className="p-5 border-b border-gray-100">
            <h1 className="text-lg font-semibold text-gray-900">AI4KB</h1>
            <p className="text-xs text-gray-400 mt-0.5">智能知识库系统</p>
          </div>

          <nav className="flex-1 p-3 space-y-0.5 scroll-container overflow-y-auto">
            {orderedMenuItems.map((item) => (
              item.id === 'chat' ? (
                <SortableChatSidebarItem
                  key={item.id}
                  item={item}
                  isActive={activeTab === 'chat'}
                  onMainClick={() => {
                    if (activeTab !== 'chat') onNavigateTab('chat')
                  }}
                  conversations={chatConversations || []}
                  activeConversationId={chatActiveConvId}
                  convOrder={chatConvOrder || { pinned: [], order: [] }}
                  loading={chatLoading || false}
                  renamingId={chatRenamingId}
                  renamingTitle={chatRenamingTitle}
                  hasMore={chatHasMore || false}
                  loadingMore={chatLoadingMore || false}
                  onSelect={(convId) => {
                    onChatSelect?.(convId)
                    if (activeTab !== 'chat') onNavigateTab('chat')
                  }}
                  onNew={onChatNew}
                  onTogglePin={onChatTogglePin}
                  onStartRename={onChatStartRename}
                  onSubmitRename={onChatSubmitRename}
                  onCancelRename={onChatCancelRename}
                  onDelete={onChatDelete}
                  onRenameTitleChange={onChatRenameTitleChange}
                  onDragEnd={onChatDragEnd}
                  onLoadMore={onChatLoadMore}
                />
              ) : (
                <SidebarItem
                  key={item.id}
                  item={item}
                  isActive={activeTab === item.id}
                  onClick={() => onNavigateTab(item.id)}
                />
              )
            ))}
          </nav>

          <div className="p-3 border-t border-gray-100">
            <div className="flex items-center gap-3 px-3 py-2 mb-2">
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium',
                isAdminLikeRole(role) ? 'bg-gray-200 text-gray-700' : 'bg-gray-100 text-gray-600'
              )}>
                {username?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-medium text-gray-900 truncate">{username}</p>
                <p className="text-xs text-gray-400">
                  {role === 'super_admin' ? '超级管理员' : role === 'admin' ? '管理员' : '用户'}
                </p>
              </div>
            </div>
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-2 text-gray-500 hover:text-gray-900 px-3 py-2 text-sm transition-colors rounded-lg hover:bg-gray-50"
            >
              <LogOut size={16} />
              退出登录
            </button>
          </div>
        </div>
      </SortableContext>
    </DndContext>
  )
}
