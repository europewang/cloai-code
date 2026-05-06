<template>
  <div class="login-container">
    <el-card class="login-card">
      <template #header>
        <div class="card-header">
          <span>web 工具箱登录</span>
        </div>
      </template>
      <el-form :model="form" label-width="80px">
        <el-form-item label="用户名">
          <el-input v-model="form.username" placeholder="请输入用户名"></el-input>
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" placeholder="请输入密码" show-password></el-input>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleLogin" :loading="loading" style="width: 100%">登录</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import { ElMessage } from 'element-plus'

const router = useRouter()
const form = ref({
  username: '',
  password: ''
})
const loading = ref(false)

const handleLogin = async () => {
  if (!form.value.username || !form.value.password) {
    ElMessage.warning('请输入用户名和密码')
    return
  }
  
  loading.value = true
  try {
    // In dev, configure proxy or use absolute URL if backend is on localhost:8087
    // For Docker setup, relative /api works via Nginx proxy
    // For local dev without Nginx, point to localhost:8087
    const baseURL = import.meta.env.PROD ? '' : 'http://localhost:8087'
    const res = await axios.post(`${baseURL}/api/auth/login`, form.value)
    
    if (res.data) {
      localStorage.setItem('user', JSON.stringify(res.data))
      ElMessage.success('登录成功')
      router.push('/')
    }
  } catch (error) {
    ElMessage.error('登录失败: ' + (error.response?.data || error.message))
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  background-image: url('/background.png'); /* 使用复制到 public 目录的背景图 */
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}
.login-card {
  width: 400px;
  background-color: rgba(255, 255, 255, 0.15); /* 半透明白色 */
  backdrop-filter: blur(10px); /* 磨砂玻璃效果 */
  border-radius: 10px; /* 圆角 */
  padding: 20px; /* 内边距 */
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); /* 轻微阴影 */
}
.card-header {
  text-align: center;
  font-size: 24px; /* 稍微调大字体 */
  font-weight: bold;
  color: #fff; /* 标题颜色改为白色，以便在背景上更清晰 */
  margin-bottom: 20px;
}
/* 调整输入框和按钮的样式，使其与磨砂玻璃背景更协调 */
:deep(.el-input__inner) {
  background-color: rgba(255, 255, 255, 0.85);
  border: none;
  color: #222;
  caret-color: #222;
}
:deep(.el-input__inner::placeholder) {
  color: #666;
}
:deep(.el-form-item__label) {
  color: #fff;
}
</style>
