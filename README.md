# 📚 小说下载器 Web版

基于Legado书源的小说下载器，支持多源搜索下载，可保存到本地。

![Demo](https://via.placeholder.com/800x400?text=Novel+Downloader)

## ✨ 功能特点

- 🔍 **多书源并发搜索** - 同时搜索多个书源，快速找到目标小说
- 📚 **书源管理** - 支持导入Legado格式书源，可自定义添加
- 📥 **流式下载** - 实时显示下载进度，支持断点续传
- 💾 **保存到本地** - 下载完成后可直接保存为TXT文件
- 📋 **复制内容** - 一键复制小说内容到剪贴板
- 📁 **下载历史** - 本地存储下载记录，方便再次获取
- 📱 **响应式设计** - 完美支持手机、平板、电脑访问
- ☁️ **Cloudflare部署** - 免费部署到Cloudflare Pages

## 🚀 快速部署

### 方式一：Cloudflare Pages（推荐）

1. **Fork本项目到你的GitHub**

2. **登录Cloudflare Dashboard**
   - 访问 [Cloudflare Dashboard](https://dash.cloudflare.com/)
   - 进入 Pages 页面

3. **创建项目**
   - 点击 "Create a project"
   - 选择 "Connect to Git"
   - 选择你Fork的仓库

4. **配置构建设置**
   - Framework preset: None
   - Build command: 留空
   - Build output directory: `public`

5. **创建KV命名空间**
   ```bash
   # 安装wrangler
   npm install -g wrangler
   
   # 登录
   wrangler login
   
   # 创建KV命名空间
   wrangler kv:namespace create BOOK_SOURCES
   wrangler kv:namespace create DOWNLOADS
   ```

6. **配置环境变量**
   - 在Cloudflare Pages设置中添加KV命名空间绑定
   - 变量名: `BOOK_SOURCES` 和 `DOWNLOADS`
   - 值: 上一步创建的命名空间ID

7. **部署完成！**

### 方式二：本地开发

```bash
# 克隆项目
git clone https://github.com/你的用户名/novel-downloader.git
cd novel-downloader

# 安装依赖
npm install

# 本地开发
npm run dev

# 部署
npm run deploy
```

## 📖 使用说明

### 搜索小说

1. 在搜索框输入小说名称或作者
2. 点击"搜索"按钮
3. 从搜索结果中选择目标小说

### 下载小说

1. 选择小说后点击"开始下载"
2. 等待下载完成
3. 点击"保存到本地"或"复制内容"

### 管理书源

1. 切换到"书源管理"标签
2. 粘贴Legado格式书源JSON
3. 点击"导入书源"

### 书源格式

支持Legado标准书源格式：

```json
[
  {
    "bookSourceName": "书源名称",
    "bookSourceUrl": "https://example.com",
    "bookSourceType": 0,
    "searchUrl": "https://example.com/search?keyword={{key}}",
    "enabled": true
  }
]
```

## 📁 项目结构

```
novel-web/
├── public/
│   └── index.html          # 前端页面
├── functions/
│   └── api/
│       ├── search.ts       # 搜索API
│       ├── download.ts     # 下载API
│       ├── file.ts         # 文件获取API
│       └── sources.ts      # 书源管理API
├── wrangler.toml           # Cloudflare配置
├── package.json            # 项目配置
└── README.md               # 说明文档
```

## 🔌 API文档

### 搜索小说

```
POST /api/search
Content-Type: application/json

{
  "keyword": "小说名称",
  "limit": 10
}

Response:
{
  "success": true,
  "results": [
    {
      "name": "书名",
      "author": "作者",
      "bookUrl": "书籍URL",
      "sourceName": "书源名称"
    }
  ]
}
```

### 下载小说

```
POST /api/download
Content-Type: application/json

{
  "book": { ... },
  "chapterLimit": 100
}

Response: Server-Sent Events (SSE)
data: {"progress": 50, "text": "下载中..."}
data: {"content": "章节内容..."}
data: {"done": true}
```

### 书源管理

```
GET  /api/sources     # 获取书源列表
POST /api/sources     # 添加书源
DELETE /api/sources   # 清空书源
```

## ⚠️ 注意事项

1. **Cloudflare限制**
   - Workers有CPU时间限制（免费版10ms）
   - KV存储单文件最大25MB
   - 下载文件24小时后自动删除

2. **书源可用性**
   - 书源来源于网络，可能随时失效
   - 建议导入多个书源备用
   - 部分网站可能有反爬措施

3. **法律声明**
   - 仅供学习交流使用
   - 请尊重版权，支持正版

## 🛠️ 技术栈

- **前端**: HTML5 + CSS3 + TypeScript
- **后端**: Cloudflare Workers
- **存储**: Cloudflare KV
- **部署**: Cloudflare Pages

## 📝 更新日志

### v1.0.0
- 初始版本发布
- 支持多书源搜索
- 支持流式下载
- 支持保存到本地

## 🤝 贡献

欢迎提交Issue和Pull Request！

## 📄 License

MIT License

---

基于 [Legado](https://github.com/gedoor/legado) 开源项目
