/**
 * 规则解析器 - 参考Legado实现
 * 支持: CSS选择器, XPath, JSONPath, JS规则, 正则表达式
 */

class RuleParser {
    constructor(debug = false) {
        this.debug = debug;
        this.variables = {};  // 变量存储
    }

    /**
     * 解析规则字符串，返回结果
     * @param {string} ruleStr - 规则字符串
     * @param {Element|Document} context - 上下文元素
     * @param {string} baseUrl - 基础URL
     * @returns {string}
     */
    parse(ruleStr, context, baseUrl = '') {
        if (!ruleStr) return '';
        
        try {
            // 分解规则链
            const rules = this.splitRuleChain(ruleStr);
            let result = context;
            
            for (const rule of rules) {
                if (!result) break;
                result = this.executeRule(rule, result, baseUrl);
            }
            
            return this.toString(result);
        } catch (e) {
            console.error('规则解析错误:', e, ruleStr);
            return '';
        }
    }

    /**
     * 解析规则返回元素列表
     */
    parseElements(ruleStr, context, baseUrl = '') {
        if (!ruleStr) return [];
        
        try {
            const rules = this.splitRuleChain(ruleStr);
            let result = context;
            
            for (const rule of rules) {
                if (!result) break;
                result = this.executeRuleForElements(rule, result, baseUrl);
            }
            
            return Array.isArray(result) ? result : [result];
        } catch (e) {
            console.error('规则解析错误:', e, ruleStr);
            return [];
        }
    }

    /**
     * 分解规则链（按@分隔，但保留@@和@CSS:等）
     */
    splitRuleChain(ruleStr) {
        const rules = [];
        let current = '';
        let i = 0;
        
        while (i < ruleStr.length) {
            // 检查特殊前缀
            if (ruleStr.substring(i).startsWith('@CSS:')) {
                // CSS规则，找到下一个非转义的@
                const start = i;
                i += 5;
                while (i < ruleStr.length && ruleStr[i] !== '@') i++;
                rules.push({ type: 'css', value: ruleStr.substring(start + 5, i) });
                i++;
            } else if (ruleStr.substring(i).startsWith('@XPath:')) {
                const start = i;
                i += 7;
                while (i < ruleStr.length && ruleStr[i] !== '@') i++;
                rules.push({ type: 'xpath', value: ruleStr.substring(start + 7, i) });
                i++;
            } else if (ruleStr.substring(i).startsWith('@Json:')) {
                const start = i;
                i += 6;
                while (i < ruleStr.length && ruleStr[i] !== '@') i++;
                rules.push({ type: 'json', value: ruleStr.substring(start + 6, i) });
                i++;
            } else if (ruleStr.substring(i).startsWith('@@')) {
                // 强制CSS
                current += '@@';
                i += 2;
            } else if (ruleStr[i] === '@') {
                // 普通规则分隔
                if (current) {
                    rules.push(this.parseSingleRule(current));
                    current = '';
                }
                i++;
            } else {
                current += ruleStr[i];
                i++;
            }
        }
        
        if (current) {
            rules.push(this.parseSingleRule(current));
        }
        
        return rules;
    }

