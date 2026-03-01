/**
 * 主应用模块
 */

class App {
    constructor() {
        this.sourceManager = new BookSourceManager();
        this.subscribeManager = new SubscribeManager();
        
        // 状态
        this.currentTab = 'search';
        this.searchResults = [];
        this.currentBook = null;
        this.currentChapters = [];
        this.downloadProgress = null;
        
        // 配置
        this.config = {
            searchConcurrent: 10,
            searchTimeout: 30000,
            downloadConcurrent: 5,
            cacheExpire: 3600000 // 1小时
        };
    }
    
    /**
     * 初始化
     */
    async init() {
        // 初始化管理器
        await this.sourceManager.init();
        await this.subscribeManager.init();
        
        // 绑定事件
        this.bindEvents();
        
        // 渲染界面
        this.render();
        
        // 更新统计
        this.updateStats();
        
        console.log('App initialized');
    }
    
    /**
     * 绑定事件
     */
    bindEvents() {
        // 标签切换
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });
        
        // 搜索
        const searchInput = document.getElementById('searchInput');
        const searchBtn = document.getElementById('searchBtn');
        
        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.search();
            });
        }
        
        if (searchBtn) {
            searchBtn.addEventListener('click', () => this.search());
        }
        
        // 导入书源
        const importInput = document.getElementById('importInput');
        if (importInput) {
            importInput.addEventListener('change', (e) => this.handleImportFile(e));
        }
    }
    
    /**
     * 切换标签
     */
    switchTab(tab) {
        this.currentTab = tab;
        
        // 更新标签按钮
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        
        // 更新内容区域
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tab}Tab`);
        });
    }
    
    /**
     * 搜索
     */
    async search() {
        const keyword = document.getElementById('searchInput')?.value?.trim();
        
        if (!keyword) {
            this.showToast('请输入搜索关键词', true);
            return;
        }
        
        const sources = this.sourceManager.getEnabledSources();
        
        if (sources.length === 0) {
            this.showToast('没有可用的书源，请先导入书源', true);
            return;
        }
        
        // 显示搜索中状态
        const searchBtn = document.getElementById('searchBtn');
        const originalText = searchBtn.textContent;
        searchBtn.textContent = '搜索中...';
        searchBtn.disabled = true;
        
        // 显示进度
        const resultsDiv = document.getElementById('searchResults');
        resultsDiv.innerHTML = '<div class="loading">正在搜索...</div>';
        
        try {
            // 调用搜索API
            const response = await fetch('/api/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    keyword: keyword,
                    sources: sources.slice(0, this.config.searchConcurrent),
                    concurrent: this.config.searchConcurrent
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.searchResults = data.results;
                this.renderSearchResults(data.results);
                this.showToast(`找到 ${data.results.length} 个结果`);
            } else {
                throw new Error(data.error || '搜索失败');
            }
            
        } catch (e) {
            console.error('搜索失败:', e);
            resultsDiv.innerHTML = `<div class="error">搜索失败: ${e.message}</div>`;
            this.showToast('搜索失败: ' + e.message, true);
        } finally {
            searchBtn.textContent = originalText;
            searchBtn.disabled = false;
        }
    }
    
    /**
     * SSE搜索
     */
    async searchSSE(keyword) {
        const sources = this.sourceManager.getEnabledSources();
        
        if (sources.length === 0) {
            this.showToast('没有可用的书源', true);
            return;
        }
        
        const resultsDiv = document.getElementById('searchResults');
        resultsDiv.innerHTML = '<div class="loading">正在搜索...</div>';
        
        const allResults = [];
        
        try {
            const url = `/api/search?sse=true&keyword=${encodeURIComponent(keyword)}&sources=${encodeURIComponent(JSON.stringify(sources))}&concurrent=${this.config.searchConcurrent}`;
            
            const eventSource = new EventSource(url);
            
            eventSource.addEventListener('message', (e) => {
                const data = JSON.parse(e.data);
                if (data.data) {
                    allResults.push(...data.data);
                    this.renderSearchResults(allResults, true);
                }
            });
            
            eventSource.addEventListener('end', (e) => {
                eventSource.close();
                this.renderSearchResults(allResults);
                this.showToast(`搜索完成，共 ${allResults.length} 个结果`);
            });
            
            eventSource.addEventListener('error', (e) => {
                eventSource.close();
                if (allResults.length === 0) {
                    resultsDiv.innerHTML = '<div class="error">搜索失败</div>';
                }
            });
            
        } catch (e) {
            console.error('SSE搜索失败:', e);
            this.showToast('搜索失败: ' + e.message, true);
        }
    }
    
    /**
     * 渲染搜索结果
     */
    renderSearchResults(results, isSearching = false) {
        const resultsDiv = document.getElementById('searchResults');
        
        if (results.length === 0) {
            resultsDiv.innerHTML = isSearching ? 
                '<div class="loading">正在搜索...</div>' : 
                '<div class="empty">没有找到结果</div>';
            return;
        }
        
        let html = '';
        
        for (const book of results) {
            html += `
                <div class="book-item" onclick="app.showBookDetail('${encodeURIComponent(book.bookUrl)}', '${encodeURIComponent(book.origin)}')">
                    <div class="book-cover">
                        ${book.coverUrl ? `<img src="${book.coverUrl}" onerror="this.style.display='none'">` : ''}
                    </div>
                    <div class="book-info">
                        <h3>${this.escapeHtml(book.name)}</h3>
                        <div class="meta">
                            <span class="author">${this.escapeHtml(book.author || '未知作者')}</span>
                            <span class="source">${this.escapeHtml(book.originName || '')}</span>
                        </div>
                        ${book.lastChapter ? `<div class="latest">最新: ${this.escapeHtml(book.lastChapter)}</div>` : ''}
                        ${book.intro ? `<div class="intro">${this.escapeHtml(book.intro)}</div>` : ''}
                    </div>
                </div>
            `;
        }
        
        if (isSearching) {
            html += '<div class="loading">继续搜索中...</div>';
        }
        
        resultsDiv.innerHTML = html;
    }
    
    /**
     * 显示书籍详情
     */
    async showBookDetail(bookUrl, origin) {
        bookUrl = decodeURIComponent(bookUrl);
        origin = decodeURIComponent(origin);
        
        const source = this.sourceManager.getSource(origin);
        if (!source) {
            this.showToast('书源不存在', true);
            return;
        }
        
        // 显示加载中
        const modal = document.getElementById('bookModal');
        const modalContent = document.getElementById('bookModalContent');
        modal.classList.add('active');
        modalContent.innerHTML = '<div class="loading">加载中...</div>';
        
        try {
            // 获取书籍信息
            const book = this.searchResults.find(b => b.bookUrl === bookUrl) || { bookUrl, origin };
            
            const response = await fetch('/api/book-info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bookUrl: bookUrl,
                    source: source
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.currentBook = data.book;
                this.renderBookDetail(data.book, source);
            } else {
                throw new Error(data.error || '获取书籍信息失败');
            }
            
        } catch (e) {
            console.error('获取书籍信息失败:', e);
            modalContent.innerHTML = `<div class="error">获取失败: ${e.message}</div>`;
        }
    }
    
    /**
     * 渲染书籍详情
     */
    renderBookDetail(book, source) {
        const modalContent = document.getElementById('bookModalContent');
        
        modalContent.innerHTML = `
            <div class="book-detail">
                <div class="book-header">
                    ${book.coverUrl ? `<img class="book-cover" src="${book.coverUrl}" onerror="this.style.display='none'">` : ''}
                    <div class="book-title">
                        <h2>${this.escapeHtml(book.name)}</h2>
                        <div class="meta">
                            <span>${this.escapeHtml(book.author || '未知作者')}</span>
                            <span>${this.escapeHtml(book.kind || '')}</span>
                        </div>
                        <div class="source">来源: ${this.escapeHtml(source.bookSourceName)}</div>
                    </div>
                </div>
                
                <div class="book-intro">
                    <h3>简介</h3>
                    <p>${this.escapeHtml(book.intro || '暂无简介')}</p>
                </div>
                
                <div class="book-actions">
                    <button class="btn btn-primary" onclick="app.startDownload()">
                        开始下载
                    </button>
                    <button class="btn btn-secondary" onclick="app.showChapters()">
                        查看目录
                    </button>
                    <button class="btn btn-secondary" onclick="app.closeModal()">
                        关闭
                    </button>
                </div>
            </div>
        `;
    }
    
    /**
     * 显示目录
     */
    async showChapters() {
        if (!this.currentBook) return;
        
        const source = this.sourceManager.getSource(this.currentBook.origin);
        if (!source) return;
        
        const modalContent = document.getElementById('bookModalContent');
        modalContent.innerHTML = '<div class="loading">加载目录中...</div>';
        
        try {
            const response = await fetch('/api/chapters', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    book: this.currentBook,
                    source: source
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.currentChapters = data.chapters;
                this.renderChapters(data.chapters);
            } else {
                throw new Error(data.error || '获取目录失败');
            }
            
        } catch (e) {
            console.error('获取目录失败:', e);
            modalContent.innerHTML = `<div class="error">获取目录失败: ${e.message}</div>`;
        }
    }
    
    /**
     * 渲染目录
     */
    renderChapters(chapters) {
        const modalContent = document.getElementById('bookModalContent');
        
        let html = `
            <div class="chapters">
                <div class="chapters-header">
                    <h3>目录 (${chapters.length}章)</h3>
                    <button class="btn btn-small" onclick="app.startDownload()">下载全部</button>
                </div>
                <div class="chapters-list">
        `;
        
        for (let i = 0; i < chapters.length; i++) {
            const chapter = chapters[i];
            html += `
                <div class="chapter-item" onclick="app.downloadChapter(${i})">
                    <span class="chapter-index">${i + 1}</span>
                    <span class="chapter-title">${this.escapeHtml(chapter.title)}</span>
                </div>
            `;
        }
        
        html += '</div></div>';
        modalContent.innerHTML = html;
    }
    
    /**
     * 开始下载
     */
    async startDownload() {
        if (!this.currentBook || this.currentChapters.length === 0) {
            this.showToast('请先获取目录', true);
            return;
        }
        
        const source = this.sourceManager.getSource(this.currentBook.origin);
        if (!source) return;
        
        // 显示下载进度
        const modalContent = document.getElementById('bookModalContent');
        modalContent.innerHTML = `
            <div class="download-progress">
                <h3>下载中...</h3>
                <div class="progress-bar">
                    <div class="progress-fill" id="downloadProgressFill" style="width: 0%"></div>
                </div>
                <div class="progress-text" id="downloadProgressText">0 / ${this.currentChapters.length}</div>
                <div class="download-content" id="downloadContent"></div>
            </div>
        `;
        
        const content = [];
        const total = this.currentChapters.length;
        
        for (let i = 0; i < total; i++) {
            const chapter = this.currentChapters[i];
            
            try {
                const response = await fetch('/api/content', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        book: this.currentBook,
                        chapter: chapter,
                        source: source
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    content.push(`\n\n第${i + 1}章 ${chapter.title}\n\n${data.content}`);
                }
                
            } catch (e) {
                console.error('下载章节失败:', e);
            }
            
            // 更新进度
            const progress = ((i + 1) / total * 100).toFixed(1);
            document.getElementById('downloadProgressFill').style.width = progress + '%';
            document.getElementById('downloadProgressText').textContent = `${i + 1} / ${total}`;
        }
        
        // 下载完成
        this.downloadComplete(content.join(''));
    }
    
    /**
     * 下载完成
     */
    downloadComplete(content) {
        const modalContent = document.getElementById('bookModalContent');
        
        modalContent.innerHTML = `
            <div class="download-complete">
                <h3>下载完成</h3>
                <p>共 ${content.length} 字</p>
                <div class="actions">
                    <button class="btn btn-primary" onclick="app.saveToFile('${this.escapeHtml(this.currentBook.name)}.txt')">保存文件</button>
                    <button class="btn btn-secondary" onclick="app.copyToClipboard()">复制内容</button>
                </div>
            </div>
        `;
        
        this.downloadContent = content;
    }
    
    /**
     * 保存到文件
     */
    saveToFile(filename) {
        if (!this.downloadContent) return;
        
        const blob = new Blob([this.downloadContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        
        this.showToast('文件已保存');
    }
    
    /**
     * 复制到剪贴板
     */
    async copyToClipboard() {
        if (!this.downloadContent) return;
        
        try {
            await navigator.clipboard.writeText(this.downloadContent);
            this.showToast('已复制到剪贴板');
        } catch (e) {
            this.showToast('复制失败', true);
        }
    }
    
    /**
     * 关闭模态框
     */
    closeModal() {
        document.getElementById('bookModal')?.classList.remove('active');
    }
    
    /**
     * 处理导入文件
     */
    async handleImportFile(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            const result = await this.sourceManager.importSources(text);
            
            this.showToast(`导入成功: 新增 ${result.added} 个，更新 ${result.updated} 个`);
            this.updateStats();
            this.renderSourceList();
            
        } catch (e) {
            this.showToast('导入失败: ' + e.message, true);
        }
        
        // 清空input
        event.target.value = '';
    }
    
    /**
     * 从URL导入书源
     */
    async importFromUrl() {
        const url = prompt('请输入书源URL:');
        if (!url) return;
        
        try {
            const result = await this.sourceManager.importFromUrl(url);
            
            if (result.error) {
                throw new Error(result.error);
            }
            
            this.showToast(`导入成功: 新增 ${result.added} 个，更新 ${result.updated} 个`);
            this.updateStats();
            this.renderSourceList();
            
        } catch (e) {
            this.showToast('导入失败: ' + e.message, true);
        }
    }
    
    /**
     * 测试书源
     */
    async testSources() {
        const sources = this.sourceManager.getEnabledSources();
        
        if (sources.length === 0) {
            this.showToast('没有可测试的书源', true);
            return;
        }
        
        const statusDiv = document.getElementById('testStatus');
        statusDiv.classList.remove('hidden');
        statusDiv.innerHTML = '<div class="loading">测试中...</div>';
        
        try {
            const response = await fetch('/api/test-sources', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sources: sources.slice(0, 20),
                    keyword: '我的',
                    checkSearch: true,
                    checkInfo: true,
                    checkToc: true,
                    checkContent: false
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.renderTestResults(data.results);
            } else {
                throw new Error(data.error || '测试失败');
            }
            
        } catch (e) {
            statusDiv.innerHTML = `<div class="error">测试失败: ${e.message}</div>`;
        }
    }
    
    /**
     * 渲染测试结果
     */
    renderTestResults(results) {
        const statusDiv = document.getElementById('testStatus');
        
        const valid = results.filter(r => r.success).length;
        const invalid = results.filter(r => !r.success).length;
        
        let html = `
            <div class="test-results">
                <div class="test-summary">
                    <span class="valid">✓ 有效: ${valid}</span>
                    <span class="invalid">✗ 失效: ${invalid}</span>
                </div>
                <div class="test-list">
        `;
        
        for (const result of results) {
            const statusClass = result.success ? 'valid' : 'invalid';
            const statusIcon = result.success ? '✓' : '✗';
            
            html += `
                <div class="test-item ${statusClass}">
                    <span class="status">${statusIcon}</span>
                    <span class="name">${this.escapeHtml(result.bookSourceName)}</span>
                    <span class="time">${result.responseTime}ms</span>
                </div>
            `;
        }
        
        html += '</div></div>';
        statusDiv.innerHTML = html;
    }
    
    /**
     * 渲染书源列表
     */
    renderSourceList() {
        const sources = this.sourceManager.getAllSources();
        const listDiv = document.getElementById('sourceList');
        
        if (!listDiv) return;
        
        if (sources.length === 0) {
            listDiv.innerHTML = '<div class="empty">暂无书源，请导入书源</div>';
            return;
        }
        
        let html = '';
        
        for (const source of sources) {
            html += `
                <div class="source-item ${source.enabled ? '' : 'disabled'}">
                    <div class="source-info">
                        <span class="source-name">${this.escapeHtml(source.bookSourceName)}</span>
                        <span class="source-url">${this.escapeHtml(source.bookSourceUrl)}</span>
                    </div>
                    <div class="source-actions">
                        <button class="btn btn-small ${source.enabled ? 'btn-secondary' : 'btn-success'}" 
                                onclick="app.toggleSource('${source.bookSourceUrl}')">
                            ${source.enabled ? '禁用' : '启用'}
                        </button>
                        <button class="btn btn-small btn-danger" 
                                onclick="app.removeSource('${source.bookSourceUrl}')">
                            删除
                        </button>
                    </div>
                </div>
            `;
        }
        
        listDiv.innerHTML = html;
    }
    
    /**
     * 切换书源状态
     */
    toggleSource(url) {
        const source = this.sourceManager.getSource(url);
        if (source) {
            this.sourceManager.setSourceEnabled(url, !source.enabled);
            this.renderSourceList();
            this.updateStats();
        }
    }
    
    /**
     * 删除书源
     */
    removeSource(url) {
        if (confirm('确定删除此书源？')) {
            this.sourceManager.removeSource(url);
            this.renderSourceList();
            this.updateStats();
            this.showToast('已删除书源');
        }
    }
    
    /**
     * 更新统计
     */
    updateStats() {
        const stats = this.sourceManager.getStats();
        
        const countEl = document.getElementById('sourceCount');
        if (countEl) {
            countEl.textContent = `${stats.enabled} / ${stats.total}`;
        }
    }
    
    /**
     * 渲染主界面
     */
    render() {
        this.renderSourceList();
        
        // 渲染订阅列表
        const subscriptions = this.subscribeManager.getAllSubscriptions();
        const subListDiv = document.getElementById('subscribeList');
        
        if (subListDiv) {
            if (subscriptions.length === 0) {
                subListDiv.innerHTML = '<div class="empty">暂无订阅</div>';
            } else {
                let html = '';
                for (const sub of subscriptions) {
                    html += `
                        <div class="subscribe-item">
                            <div class="subscribe-info">
                                <span class="subscribe-name">${this.escapeHtml(sub.name)}</span>
                                <span class="subscribe-count">${sub.sourceCount} 个书源</span>
                            </div>
                            <div class="subscribe-actions">
                                <button class="btn btn-small btn-secondary" onclick="app.refreshSubscription('${sub.id}')">刷新</button>
                                <button class="btn btn-small btn-danger" onclick="app.removeSubscription('${sub.id}')">删除</button>
                            </div>
                        </div>
                    `;
                }
                subListDiv.innerHTML = html;
            }
        }
    }
    
    /**
     * 添加订阅
     */
    async addSubscription() {
        const url = prompt('请输入订阅URL:');
        if (!url) return;
        
        try {
            const result = await this.subscribeManager.addSubscription(url);
            
            if (result.success) {
                // 导入书源
                await this.sourceManager.addSources(result.sources);
                
                this.showToast(`订阅成功，导入 ${result.sources.length} 个书源`);
                this.render();
                this.updateStats();
            } else {
                throw new Error(result.error || '订阅失败');
            }
        } catch (e) {
            this.showToast('订阅失败: ' + e.message, true);
        }
    }
    
    /**
     * 刷新订阅
     */
    async refreshSubscription(id) {
        try {
            const result = await this.subscribeManager.updateSubscription(id);
            
            if (result.success) {
                await this.sourceManager.addSources(result.sources);
                this.showToast(`刷新成功，更新 ${result.sources.length} 个书源`);
                this.render();
                this.updateStats();
            } else {
                throw new Error(result.error || '刷新失败');
            }
        } catch (e) {
            this.showToast('刷新失败: ' + e.message, true);
        }
    }
    
    /**
     * 删除订阅
     */
    removeSubscription(id) {
        if (confirm('确定删除此订阅？')) {
            this.subscribeManager.removeSubscription(id);
            this.render();
            this.showToast('已删除订阅');
        }
    }
    
    /**
     * 显示Toast
     */
    showToast(message, isError = false) {
        const toast = document.createElement('div');
        toast.className = `toast ${isError ? 'error' : ''}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
    
    /**
     * HTML转义
     */
    escapeHtml(str) {
        if (!str) return '';
        return str.toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}

// 导出
window.App = App;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
    app.init();
});
