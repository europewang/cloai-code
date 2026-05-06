<template>
  <div class="cad-extractor-usage-container">
    <el-card class="tool-card">
      <template #header>
        <div class="card-header">
          <span>CAD文本提取工具</span>
          <el-button type="primary" @click="goBack">返回工具列表</el-button>
        </div>
      </template>

      <el-row :gutter="20">
        <el-col :span="12">
          <h3>工具操作</h3>
          <el-form :model="form" label-width="100px">
            <el-form-item label="校核者">
              <el-input v-model="form.checker" placeholder="默认: 张三"></el-input>
            </el-form-item>
            <el-form-item label="检查者">
              <el-input v-model="form.reviewer" placeholder="默认: 李四"></el-input>
            </el-form-item>
            <el-form-item label="选择文件或文件夹">
              <div style="display:flex; gap:12px; align-items:center;">
                <el-upload
                  class="upload-demo"
                  drag
                  action="#"
                  :auto-upload="false"
                  :multiple="true"
                  :on-change="handleFileAdd"
                  :on-remove="handleFileRemove"
                  :file-list="fileList"
                >
                  <el-icon class="el-icon--upload"><upload-filled /></el-icon>
                  <div class="el-upload__text">
                    拖拽文件到此处或 <em>点击上传</em>
                  </div>
                  <template #tip>
                    <div class="el-upload__tip">
                      可选择多个文件
                    </div>
                  </template>
                </el-upload>
                <el-button @click="triggerFolder" type="primary" plain>选择文件夹</el-button>
                <input ref="folderInput" type="file" style="display:none" webkitdirectory @change="handleFolderChange" />
              </div>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="runTool" :loading="loading">
                开始处理
              </el-button>
            </el-form-item>
          </el-form>
        </el-col>

        <el-col :span="12">
          <h3>使用说明</h3>
          <p>
            CAD文本提取工具用于从CAD文件中提取文本信息。您可以选择单个文件或整个文件夹进行处理。
            处理完成后，系统将生成一个包含提取文本的压缩包供您下载。
          </p>
          <p>
            请确保您上传的是有效的CAD文件（必须为 .dxf 格式）。
          </p>
          <h4>步骤一：选择文件</h4>
          <img :src="howToUse1" alt="使用说明1" style="max-width: 100%; height: auto; margin-bottom: 10px;" />
          <p>
            点击“选择文件”按钮或将文件拖拽到上传区域，选择您需要处理的CAD文件。
            如果您需要处理一个包含多个CAD文件的文件夹，请点击“选择文件夹”按钮。

            填写校核者和检查者信息（可选），然后点击“开始处理”按钮。
            系统将开始处理您的文件，处理时间取决于文件大小和数量。
          </p>
          <h4>步骤二：填写信息并处理</h4>
          <img :src="howToUse2" alt="使用说明2" style="max-width: 100%; height: auto; margin-bottom: 10px;" />
          <p>
              注意dxf的文件命名与图层内的单独text的命名对应上。
              内部命名格式必须按照要求才能自动导出正确的excel：A地块1楼2-5层、A地块1楼6-10层等。
          </p>
          <p>
            处理完成后，浏览器将自动下载结果压缩包。
          </p>
        </el-col>
      </el-row>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'

// 导入图片
const howToUse1 = '/howToUse.png'
const howToUse2 = '/howToUse2.png'

const router = useRouter()

const loading = ref(false)
const fileList = ref([])
const folderInput = ref(null)
const form = ref({
  checker: '',
  reviewer: ''
})

const baseURL = import.meta.env.PROD ? '' : 'http://localhost:8087'
const user = JSON.parse(localStorage.getItem('user') || '{}')

const goBack = () => {
  router.push({ name: 'Tools' })
}

const handleFileAdd = (file, files) => {
  fileList.value = files
}

const handleFileRemove = () => {
  fileList.value = []
}

const triggerFolder = () => {
  folderInput.value && folderInput.value.click()
}

const handleFolderChange = (e) => {
  const files = Array.from(e.target.files || [])
  const mapped = files.map(f => ({
    name: f.name,
    size: f.size,
    status: 'ready',
    raw: f,
    relativePath: f.webkitRelativePath || f.name
  }))
  fileList.value = mapped
}

const runTool = async () => {
  if (fileList.value.length === 0) {
    ElMessage.warning('请选择文件或文件夹')
    return
  }
  
  loading.value = true
  try {
    const formData = new FormData()
    if (fileList.value.length === 1) {
      formData.append('file', fileList.value[0].raw)
    } else {
      fileList.value.forEach(f => {
        formData.append('files', f.raw)
        formData.append('paths', f.relativePath || f.name)
      })
    }
    formData.append('userId', user.id)
    if (form.value.checker) formData.append('checker', form.value.checker)
    if (form.value.reviewer) formData.append('reviewer', form.value.reviewer)

    const url = `${baseURL}/api/tools/cad-extractor/run`

    const res = await axios.post(url, formData, {
      responseType: 'blob', // Important for file download
      timeout: 300000 // 5 minutes timeout for long processing
    })

    // Trigger download
    const blob = new Blob([res.data], { type: 'application/zip' })
    const link = document.createElement('a')
    link.href = window.URL.createObjectURL(blob)
    link.download = `result_${new Date().getTime()}.zip`
    link.click()
    
    ElMessage.success('处理成功，已开始下载结果')
  } catch (error) {
    console.error(error)
    ElMessage.error('处理失败: ' + (error.message))
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.cad-extractor-usage-container {
  padding: 20px;
}

.tool-card {
  max-width: 1200px;
  margin: 0 auto;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

h3 {
  color: #333;
  margin-bottom: 15px;
}

p {
  line-height: 1.6;
  margin-bottom: 10px;
}

.el-upload__text em {
  color: #409eff;
  font-style: normal;
}
</style>