    /**
     * 解析单个规则
     */
    parseSingleRule(ruleStr) {
        // 检查是否是JS规则
        if (ruleStr.startsWith('<js>') || ruleStr.startsWith('@js:')) {
            return { type: 'js', value: ruleStr.replace(/^<js>|<\/js>$|^@js:/g, '') };
        }
        
        // 检查是否是正则
        if (ruleStr.startsWith(':')) {
            return { type: 'regex', value: ruleStr.substring(1) };
        }
        
        // 检查是否是XPath
        if (ruleStr.startsWith('/')) {
            return { type: 'xpath', value: ruleStr };
        }
        
        // 检查是否是JSONPath
        if (ruleStr.startsWith('$.') || ruleStr.startsWith('$[')) {
            return { type: 'json', value: ruleStr };
        }
        
        // 检查是否包含##替换规则
        const replaceMatch = ruleStr.match(/^(.+?)##(.+?)(?:##(.+?))?$/);
        if (replaceMatch) {
            return {
                type: 'css',
                value: replaceMatch[1],
                replaceRegex: replaceMatch[2],
                replacement: replaceMatch[3] || ''
            };
        }
        
        // 默认CSS选择器
        return { type: 'css', value: ruleStr };
    }

    /**
     * 执行单个规则
     */
    executeRule(rule, context, baseUrl) {
        switch (rule.type) {
            case 'css':
                return this.executeCss(rule, context, baseUrl);
            case 'xpath':
                return this.executeXPath(rule, context);
            case 'json':
                return this.executeJson(rule, context);
            case 'js':
                return this.executeJs(rule, context, baseUrl);
            case 'regex':
                return this.executeRegex(rule, context);
            default:
                return context;
        }
    }

    /**
     * 执行CSS选择器
     */
    executeCss(rule, context, baseUrl) {
        let selector = rule.value;
        let attr = null;
        
        // 检查属性选择器 (如: a@href, img@src)
        if (selector.includes('@')) {
            const parts = selector.split('@');
            selector = parts[0];
            attr = parts[1];
        }
        
        // 处理.0, .1等索引
        let index = -1;
        const indexMatch = selector.match(/\.(\d+)$/);
        if (indexMatch) {
            index = parseInt(indexMatch[1]);
            selector = selector.substring(0, selector.length - indexMatch[0].length);
        }
        
        // 处理class.tag格式 (如: author.0@text)
        selector = selector.replace(/\./g, '.');
        
        let elements;
        if (context.querySelectorAll) {
            elements = context.querySelectorAll(selector);
        } else if (context.querySelector) {
            const el = context.querySelector(selector);
            elements = el ? [el] : [];
        } else {
            return '';
        }
        
        if (index >= 0 && index < elements.length) {
            elements = [elements[index]];
        }
        
        if (elements.length === 0) return '';
        
        // 获取结果
        let result;
        if (attr) {
            if (attr === 'text' || attr === 'textContent') {
                result = Array.from(elements).map(el => el.textContent.trim()).join('\n');
            } else if (attr === 'html' || attr === 'innerHTML') {
                result = Array.from(elements).map(el => el.innerHTML).join('\n');
            } else if (attr === 'href' || attr === 'src') {
                let url = elements[0].getAttribute(attr) || '';
                if (url && !url.startsWith('http') && baseUrl) {
                    url = new URL(url, baseUrl).href;
                }
                result = url;
            } else {
                result = elements[0].getAttribute(attr) || '';
            }
        } else {
            result = elements.length === 1 ? elements[0] : Array.from(elements);
        }
        
        // 应用正则替换
        if (rule.replaceRegex && result) {
            result = result.replace(new RegExp(rule.replaceRegex, 'g'), rule.replacement || '');
        }
        
        return result;
    }

    /**
     * 执行XPath (简化实现)
     */
    executeXPath(rule, context) {
        // 浏览器环境不支持原生XPath，需要polyfill
        console.warn('XPath暂不支持:', rule.value);
        return '';
    }

    /**
     * 执行JSONPath
     */
    executeJson(rule, context) {
        try {
            let json = context;
            if (typeof context === 'string') {
                json = JSON.parse(context);
            }
            
            const path = rule.value;
            // 简单JSONPath实现
            const parts = path.replace(/^\$\.?/, '').split(/\.|\[|\]/).filter(p => p);
            let result = json;
            
            for (const part of parts) {
                if (result === null || result === undefined) return '';
                if (typeof part === 'string' && !isNaN(part)) {
                    result = result[parseInt(part)];
                } else {
                    result = result[part];
                }
            }
            
            return result;
        } catch (e) {
            return '';
        }
    }

    /**
     * 执行JS规则
     */
    async executeJs(rule, context, baseUrl) {
        try {
            const jsCode = rule.value;
            const executor = new JsRuleExecutor();
            
            return await executor.execute(jsCode, {
                result: this.toString(context),
                baseUrl: baseUrl,
                src: context
            });
        } catch (e) {
            console.error('JS执行错误:', e);
            return '';
        }
    }

    /**
     * 执行正则
     */
    executeRegex(rule, context) {
        try {
            const text = this.toString(context);
            const regex = new RegExp(rule.value, 'g');
            const matches = text.match(regex);
            return matches ? matches.join('\n') : '';
        } catch (e) {
            return '';
        }
    }

    /**
     * 转换为字符串
     */
    toString(value) {
        if (value === null || value === undefined) return '';
        if (typeof value === 'string') return value;
        if (value.textContent) return value.textContent.trim();
        if (Array.isArray(value)) {
            return value.map(v => this.toString(v)).join('\n');
        }
        return String(value);
    }

    /**
     * 设置变量
     */
    put(key, value) {
        this.variables[key] = value;
        return value;
    }

    /**
     * 获取变量
     */
    get(key) {
        return this.variables[key] || '';
    }
}

// 导出
window.RuleParser = RuleParser;
