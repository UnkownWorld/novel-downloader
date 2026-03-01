/**
 * 规则解析引擎
 * 参考 Legado AnalyzeRule.kt
 * 支持 XPath, JSONPath, CSS选择器, JS, 正则表达式
 */

class AnalyzeRule {
    constructor(content, baseUrl = '', source = null) {
        this.content = content;
        this.baseUrl = baseUrl;
        this.source = source;
        this.isJSON = this.checkIsJSON(content);
        this.isRegex = false;
        
        // 解析器实例
        this.jsonPath = null;
        this.domParser = null;
    }
    
    /**
     * 检查是否为JSON
     */
    checkIsJSON(content) {
        if (!content) return false;
        const str = content.toString().trim();
        return str.startsWith('{') || str.startsWith('[');
    }
    
    /**
     * 获取字符串结果
     * @param {string} ruleStr 规则字符串
     * @param {boolean} isUrl 是否为URL
     */
    getString(ruleStr, isUrl = false) {
        if (!ruleStr) return '';
        
        const rules = this.splitRule(ruleStr);
        let result = this.content;
        
        for (const rule of rules) {
            if (result == null) return '';
            
            switch (rule.mode) {
                case 'js':
                    result = this.evalJS(rule.rule, result);
                    break;
                case 'json':
                    result = this.getJsonString(result, rule.rule);
                    break;
                case 'xpath':
                    result = this.getXPathString(result, rule.rule);
                    break;
                case 'regex':
                    result = this.getRegexString(result, rule.rule, rule.replaceRegex, rule.replacement);
                    break;
                default:
                    result = this.getCssString(result, rule.rule);
            }
            
            // 处理正则替换
            if (rule.replaceRegex && rule.mode !== 'regex') {
                result = this.applyReplace(result, rule.replaceRegex, rule.replacement);
            }
        }
        
        if (result == null) return '';
        
        let str = result.toString();
        
        // HTML反转义
        if (str.includes('&')) {
            str = this.unescapeHtml(str);
        }
        
        // URL处理
        if (isUrl) {
            return this.getAbsoluteUrl(str);
        }
        
        return str;
    }
    
    /**
     * 获取列表结果
     * @param {string} ruleStr 规则字符串
     */
    getElements(ruleStr) {
        if (!ruleStr) return [];
        
        const rules = this.splitRule(ruleStr);
        let result = this.content;
        
        for (const rule of rules) {
            if (result == null) return [];
            
            switch (rule.mode) {
                case 'js':
                    result = this.evalJS(rule.rule, result);
                    break;
                case 'json':
                    result = this.getJsonList(result, rule.rule);
                    break;
                case 'xpath':
                    result = this.getXPathList(result, rule.rule);
                    break;
                case 'regex':
                    result = this.getRegexList(result, rule.rule);
                    break;
                default:
                    result = this.getCssList(result, rule.rule);
            }
        }
        
        if (Array.isArray(result)) {
            return result;
        }
        return result ? [result] : [];
    }
    
    /**
     * 获取字符串列表
     */
    getStringList(ruleStr, isUrl = false) {
        const elements = this.getElements(ruleStr);
        return elements.map(el => {
            if (typeof el === 'string') {
                return isUrl ? this.getAbsoluteUrl(el) : el;
            }
            return isUrl ? this.getAbsoluteUrl(el.toString()) : el.toString();
        });
    }
    
