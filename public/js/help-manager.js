/**
 * 帮助文档模块
 */

class HelpManager {
    static getHelpContent() {
        return {
            quickStart: {
                title: '快速开始',
                content: `
                    <h3>🚀 快速开始</h3>
                    <ol>
                        <li><strong>导入书源</strong>：点击"书源"标签，导入书源JSON文件</li>
                        <li><strong>搜索小说</strong>：在搜索框输入书名或作者</li>
                        <li><strong>选择书籍</strong>：点击搜索结果查看详情</li>
                        <li><strong>下载小说</strong>：点击"开始下载"按钮</li>
                    </ol>
                `
            },
            bookSource: {
                title: '书源说明',
                content: `
                    <h3>📖 书源说明</h3>
                    <h4>什么是书源？</h4>
                    <p>书源是一个JSON文件，定义了如何从特定网站获取小说信息、目录和内容。</p>
                    
                    <h4>书源格式</h4>
                    <pre>
{
  "bookSourceName": "书源名称",
  "bookSourceUrl": "网站地址",
  "searchUrl": "搜索URL模板",
  "ruleSearch": {
    "bookList": "书籍列表选择器",
    "name": "书名选择器",
    "author": "作者选择器",
    "bookUrl": "书籍链接选择器"
  },
  "ruleBookInfo": {
    "name": "书名选择器",
    "author": "作者选择器",
    "intro": "简介选择器"
  },
  "ruleToc": {
    "chapterList": "章节列表选择器",
    "chapterName": "章节名选择器",
    "chapterUrl": "章节链接选择器"
  },
  "ruleContent": {
    "content": "正文选择器"
  }
}
                    </pre>
                    
                    <h4>选择器语法</h4>
                    <ul>
                        <li><code>.class</code> - CSS类选择器</li>
                        <li><code>#id</code> - ID选择器</li>
                        <li><code>tag</code> - 标签选择器</li>
                        <li><code>.item@href</code> - 获取属性值</li>
                        <li><code>.item@text</code> - 获取文本内容</li>
                    </ul>
                `
            },
            faq: {
                title: '常见问题',
                content: `
                    <h3>❓ 常见问题</h3>
                    
                    <h4>Q: 搜索没有结果？</h4>
                    <p>A: 可能原因：</p>
                    <ul>
                        <li>书源已失效，尝试导入其他书源</li>
                        <li>关键词被网站过滤，尝试其他关键词</li>
                        <li>网络问题，稍后重试</li>
                    </ul>
                    
                    <h4>Q: 下载速度慢？</h4>
                    <p>A: 在设置中增加下载并发数（默认10）</p>
                    
                    <h4>Q: 内容解析错误？</h4>
                    <p>A: 书源规则可能不匹配，需要更新书源</p>
                    
                    <h4>Q: 如何添加书源？</h4>
                    <p>A: 方式：</p>
                    <ul>
                        <li>本地导入JSON文件</li>
                        <li>通过URL导入</li>
                        <li>添加订阅源</li>
                    </ul>
                    
                    <h4>Q: 支持哪些规则？</h4>
                    <p>A: 目前支持：</p>
                    <ul>
                        <li>✅ CSS选择器</li>
                        <li>✅ 属性选择器 (@attr)</li>
                        <li>❌ XPath（暂不支持）</li>
                        <li>❌ JSONPath（暂不支持）</li>
                        <li>❌ JS规则（暂不支持）</li>
                    </ul>
                `
            },
            tips: {
                title: '使用技巧',
                content: `
                    <h3>💡 使用技巧</h3>
                    
                    <h4>搜索技巧</h4>
                    <ul>
                        <li>使用精确的书名搜索效果更好</li>
                        <li>可以同时搜索书名和作者</li>
                        <li>开启调试模式查看搜索详情</li>
                    </ul>
                    
                    <h4>下载技巧</h4>
                    <ul>
                        <li>先加入书架，方便管理</li>
                        <li>可以随时停止下载</li>
                        <li>下载完成后可保存或复制</li>
                    </ul>
                    
                    <h4>书源管理</h4>
                    <ul>
                        <li>定期测试书源有效性</li>
                        <li>禁用失效的书源</li>
                        <li>使用订阅自动更新书源</li>
                    </ul>
                `
            }
        };
    }
    
    static getExampleSources() {
        return [
            {
                bookSourceName: '示例书源 - 笔趣阁',
                bookSourceUrl: 'https://example.com',
                bookSourceGroup: '示例',
                searchUrl: 'https://example.com/search.php?q={{key}}',
                enabled: true,
                ruleSearch: {
                    "bookList": ".result-list .result-item",
                    "name": ".result-game-item-title a",
                    "author": ".result-game-item-info span:eq(0)",
                    "bookUrl": ".result-game-item-title a@href",
                    "coverUrl": ".result-game-item-pic img@src",
                    "lastChapter": ".result-game-item-info span:eq(2) a"
                },
                ruleBookInfo: {
                    "name": "#info h1",
                    "author": "#info p:eq(0)",
                    "intro": "#intro",
                    "coverUrl": "#fmimg img@src",
                    "tocUrl": "",
                    "lastChapter": "#info p:eq(3) a"
                },
                ruleToc: {
                    "chapterList": "#list dl dd",
                    "chapterName": "a",
                    "chapterUrl": "a@href"
                },
                ruleContent: {
                    "content": "#content"
                }
            }
        ];
    }
}

window.HelpManager = HelpManager;
