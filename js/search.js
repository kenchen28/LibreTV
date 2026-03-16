async function searchByAPIAndKeyWord(apiId, query) {
    try {
        let apiUrl, apiName, apiBaseUrl;
        
        // 处理自定义API
        if (apiId.startsWith('custom_')) {
            const customIndex = apiId.replace('custom_', '');
            const customApi = getCustomApiInfo(customIndex);
            if (!customApi) return [];
            
            apiBaseUrl = customApi.url;
            apiUrl = apiBaseUrl + API_CONFIG.search.path + encodeURIComponent(query);
            apiName = customApi.name;
        } else {
            // 内置API
            if (!API_SITES[apiId]) return [];
            apiBaseUrl = API_SITES[apiId].api;
            apiUrl = apiBaseUrl + API_CONFIG.search.path + encodeURIComponent(query);
            apiName = API_SITES[apiId].name;
        }
        
        // 添加超时处理
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        // 添加鉴权参数到代理URL
        const proxiedUrl = await window.ProxyAuth?.addAuthToProxyUrl ? 
            await window.ProxyAuth.addAuthToProxyUrl(PROXY_URL + encodeURIComponent(apiUrl)) :
            PROXY_URL + encodeURIComponent(apiUrl);
        
        const response = await fetch(proxiedUrl, {
            headers: API_CONFIG.search.headers,
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            return [];
        }
        
        const data = await response.json();
        
        if (!data || !data.list || !Array.isArray(data.list) || data.list.length === 0) {
            return [];
        }
        
        // 过滤结果：只保留名称中包含搜索关键词的项目，防止API返回全部内容
        // 将查询拆分为关键词（按空格、冒号、标点分割），过滤掉太短的词
        const queryKeywords = query.toLowerCase()
            .split(/[\s:：,，、;；!！?？·\-—]+/)
            .filter(k => k.length >= 2);
        // 如果无法拆分出有效关键词，用完整查询作为匹配
        const matchTerms = queryKeywords.length > 0 ? queryKeywords : [query.toLowerCase()];
        
        const filteredList = data.list.filter(item => {
            const vodName = (item.vod_name || '').toLowerCase();
            // 任意一个关键词匹配即可
            return matchTerms.some(term => vodName.includes(term));
        });
        
        if (filteredList.length === 0) {
            return [];
        }
        
        // 处理第一页结果
        const results = filteredList.map(item => ({
            ...item,
            source_name: apiName,
            source_code: apiId,
            api_url: apiId.startsWith('custom_') ? getCustomApiInfo(apiId.replace('custom_', ''))?.url : undefined
        }));
        
        // 获取总页数
        const pageCount = data.pagecount || 1;
        
        // 如果第一页的匹配率很低（<10%），说明API可能返回了全部内容而非搜索结果
        // 此时不再获取更多页，避免拉取数千条无关结果
        const matchRate = filteredList.length / data.list.length;
        const shouldFetchMore = matchRate > 0.1 || data.list.length <= 20;
        
        // 确定需要获取的额外页数 (最多获取maxPages页)
        const pagesToFetch = shouldFetchMore ? Math.min(pageCount - 1, API_CONFIG.search.maxPages - 1) : 0;
        
        // 如果有额外页数，获取更多页的结果
        if (pagesToFetch > 0) {
            const additionalPagePromises = [];
            
            for (let page = 2; page <= pagesToFetch + 1; page++) {
                // 构建分页URL
                const pageUrl = apiBaseUrl + API_CONFIG.search.pagePath
                    .replace('{query}', encodeURIComponent(query))
                    .replace('{page}', page);
                
                // 创建获取额外页的Promise
                const pagePromise = (async () => {
                    try {
                        const pageController = new AbortController();
                        const pageTimeoutId = setTimeout(() => pageController.abort(), 15000);
                        
                        // 添加鉴权参数到代理URL
                        const proxiedPageUrl = await window.ProxyAuth?.addAuthToProxyUrl ? 
                            await window.ProxyAuth.addAuthToProxyUrl(PROXY_URL + encodeURIComponent(pageUrl)) :
                            PROXY_URL + encodeURIComponent(pageUrl);
                        
                        const pageResponse = await fetch(proxiedPageUrl, {
                            headers: API_CONFIG.search.headers,
                            signal: pageController.signal
                        });
                        
                        clearTimeout(pageTimeoutId);
                        
                        if (!pageResponse.ok) return [];
                        
                        const pageData = await pageResponse.json();
                        
                        if (!pageData || !pageData.list || !Array.isArray(pageData.list)) return [];
                        
                        // 过滤结果：只保留名称中包含搜索关键词的项目
                        const filteredPageList = pageData.list.filter(item => {
                            const vodName = (item.vod_name || '').toLowerCase();
                            return matchTerms.some(term => vodName.includes(term));
                        });
                        
                        if (filteredPageList.length === 0) return [];
                        
                        // 处理当前页结果
                        return filteredPageList.map(item => ({
                            ...item,
                            source_name: apiName,
                            source_code: apiId,
                            api_url: apiId.startsWith('custom_') ? getCustomApiInfo(apiId.replace('custom_', ''))?.url : undefined
                        }));
                    } catch (error) {
                        console.warn(`API ${apiId} 第${page}页搜索失败:`, error);
                        return [];
                    }
                })();
                
                additionalPagePromises.push(pagePromise);
            }
            
            // 等待所有额外页的结果
            const additionalResults = await Promise.all(additionalPagePromises);
            
            // 合并所有页的结果
            additionalResults.forEach(pageResults => {
                if (pageResults.length > 0) {
                    results.push(...pageResults);
                }
            });
        }
        
        return results;
    } catch (error) {
        console.warn(`API ${apiId} 搜索失败:`, error);
        return [];
    }
}