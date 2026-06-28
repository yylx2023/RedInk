import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import OutlineView from '../views/OutlineView.vue'
import GenerateView from '../views/GenerateView.vue'
import ResultView from '../views/ResultView.vue'
import HistoryView from '../views/HistoryView.vue'
import SettingsView from '../views/SettingsView.vue'
import LoginView from '../views/LoginView.vue'
import { isAuthenticated } from '../api'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { requiresAuth: false }
    },
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    {
      path: '/outline',
      name: 'outline',
      component: OutlineView
    },
    {
      path: '/generate',
      name: 'generate',
      component: GenerateView
    },
    {
      path: '/result',
      name: 'result',
      component: ResultView
    },
    {
      path: '/history',
      name: 'history',
      component: HistoryView
    },
    {
      path: '/history/:id',
      name: 'history-detail',
      component: HistoryView
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsView
    }
  ]
})


// 路由守卫：检查登录状态
router.beforeEach((to, _from, next) => {
  const requiresAuth = to.meta.requiresAuth !== false

  if (requiresAuth && !isAuthenticated()) {
    // 需要登录但未登录，跳转到登录页
    next({ name: 'login', query: { redirect: to.fullPath } })
  } else if (to.name === 'login' && isAuthenticated()) {
    // 已登录但访问登录页，跳转到首页
    next({ name: 'home' })
  } else {
    next()
  }
})

export default router
