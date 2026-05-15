export const TAB_PATHS = {
  chat: '/qa',
  knowledge: '/knowledge',
  databases: '/databases',
  skill_lib: '/skill-library',
  models: '/models',
  super_overview: '/overview',
  user_management: '/users',
  permissions: '/permissions',
  skills: '/skill-management',
  memory: '/memory',
  route_samples: '/route-samples',
}

export function getPathForTab(tabId) {
  return TAB_PATHS[tabId] || TAB_PATHS.chat
}

export function getTabFromPath(pathname) {
  const normalized = String(pathname || '/').replace(/\/+$/, '') || '/'
  const matched = Object.entries(TAB_PATHS).find(([, path]) => {
    return normalized === path || normalized.startsWith(`${path}/`)
  })
  return matched ? matched[0] : null
}
