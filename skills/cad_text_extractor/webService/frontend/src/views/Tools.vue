<template>
  <div>
    <h2>可用工具</h2>
    <el-row :gutter="20">
      <el-col :span="8" v-for="tool in tools" :key="tool.id">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>{{ tool.name }}</span>
            </div>
          </template>
          <div class="text item">
            {{ tool.description }}
          </div>
          <div style="margin-top: 20px; text-align: right;">
            <el-button type="primary" @click="openTool(tool)">使用工具</el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'

const router = useRouter()

const tools = ref([])
const dialogVisible = ref(false)
const currentTool = ref(null)

const baseURL = import.meta.env.PROD ? '' : 'http://localhost:8087'
const user = JSON.parse(localStorage.getItem('user') || '{}')

onMounted(async () => {
  try {
    const res = await axios.get(`${baseURL}/api/tools`)
    tools.value = res.data
  } catch (error) {
    ElMessage.error('获取工具列表失败')
  }
})

const openTool = (tool) => {
  if (tool.toolKey === 'cad_extractor') {
    router.push({ name: 'CadExtractorUsage' })
  } else {
    currentTool.value = tool
    dialogVisible.value = true
  }
}
</script>
