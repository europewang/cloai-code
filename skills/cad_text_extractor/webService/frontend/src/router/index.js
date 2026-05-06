import { createRouter, createWebHistory } from 'vue-router'
import Login from '../views/Login.vue'
import Dashboard from '../views/Dashboard.vue'
import Tools from '../views/Tools.vue'
import Logs from '../views/Logs.vue'
import UserManagement from '../views/UserManagement.vue'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: Login
  },
  {
    path: '/',
    component: Dashboard,
    children: [
      {
        path: '',
        redirect: '/tools'
      },
      {
        path: 'tools',
        name: 'Tools',
        component: Tools
      },
      {
        path: 'logs',
        name: 'Logs',
        component: Logs
      },
      {
        path: 'users',
        name: 'Users',
        component: UserManagement
      },
      {
        path: 'cad-extractor', // 新增 CAD 文本提取工具的详情页路由
        name: 'CadExtractorUsage',
        component: () => import('../views/CadExtractorUsage.vue')
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory('/webTools/'),
  routes
})

router.beforeEach((to, from, next) => {
  const user = localStorage.getItem('user')
  if (to.name !== 'Login' && !user) {
    next({ name: 'Login' })
  } else {
    next()
  }
})

export default router
