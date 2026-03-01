/**
 * JS规则执行器
 * 用于执行书源中的JavaScript规则
 * 参考 Legado 开源项目实现
 */

class JsRuleExecutor {
    constructor() {
        this.debug = false;
    }
    
    /**
     * 执行JS规则
     * @param {string} jsCode - JS代码
     * @param {object} context - 执行上下文
     * @returns {Promise<string>} 执行结果
     */
    async execute(jsCode, context = {}) {
        try {
            // 包装代码
            let code = jsCode.trim();
            
            // 检查是否需要添加return
            // 如果代码是简单表达式（没有分号、没有变量声明），则添加return
            const isSimpleExpression = !code.includes(';') && 
                                       !code.startsWith('var ') && 
                                       !code.startsWith('let ') && 
                                       !code.startsWith('const ') &&
                                       !code.startsWith('if ') &&
                                       !code.startsWith('for ') &&
                                       !code.startsWith('while ') &&
                                       !code.startsWith('function ');
            
            if (isSimpleExpression && !code.includes('return ')) {
                code = `return (${code});`;
            }
            
            if (this.debug) {
                console.log('执行JS代码:', code.substring(0, 200));
            }
            
            // 创建沙箱环境
            const sandbox = this.createSandbox(context);
            
            // 包装成异步函数，传递eval函数
            const wrappedCode = `
                (async function(java, result, baseUrl, book, chapter, evalFunc) {
                    // 将eval函数暴露为全局
                    const eval = evalFunc;
                    ${code}
                })
            `;
            
            // 执行代码
            const fn = eval(wrappedCode);
            const result = await fn(
                sandbox.java,
                context.result || '',
                context.baseUrl || '',
                context.book || {},
                context.chapter || {},
                sandbox.eval  // 传递eval函数
            );
            
            return result != null ? String(result) : '';
            
        } catch (e) {
            console.error('JS执行错误:', e);
            return '';
        }
    }
    
    /**
     * 创建沙箱环境
     */
    createSandbox(context) {
        const self = this;
        
        return {
            // java对象 - 模拟Legado的java API
            java: {
                /**
                 * AJAX请求
                 */
                ajax: async (url, options = {}) => {
                    return await self.ajax(url, options);
                },
                
                /**
                 * 带超时的AJAX
                 */
                ajaxWithTimeout: async (url, timeout = 30000) => {
                    return await self.ajax(url, { timeout });
                },
                
                /**
                 * POST请求
                 */
                post: async (url, body, headers = {}) => {
                    return await self.ajax(url, {
                        method: 'POST',
                        body: body,
                        headers: headers
                    });
                },
                
                /**
                 * 连接浏览器 - 打开URL（在服务端无法实现，返回空）
                 */
                connect: (url) => {
                    console.warn('java.connect 不支持:', url);
                    return '';
                },
                
                /**
                 * 启动浏览器 - 同上
                 */
                startBrowser: (url, title) => {
                    console.warn('java.startBrowser 不支持:', url);
                    return '';
                },
                
                /**
                 * 显示Toast
                 */
                toast: (msg) => {
                    console.log('Toast:', msg);
                },
                
                /**
                 * 时间戳
                 */
                timeMillis: () => Date.now(),
                
                /**
                 * 格式化时间
                 */
                formatTime: (time, pattern) => {
                    const d = new Date(time);
                    return d.toLocaleString();
                }
            },
            
            // eval函数 - 用于执行动态代码
            eval: (code) => {
                try {
                    return eval(code);
                } catch (e) {
                    console.error('eval执行错误:', e);
                    return null;
                }
            }
        };
    }
    
