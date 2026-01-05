# AI工具门户

一个基于Web的AI工具集合，提供多种实用工具，包括AI表情包生成器、进制转换器、URL编解码器、颜色选择器等。

## 功能特性

### 核心工具
- **AI表情包生成器**：支持图片上传、多种风格模式（卡通、科幻）、自定义描述和下载功能
- **进制转换器**：支持不同进制之间的转换
- **URL编解码器**：用于URL的编码和解码
- **颜色选择器**：用于选择和生成颜色值
- **代码格式化器**：支持多种编程语言的代码格式化

### 设计特点
- 响应式设计，适配不同屏幕尺寸
- 现代化的UI设计，简洁易用
- 模块化架构，便于扩展和维护
- 支持多种AI API集成

## 目录结构

```
WebPages/
├── index.html                # 工具门户首页
├── deploy.sh                 # 部署脚本
├── .rulexx                   # 规则文件
├── .gitmodules               # Git子模块配置
└── tools/                    # 工具集合
    ├── ai-meme-generator/    # AI表情包生成器
    │   ├── index.html
    │   ├── style.css
    │   └── script.js
    ├── base-converter/       # 进制转换器
    ├── url-encoder/          # URL编解码器
    ├── color-picker/         # 颜色选择器
    ├── code-formatter/       # 代码格式化器
    └── aura-tree/            # Gitee子模块
```

## 使用方法

### 本地开发
1. 克隆仓库：`git clone https://gitee.com/asmots/pages.git`
2. 进入目录：`cd WebPages`
3. 启动本地服务器：`python3 -m http.server 8000`
4. 访问：`http://localhost:8000`

### 部署到Cloudflare Pages
1. 使用部署脚本：`./deploy.sh`
2. 或手动部署：使用Wrangler CLI或Cloudflare Pages控制台

## 开发指南

### 添加新工具
1. 在`tools/`目录下创建新的工具文件夹
2. 创建必要的HTML、CSS和JavaScript文件
3. 在首页`index.html`中添加工具卡片

### 代码规范
- 遵循单一职责原则，每个文件只负责一个功能
- 使用模块化设计，便于维护和扩展
- 保持代码风格一致，使用语义化命名

## 依赖项

- 无外部依赖，纯前端实现
- 可选：Wrangler CLI（用于Cloudflare Pages部署）

## 许可证

MIT License

## 贡献

欢迎提交Issue和Pull Request！

## 联系方式

如有问题或建议，请通过以下方式联系：
- GitHub Issues：https://gitee.com/asmots/pages/issues
- 邮箱：[your-email@example.com]