    /**
     * 拆分规则
     */
    splitRule(ruleStr) {
        if (!ruleStr) return [];
        
        const rules = [];
        let currentMode = 'default';
        let start = 0;
        
        // 检查是否以:开头（正则模式）
        if (ruleStr.startsWith(':')) {
            currentMode = 'regex';
            this.isRegex = true;
            start = 1;
        }
        
        // 处理JS规则 {{js}} 或 @js:
        const jsPattern = /\{\{([\s\S]*?)\}\}|@js:([\s\S]*?)(?=\{\{|$)/g;
        let match;
        let lastIndex = start;
        
        while ((match = jsPattern.exec(ruleStr)) !== null) {
            // 添加JS之前的规则
            if (match.index > lastIndex) {
                const beforeRule = ruleStr.substring(lastIndex, match.index).trim();
                if (beforeRule) {
                    rules.push(this.parseRule(beforeRule, currentMode));
                }
            }
            
            // 添加JS规则
            const jsCode = match[1] || match[2];
            if (jsCode) {
                rules.push({ mode: 'js', rule: jsCode.trim() });
            }
            
            lastIndex = match.index + match[0].length;
        }
        
        // 添加剩余规则
        if (lastIndex < ruleStr.length) {
            const remaining = ruleStr.substring(lastIndex).trim();
            if (remaining) {
                rules.push(this.parseRule(remaining, currentMode));
            }
        }
        
        return rules.length > 0 ? rules : [{ mode: currentMode, rule: ruleStr }];
    }
    
    /**
     * 解析单个规则
     */
    parseRule(ruleStr, defaultMode = 'default') {
        let mode = defaultMode;
        let rule = ruleStr;
        let replaceRegex = '';
        let replacement = '';
        
        // 检查规则前缀
        if (rule.startsWith('@CSS:') || rule.startsWith('@css:')) {
            mode = 'css';
            rule = rule.substring(5);
        } else if (rule.startsWith('@XPath:') || rule.startsWith('@xpath:')) {
            mode = 'xpath';
            rule = rule.substring(7);
        } else if (rule.startsWith('@Json:') || rule.startsWith('@json:')) {
            mode = 'json';
            rule = rule.substring(6);
        } else if (rule.startsWith('//') || rule.startsWith('./')) {
            mode = 'xpath';
        } else if (this.isJSON || rule.startsWith('$.') || rule.startsWith('$[')) {
            mode = 'json';
        } else if (rule.startsWith('@')) {
            mode = 'css';
        }
        
        // 处理正则替换 ##regex##replacement
        const replaceParts = rule.split('##');
        if (replaceParts.length > 1) {
            rule = replaceParts[0];
            replaceRegex = replaceParts[1] || '';
            replacement = replaceParts[2] || '';
        }
        
        return { mode, rule, replaceRegex, replacement };
    }
    
    /**
     * JSONPath解析 - 获取字符串
     */
    getJsonString(content, rule) {
        try {
            const data = typeof content === 'string' ? JSON.parse(content) : content;
            const result = this.jsonPathQuery(data, rule);
            if (Array.isArray(result)) {
                return result.length > 0 ? result[0] : '';
            }
            return result != null ? result.toString() : '';
        } catch (e) {
            console.error('JSON解析错误:', e);
            return '';
        }
    }
    
    /**
     * JSONPath解析 - 获取列表
     */
    getJsonList(content, rule) {
        try {
            const data = typeof content === 'string' ? JSON.parse(content) : content;
            const result = this.jsonPathQuery(data, rule);
            return Array.isArray(result) ? result : [result];
        } catch (e) {
            console.error('JSON解析错误:', e);
            return [];
        }
    }
    
    /**
     * 简化的JSONPath查询
     */
    jsonPathQuery(data, path) {
        if (!path || path === '$') return data;
        
        // 移除开头的$.
        path = path.replace(/^\$\.?/, '');
        
        const parts = path.split(/[.\[\]]+/).filter(p => p);
        let result = data;
        
        for (const part of parts) {
            if (result == null) return null;
            
            // 处理数组索引
            if (/^\d+$/.test(part)) {
                result = result[parseInt(part)];
            } else if (part === '*') {
                if (Array.isArray(result)) {
                    return result;
                } else if (typeof result === 'object') {
                    return Object.values(result);
                }
            } else {
                result = result[part];
            }
        }
        
        return result;
    }
    
    /**
     * XPath解析 - 获取字符串
     */
    getXPathString(content, rule) {
        try {
            const doc = this.parseDOM(content);
            const result = doc.evaluate(rule, doc, null, XPathResult.STRING_TYPE, null);
            return result.stringValue || '';
        } catch (e) {
            console.error('XPath解析错误:', e);
            return '';
        }
    }
    
    /**
     * XPath解析 - 获取列表
     */
    getXPathList(content, rule) {
        try {
            const doc = this.parseDOM(content);
            const result = doc.evaluate(rule, doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            const list = [];
            for (let i = 0; i < result.snapshotLength; i++) {
                const node = result.snapshotItem(i);
                list.push(node.textContent || node.outerHTML || '');
            }
            return list;
        } catch (e) {
            console.error('XPath解析错误:', e);
            return [];
        }
    }
    
    /**
     * CSS选择器解析 - 获取字符串
     */
    getCssString(content, rule) {
        try {
            const doc = this.parseDOM(content);
            const element = doc.querySelector(rule);
            if (!element) return '';
            
            // 获取属性
            const attrMatch = rule.match(/@([a-zA-Z]+)$/);
            if (attrMatch) {
                return element.getAttribute(attrMatch[1]) || '';
            }
            
            // 获取文本或HTML
            if (rule.includes('@html')) {
                return element.innerHTML;
            }
            return element.textContent || '';
        } catch (e) {
            console.error('CSS解析错误:', e);
            return '';
        }
    }
    
    /**
     * CSS选择器解析 - 获取列表
     */
    getCssList(content, rule) {
        try {
            const doc = this.parseDOM(content);
            const elements = doc.querySelectorAll(rule.replace(/@[a-zA-Z]+$/, ''));
            const list = [];
            
            // 检查属性选择
            const attrMatch = rule.match(/@([a-zA-Z]+)$/);
            const isHtml = rule.includes('@html');
            
            elements.forEach(el => {
                if (attrMatch) {
                    list.push(el.getAttribute(attrMatch[1]) || '');
                } else if (isHtml) {
                    list.push(el.innerHTML);
                } else {
                    list.push(el.textContent || '');
                }
            });
            
            return list;
        } catch (e) {
            console.error('CSS解析错误:', e);
            return [];
        }
    }
    
    /**
     * 正则解析 - 获取字符串
     */
    getRegexString(content, rule, replaceRegex = '', replacement = '') {
        try {
            const regex = new RegExp(rule, 'gs');
            const match = regex.exec(content.toString());
            if (match) {
                let result = match[0];
                if (replaceRegex) {
                    result = result.replace(new RegExp(replaceRegex, 'g'), replacement);
                }
                return result;
            }
            return '';
        } catch (e) {
            console.error('正则解析错误:', e);
            return '';
        }
    }
    
    /**
     * 正则解析 - 获取列表
     */
    getRegexList(content, rule) {
        try {
            const regex = new RegExp(rule, 'gs');
            const list = [];
            let match;
            while ((match = regex.exec(content.toString())) !== null) {
                list.push(match[0]);
            }
            return list;
        } catch (e) {
            console.error('正则解析错误:', e);
            return [];
        }
    }
    
    /**
     * 执行JS代码
     */
    evalJS(code, result) {
        try {
            const func = new Function('result', 'java', 'baseUrl', 'source', code);
            return func(result, this, this.baseUrl, this.source);
        } catch (e) {
            console.error('JS执行错误:', e);
            return '';
        }
    }
    
    /**
     * 应用正则替换
     */
    applyReplace(content, regex, replacement) {
        if (!regex) return content;
        try {
            return content.toString().replace(new RegExp(regex, 'g'), replacement || '');
        } catch (e) {
            return content;
        }
    }
    
    /**
     * 解析DOM
     */
    parseDOM(content) {
        if (this.domParser) return this.domParser;
        
        const parser = new DOMParser();
        this.domParser = parser.parseFromString(content.toString(), 'text/html');
        return this.domParser;
    }
    
    /**
     * HTML反转义
     */
    unescapeHtml(str) {
        const entities = {
            '&amp;': '&',
            '&lt;': '<',
            '&gt;': '>',
            '&quot;': '"',
            '&#39;': "'",
            '&nbsp;': ' '
        };
        return str.replace(/&[a-z]+;|&#\d+;/gi, match => entities[match] || match);
    }
    
    /**
     * 获取绝对URL
     */
    getAbsoluteUrl(url) {
        if (!url) return '';
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return url;
        }
        if (url.startsWith('//')) {
            return 'https:' + url;
        }
        if (this.baseUrl) {
            try {
                return new URL(url, this.baseUrl).href;
            } catch (e) {
                return url;
            }
        }
        return url;
    }
    
    /**
     * JS扩展方法 - ajax请求
     */
    async ajax(url) {
        try {
            const response = await fetch(url);
            return await response.text();
        } catch (e) {
            console.error('ajax错误:', e);
            return '';
        }
    }
}

// 导出
window.AnalyzeRule = AnalyzeRule;
