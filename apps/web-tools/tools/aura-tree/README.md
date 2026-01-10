# 🎄 AuraTree - 交互式 3D 圣诞树

一个令人惊艳的交互式 3D 圣诞树可视化应用，支持手势识别、多种视觉效果和照片展示。通过机器学习驱动的姿态识别，让你用身体动作控制圣诞树的形态变化！

![Anti-Gravity Christmas Tree](https://img.shields.io/badge/Three.js-0.160.0-blue)
![MediaPipe](https://img.shields.io/badge/MediaPipe-Pose-orange)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ 主要特性

### 🎮 手势交互控制
- **机器学习姿态识别**：基于 MediaPipe Pose 和 KNN 分类器
- **多种预设手势**：支持自定义训练手势数据
- **实时响应**：流畅的手势识别和动画过渡

### 🌟 视觉效果
- **满天星模式**：粒子散开形成璀璨星空
- **五角星模式**：粒子组合成精美五角星图案
- **心形模式**：浪漫的"I ❤️ HOOBEI"文字和心形效果
- **Bloom 后处理**：高级光晕效果，营造梦幻氛围
- **景深模糊**：柔美的背景虚化 Bokeh 效果
- **动态照明**：实时光影变化

### 📸 照片展示
- **相册模式**：循环展示个人照片
- **3D 空间分布**：照片在 3D 场景中自然摆放
- **Gallery Mode**：默认展示模式，可与手势交互无缝切换

### 🎵 音效系统
- **背景音乐**：温馨的圣诞主题音乐
- **音量控制**：一键静音/恢复

### 🛠️ 调试工具
- **可视化调试面板**：实时调整树的各项参数
- **姿态骨架显示**：查看 MediaPipe 识别的人体骨架
- **手势训练器**：独立的手势数据采集和训练工具

## 🚀 快速开始

### 环境要求
- Node.js (推荐 v14+)
- 现代浏览器（支持 WebGL 和 ES6 模块）
- 摄像头（用于手势识别）

### 安装步骤

1. **克隆仓库**
```bash
git clone git@gitee.com:asmots/aura-tree.git
cd aura-tree
```

2. **安装依赖**
```bash
npm install
```

3. **启动 HTTPS 服务器**

由于 MediaPipe 需要 HTTPS 环境，项目内置了 HTTPS 本地服务器：

```bash
node server.js
```

4. **访问应用**

在浏览器中打开：
```
https://localhost:3000
```

> ⚠️ **注意**：首次访问会提示证书不受信任，这是正常的（使用的是自签名证书），点击"继续访问"即可。

## 📁 项目结构

```
AuraTree/
├── index.html              # 主页面
├── style.css              # 全局样式
├── script.js              # 主入口脚本
├── server.js              # HTTPS 本地服务器
├── package.json           # 项目依赖
│
├── js/                    # JavaScript 模块
│   ├── core/              # 核心模块
│   │   ├── config.js      # 全局配置
│   │   ├── scene.js       # Three.js 场景设置
│   │   └── audio.js       # 音频管理
│   │
│   ├── tree/              # 圣诞树组件
│   │   ├── index.js       # 树的主逻辑
│   │   ├── foliage.js     # 树叶/雪花粒子
│   │   ├── lights.js      # 树灯光效果
│   │   ├── ornaments.js   # 树装饰（礼物盒、彩球）
│   │   ├── topStar.js     # 树顶之星
│   │   └── photos.js      # 照片展示系统
│   │
│   ├── shapes/            # 形状动画
│   │   └── index.js       # 各种形状变换逻辑
│   │
│   ├── effects/           # 视觉效果
│   │   ├── bloom.js       # Bloom 后处理
│   │   ├── bokeh.js       # 背景虚化效果
│   │   └── particles.js   # 粒子系统
│   │
│   ├── ui/                # 用户界面
│   │   ├── controls.js    # 控制按钮
│   │   ├── debugPanel.js  # 调试面板
│   │   ├── photoViewer.js # 照片查看器
│   │   └── visualDebugger.js # 可视化调试工具
│   │
│   ├── input.js           # 手势输入处理
│   └── knn.js            # KNN 分类器
│
├── trainer/               # 手势训练工具
│   ├── index.html        
│   ├── style.css         
│   └── app.js            
│
└── assets/                # 资源文件
    ├── audio/            # 音频文件
    ├── photos/           # 照片（放置你的照片）
    ├── icons/            # UI 图标
    └── model/            # 训练好的手势模型
```

## 🎯 使用指南

### 基本操作

1. **开启摄像头**：页面加载后会请求摄像头权限
2. **识别手势**：站在摄像头前，做出预设手势
3. **观看变化**：圣诞树会根据手势变换形态
4. **查看照片**：点击照片可放大查看

### 按钮控制

- **默认** 🧍：恢复树的默认形态
- **满天星** ⭐：触发粒子散开效果
- **湖贝里** ❤️：显示心形和文字
- **五角星** ⭐：形成五角星图案
- **静音** 🔊：控制背景音乐
- **设置** ⚙️：打开可视化调试面板

### 训练自定义手势

1. 访问 `https://localhost:3000/trainer/`
2. 选择手势类型（Heaven/Earth/Heart/Star）
3. 摆好姿势，点击"Record Sample"采集样本
4. 重复采集多个样本（建议每个手势 20+ 样本）
5. 点击"Download Data"下载训练数据
6. 将数据放置到 `assets/model/` 目录

## 🎨 技术栈

- **Three.js** (v0.160.0) - 3D 渲染引擎
- **MediaPipe Pose** - 姿态识别
- **KNN 分类器** - 手势分类
- **WebGL** - 硬件加速渲染
- **ES6 Modules** - 模块化开发

## 🔧 配置说明

主要配置位于 `js/core/config.js`，你可以调整：

- 树的大小和形状参数
- 粒子数量和效果
- 光照强度和颜色
- 动画速度和过渡时间
- 手势识别灵敏度

## 📸 添加自己的照片

1. 将照片放入 `assets/photos/` 目录
2. 支持的格式：JPG、PNG、GIF
3. 建议尺寸：1:1 方形或 4:3 比例
4. 照片会自动加载并在场景中展示

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License - 详见 LICENSE 文件

## 🎅 致谢

- Three.js 社区
- MediaPipe 团队
- 所有贡献者

---

**🎄 祝你圣诞快乐！Merry Christmas! 🎄**