    /**
     * AJAX请求实现
     */
    async ajax(url, options = {}) {
        try {
            // 解析URL选项（Legado格式: "url,{headers:{...},method:'POST',body:'...'}"）
            if (typeof url === 'string' && url.includes(',{')) {
                const match = url.match(/^(.+),(\{[\s\S]+\})$/);
                if (match) {
                    url = match[1];
                    try {
                        const urlOptions = JSON.parse(match[2].replace(/'/g, '"'));
                        options = { ...options, ...urlOptions };
                    } catch (e) {}
                }
            }
            
            // 构建请求选项
            const fetchOptions = {
                method: options.method || 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'zh-CN,zh;q=0.9',
                    ...options.headers
                }
            };
            
            if (options.body && fetchOptions.method === 'POST') {
                fetchOptions.body = options.body;
            }
            
            // 发起请求
            const response = await fetch(url, fetchOptions);
            
            if (!response.ok) {
                console.error('AJAX请求失败:', response.status, url);
                return '';
            }
            
            const text = await response.text();
            return text;
            
        } catch (e) {
            console.error('AJAX错误:', e, url);
            return '';
        }
    }
    
    /**
     * 解析并执行规则
     * @param {string} rule - 规则字符串（可能包含<js>标签或@js:前缀）
     * @param {object} context - 执行上下文
     * @returns {Promise<string>} 执行结果
     */
    async parseAndExecute(rule, context = {}) {
        if (!rule) return '';
        
        // 处理 <js>...</js> 格式
        const jsTagMatch = rule.match(/<js>([\s\S]*?)<\/js>/);
        if (jsTagMatch) {
            const jsCode = jsTagMatch[1];
            const result = await this.execute(jsCode, context);
            
            // 检查是否有后续规则（如 $..content）
            const afterJs = rule.replace(/<js>[\s\S]*?<\/js>/, '').trim();
            if (afterJs) {
                return this.applyPostRule(result, afterJs);
            }
            return result;
        }
        
        // 处理 @js: 格式
        if (rule.includes('@js:')) {
            const parts = rule.split('@js:');
            if (parts.length > 1) {
                const jsCode = parts[1].split(/@css:|@xpath:|@json:|{{/)[0].trim();
                const result = await this.execute(jsCode, context);
                return result;
            }
        }
        
        // 处理 {{js}} 格式
        const jsBraceMatch = rule.match(/\{\{([\s\S]*?)\}\}/);
        if (jsBraceMatch) {
            const jsCode = jsBraceMatch[1];
            const result = await this.execute(jsCode, context);
            return rule.replace(/\{\{[\s\S]*?\}\}/, result);
        }
        
        return rule;
    }
    
    /**
     * 应用后处理规则
     */
    applyPostRule(content, rule) {
        if (!content || !rule) return content;
        
        // JSONPath规则 $..content
        if (rule.startsWith('$.')) {
            try {
                const data = JSON.parse(content);
                return this.jsonPath(data, rule);
            } catch (e) {
                return content;
            }
        }
        
        // 正则替换 ##pattern##replacement
        if (rule.includes('##')) {
            const parts = rule.split('##');
            if (parts.length >= 2) {
                const pattern = parts[1];
                const replacement = parts[2] || '';
                try {
                    const regex = new RegExp(pattern, 'g');
                    return content.replace(regex, replacement);
                } catch (e) {
                    return content;
                }
            }
        }
        
        return content;
    }
    
    /**
     * 简单JSONPath实现
     */
    jsonPath(obj, path) {
        try {
            // $..content - 递归查找
            if (path.startsWith('$..')) {
                const key = path.substring(3);
                return this.findRecursive(obj, key);
            }
            
            // $.data.content - 路径查找
            const parts = path.substring(2).split('.').filter(p => p);
            let current = obj;
            for (const part of parts) {
                if (current && typeof current === 'object') {
                    current = current[part];
                } else {
                    return '';
                }
            }
            return typeof current === 'string' ? current : JSON.stringify(current);
        } catch (e) {
            return '';
        }
    }
    
    /**
     * 递归查找属性
     */
    findRecursive(obj, key) {
        if (!obj || typeof obj !== 'object') return '';
        
        if (obj[key] !== undefined) {
            return obj[key];
        }
        
        for (const k in obj) {
            const result = this.findRecursive(obj[k], key);
            if (result) return result;
        }
        
        return '';
    }
    
    /**
     * 检查规则是否包含JS
     */
    hasJsRule(rule) {
        if (!rule) return false;
        return rule.includes('<js>') || rule.includes('@js:') || rule.includes('{{');
    }
}

// 导出
window.JsRuleExecutor = JsRuleExecutor;
