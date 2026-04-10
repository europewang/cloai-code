1.每次任务开始与结束前必须调用 Skill：`rules-enforcer`：因为这个用于记录项目整体思路和项目规则，以及每次操作的记录
2.回答和写的备注都用中文，每次写代码一定要做好注释
4.使用conda环境进行操作，环境为ai4tender；现有项目为docker部署项目，使用docker启动前后端
12.用户明确要求“写入经验总结”时，必须调用 Skill：`experience-recorder`
13.创建 Skill 的规范：将 Skill 封装在 `.trae/skills/<skill-name>/` 目录下。`SKILL.md` 仅作为说明文档，**不要**将大量可执行代码直接嵌入 Markdown 代码块中。应将 Python 脚本、配置文件等独立保存为 `.py` 或 `.json` 文件放在同一目录下，方便直接调用和复用。
