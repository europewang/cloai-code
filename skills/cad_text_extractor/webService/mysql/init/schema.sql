-- 数据库名: toolbox_db
-
SET NAMES utf8mb4;
SET character_set_client = utf8mb4;

CREATE DATABASE IF NOT EXISTS toolbox_db DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE toolbox_db;

-- 1. 用户表 (Users Table)
-- 存储用户凭证。根据要求，密码以明文形式存储。
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '用户ID',
    username VARCHAR(50) NOT NULL UNIQUE COMMENT '用户名',
    password VARCHAR(255) NOT NULL COMMENT '密码 (明文存储)',
    role VARCHAR(20) NOT NULL DEFAULT 'USER' COMMENT '角色 (ADMIN/USER)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='用户表';

-- 初始化默认用户
INSERT INTO users (username, password, role) VALUES ('admin', 'admin123', 'ADMIN') ON DUPLICATE KEY UPDATE id=id;
INSERT INTO users (username, password, role) VALUES ('user', 'user123', 'USER') ON DUPLICATE KEY UPDATE id=id;

-- 2. 工具表 (Tools Table)
-- 注册工具箱中可用的工具。
CREATE TABLE IF NOT EXISTS tools (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '工具ID',
    tool_key VARCHAR(50) NOT NULL UNIQUE COMMENT '工具唯一标识符 (例如: cad_extractor)',
    name VARCHAR(100) NOT NULL COMMENT '工具名称',
    description TEXT COMMENT '工具描述',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='工具信息表';

-- 初始化默认工具
INSERT INTO tools (tool_key, name, description) 
VALUES ('cad_extractor', 'CAD文本提取工具', '从DXF文件中提取文本并进行面积计算。')
ON DUPLICATE KEY UPDATE id=id;

-- 3. 执行日志表 (Execution Logs Table)
-- 记录每次工具的执行情况：谁、什么工具、什么时间、操作了什么数据。
CREATE TABLE IF NOT EXISTS execution_logs (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '日志ID',
    user_id INT NOT NULL COMMENT '执行用户ID',
    tool_id INT NOT NULL COMMENT '执行工具ID',
    data_name VARCHAR(255) NOT NULL COMMENT '操作数据名称 (例如: 文件名)',
    execution_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '执行时间',
    status VARCHAR(20) DEFAULT 'SUCCESS' COMMENT '执行状态 (SUCCESS/FAILED)',
    error_message TEXT COMMENT '错误信息 (如果有)',
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (tool_id) REFERENCES tools(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='工具执行日志表';
