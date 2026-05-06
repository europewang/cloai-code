<template>
  <div>
    <div class="header">
      <h2>用户管理</h2>
      <el-button type="primary" @click="openAddDialog">添加用户</el-button>
    </div>

    <el-table :data="users" style="width: 100%" v-loading="loading">
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="username" label="用户名" />
      <el-table-column prop="role" label="角色" width="120">
        <template #default="scope">
          <el-tag :type="scope.row.role === 'ADMIN' ? 'danger' : 'info'">
            {{ scope.row.role }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200">
        <template #default="scope">
          <el-button size="small" @click="openPasswordDialog(scope.row)">修改密码</el-button>
          <el-button size="small" type="danger" @click="handleDelete(scope.row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- Add User Dialog -->
    <el-dialog v-model="addDialogVisible" title="添加用户" width="400px">
      <el-form :model="addForm" label-width="80px">
        <el-form-item label="用户名">
          <el-input v-model="addForm.username"></el-input>
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="addForm.password" type="password" show-password></el-input>
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="addForm.role" placeholder="选择角色">
            <el-option label="普通用户" value="USER"></el-option>
            <el-option label="管理员" value="ADMIN"></el-option>
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="addDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="addUser">确定</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- Change Password Dialog -->
    <el-dialog v-model="pwdDialogVisible" title="修改密码" width="400px">
      <el-form :model="pwdForm" label-width="80px">
        <el-form-item label="新密码">
          <el-input v-model="pwdForm.password" type="password" show-password></el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="pwdDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="changePassword">确定</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const users = ref([])
const loading = ref(false)
const addDialogVisible = ref(false)
const pwdDialogVisible = ref(false)
const currentUser = JSON.parse(localStorage.getItem('user') || '{}')
const baseURL = import.meta.env.PROD ? '' : 'http://localhost:8087'

const addForm = ref({
  username: '',
  password: '',
  role: 'USER'
})

const pwdForm = ref({
  id: null,
  password: ''
})

const getHeaders = () => ({
  'X-Current-User-Id': currentUser.id
})

const fetchUsers = async () => {
  loading.value = true
  try {
    const res = await axios.get(`${baseURL}/api/users`, { headers: getHeaders() })
    users.value = res.data
  } catch (error) {
    ElMessage.error('获取用户列表失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (currentUser.role !== 'ADMIN') {
    ElMessage.error('无权访问')
    return
  }
  fetchUsers()
})

const openAddDialog = () => {
  addForm.value = { username: '', password: '', role: 'USER' }
  addDialogVisible.value = true
}

const addUser = async () => {
  if (!addForm.value.username || !addForm.value.password) {
    ElMessage.warning('请填写完整')
    return
  }
  try {
    await axios.post(`${baseURL}/api/users`, addForm.value, { headers: getHeaders() })
    ElMessage.success('添加成功')
    addDialogVisible.value = false
    fetchUsers()
  } catch (error) {
    ElMessage.error('添加失败: ' + (error.response?.data || error.message))
  }
}

const handleDelete = (user) => {
  ElMessageBox.confirm('确定删除该用户吗?', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      await axios.delete(`${baseURL}/api/users/${user.id}`, { headers: getHeaders() })
      ElMessage.success('删除成功')
      fetchUsers()
    } catch (error) {
      ElMessage.error('删除失败')
    }
  })
}

const openPasswordDialog = (user) => {
  pwdForm.value = { id: user.id, password: '' }
  pwdDialogVisible.value = true
}

const changePassword = async () => {
  if (!pwdForm.value.password) {
    ElMessage.warning('请输入新密码')
    return
  }
  try {
    await axios.put(`${baseURL}/api/users/${pwdForm.value.id}/password`, 
      { password: pwdForm.value.password }, 
      { headers: getHeaders() }
    )
    ElMessage.success('修改成功')
    pwdDialogVisible.value = false
  } catch (error) {
    ElMessage.error('修改失败')
  }
}
</script>

<style scoped>
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
</style>
