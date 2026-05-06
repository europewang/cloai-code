<template>
  <div>
    <div class="header">
      <h2>操作日志</h2>
      <div v-if="isAdmin" class="search-box">
        <el-input 
          v-model="searchUser" 
          placeholder="按用户名搜索" 
          clearable 
          @clear="fetchLogs"
          @keyup.enter="fetchLogs"
          style="width: 200px; margin-right: 10px;"
        />
        <el-button type="primary" @click="fetchLogs">搜索</el-button>
      </div>
    </div>
    
    <el-table :data="logs" style="width: 100%" v-loading="loading">
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="user.username" label="用户" width="120" />
      <el-table-column prop="tool.name" label="工具" width="180" />
      <el-table-column prop="dataName" label="数据名称" />
      <el-table-column prop="executionTime" label="操作时间" width="180">
        <template #default="scope">
          {{ formatDate(scope.row.executionTime) }}
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="scope">
          <el-tag :type="scope.row.status === 'SUCCESS' ? 'success' : 'danger'">
            {{ scope.row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="errorMessage" label="错误信息" />
    </el-table>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'

const logs = ref([])
const loading = ref(false)
const searchUser = ref('')
const baseURL = import.meta.env.PROD ? '' : 'http://localhost:8087'
const currentUser = JSON.parse(localStorage.getItem('user') || '{}')

const isAdmin = computed(() => currentUser.role === 'ADMIN')

const fetchLogs = async () => {
  loading.value = true
  try {
    const params = {}
    if (searchUser.value) {
      params.username = searchUser.value
    }
    
    const res = await axios.get(`${baseURL}/api/logs`, {
      params,
      headers: {
        'X-Current-User-Id': currentUser.id
      }
    })
    logs.value = res.data
  } catch (error) {
    ElMessage.error('获取日志失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchLogs()
})

const formatDate = (dateStr) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleString()
}
</script>

<style scoped>
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.search-box {
  display: flex;
}
</style>
