const path = require('path');
const querystring = require('querystring');
const mongoose = require('mongoose'); // 引入 Mongoose 模块
const { Parser } = require('json2csv'); // 引入 json2csv 的 Parser

module.exports = (app, Asset, requireLogin, mongoose, path, querystring, formatDate) => {
    // 资产列表页面
    app.get('/assets', requireLogin, async (req, res) => {
        try {
            const { startDate, endDate, type } = req.query;
            // --- 分页参数 ---
            const page = parseInt(req.query.page) || 1; // 当前页码，默认为第一页
            const limit = parseInt(req.query.limit) || 10; // 每页数量，默认为10条
            const skip = (page - 1) * limit; // 计算跳过的文档数量
            // ------------------
            const userId = req.session.userId;

            let findQuery = { user: userId }; // 初始查询条件

            // 日期范围过滤
            if (startDate && endDate) {
                const endOfDay = new Date(endDate);
                endOfDay.setHours(23, 59, 59, 999);
                findQuery.purchaseDate = { $gte: new Date(startDate), $lte: endOfDay };
            } else if (startDate) {
                findQuery.purchaseDate = { $gte: new Date(startDate) };
            } else if (endDate) {
                const endOfDay = new Date(endDate);
                endOfDay.setHours(23, 59, 59, 999);
                findQuery.purchaseDate = { $lte: endOfDay };
            }                    
            if (type) {
                findQuery.type = { $regex: new RegExp(req.query.type, 'i') };
            }
            // Removed: if (query.subcategory) { findQuery.subcategory = { $regex: new RegExp(query.subcategory, 'i') }; }
            // 获取总资产数量 (用于计算总页数)
            const totalAssets = await Asset.countDocuments(findQuery);
            const totalPages = Math.ceil(totalAssets / limit); // 计算总页数

            // 获取分页后的资产数据
            const assets = await Asset.find(findQuery)
                .sort({ purchaseDate: 'desc' }) // 按购置日期倒序'desc'
                .skip(skip) // 跳过
                .limit(limit); // 限制数量
            //const assets = await Asset.find(findQuery).sort({ purchaseDate: -1 });

            let totalCost = 0;
            let totalCurrentValue = 0;
            assets.forEach(asset => {
                // 确保 cost 和 quantity 是数字，以防它们是从数据库中以字符串形式返回
                const cost = parseFloat(asset.cost || 0);
                const quantity = parseFloat(asset.quantity || 0);
                totalCost += cost * quantity;    
                const currentValue = parseFloat(asset.currentValue || 0);
                totalCurrentValue += currentValue * quantity;                            
                //totalCost += parseFloat(asset.cost || 0) * parseFloat(asset.quantity || 0);
                //totalCurrentValue += parseFloat(asset.currentValue || 0) * parseFloat(asset.quantity || 0);
            });
            // 获取所有不重复的类别和自定义类型，用于筛选下拉菜单 (与支出类似)
            //const distinctCategories = await Asset.distinct('category', { user: userId });
            const distinctTypes = await Asset.distinct('type', { user: userId });

            // 在列表页直接计算类型统计 (与统计页逻辑相似但用于列表展示)
            const assetTypeCounts = {};
            // 用于获取所有不重复的资产类型，供统计页面下拉列表使用
            const distinctAssetTypes = new Set();            
            assets.forEach(asset => {
                const value = parseFloat(asset.currentValue || 0) * parseFloat(asset.quantity || 0);
                if (assetTypeCounts[asset.type]) {
                    assetTypeCounts[asset.type] += value;
                } else {
                    assetTypeCounts[asset.type] = value;
                }
                distinctAssetTypes.add(asset.type); // 收集所有类型
            });

            //totalCost = totalCost.toFixed(2);
            //totalCurrentValue = totalCurrentValue.toFixed(2);

            // ====== 生成 queryString ======
            //const queryString = querystring.stringify(query); // 将查询对象转换为查询字符串
            const currentQuery = { ...req.query };
            delete currentQuery.page;
            delete currentQuery.limit;
            const queryString = querystring.encode(currentQuery);

            res.render('assets/list', {
                activeMenu: 'assets',
                layout: 'assets/layout.ejs',
                title: '资产列表',
                pageTitle: '资产列表',                
                assets: assets,
                assetTypeCounts: assetTypeCounts,
                totalCost: totalCost,
                totalCurrentValue: totalCurrentValue,
                query: req.query, // 用于填充搜索表单
                queryString: queryString ,// 用于导出链接
                distinctTypes: distinctTypes.filter(t => t).sort(),
                distinctAssetTypes: Array.from(distinctAssetTypes).sort(), // 传递所有不重复的资产类型distinctTypes.filter(t => t).sort(), // 传递所有不重复的自定义类型 (过滤掉null/undefined)
                currentPage: page, // 当前页码
                totalPages: totalPages, // 总页数
                limit: limit, // 当前每页数量
                startDate: startDate || '', // 传递回表单，保持筛选状态
                endDate: endDate || '', // 传递回表单，保持筛选状态  
                totalAssets: totalAssets,  
                success_msg: req.flash('success_msg'), // 闪存消息
                error_msg: req.flash('error_msg') // 闪存消息                        
            });
        } catch (err) {
            console.error(err);
            req.flash('error_msg', '获取资产列表失败。'); // 使用支出代码的 flash 消息键
           // res.redirect('/assets'); // 重定向以清除查询参数并显示消息            
           res.status(500).send('Server Error');
        }
    });
    // 资产统计页面
    app.get('/assets/statistics', requireLogin, async (req, res) => {
        try {
            const userId = req.session.userId;
            const { type, startDate, endDate } = req.query; // 获取查询参数

            let findQuery = { user: userId }; // 初始查询条件

            if (startDate) {
                findQuery.purchaseDate = { ...findQuery.purchaseDate, $gte: new Date(startDate) };
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999); // 设置到当天的最后一刻
                findQuery.purchaseDate = { ...findQuery.purchaseDate, $lte: end };
            }
            if (type && type !== '') { // 如果类型不为空，则添加筛选条件
                findQuery.type = type;
            }

            // 获取所有符合条件的资产
            const assets = await Asset.find(findQuery);

            // 统计按类型汇总的现值
            const statistics = {};
            assets.forEach(asset => {
                const value = parseFloat(asset.currentValue || 0) * parseFloat(asset.quantity || 0);
                if (statistics[asset.type]) {
                    statistics[asset.type] += value;
                } else {
                    statistics[asset.type] = value;
                }
            });

            // 获取所有不重复的资产类型，用于统计页面的类型下拉列表
            const distinctAssetTypes = await Asset.distinct('type', { user: userId });

            res.render('assets/statistics', {
                activeMenu: 'assets',
                layout: 'assets/layout.ejs',
                title: '资产统计',
                pageTitle: '资产统计',                 
                statistics: statistics,
                query: req.query, // 将查询参数传回前端，以便填充表单
                distinctAssetTypes: distinctAssetTypes.sort(), // 传递不重复的类型列表
                success_msg: req.flash('success_msg'),
                error_msg: req.flash('error_msg')                
                //formatDate: formatDate // 传递 formatDate 辅助函数
            });

        } catch (err) {
            console.error('Error fetching asset statistics:', err);
            res.status(500).send('Server Error: ' + err.message);
        }
    });
    // 导出资产数据
    app.get('/assets/export', requireLogin, async (req, res) => {
        try {
            const userId = req.session.userId;
            const query = req.query; // 获取所有查询参数

            let findQuery = { user: userId }; // 初始查询条件

            // 根据查询参数构建筛选条件 (与 /assets 路由相同)
            if (query.startDate) {
                findQuery.purchaseDate = { ...findQuery.purchaseDate, $gte: new Date(query.startDate) };
            }
            if (query.endDate) {
                const endDate = new Date(query.endDate);
                endDate.setHours(23, 59, 59, 999);
                findQuery.purchaseDate = { ...findQuery.purchaseDate, $lte: endDate };
            }
            if (query.type) {
                findQuery.type = { $regex: new RegExp(query.type, 'i') };
            }
            // Removed: if (query.subcategory) { findQuery.subcategory = { $regex: new RegExp(query.subcategory, 'i') }; }

            const assetsToExport = await Asset.find(findQuery).sort({ purchaseDate: -1 }).lean(); // .lean() converts Mongoose documents to plain JavaScript objects for easier processing

            // Define fields for CSV
            const fields = [
                {
                    label: '名称',
                    value: 'name'
                },
                {
                    label: '类型',
                    value: 'type'
                },
                {
                    label: '数量',
                    value: 'quantity'
                },
                {
                    label: '成本',
                    value: 'cost'
                },
                {
                    label: '现值',
                    value: 'currentValue'
                },
                {
                    label: '购买日期',
                    value: (row) => row.purchaseDate ? row.purchaseDate.toISOString().split('T')[0]: '' // formatDate(row.purchaseDate) 
                },
                {
                    label: '状况',
                    value: 'condition'
                },
                {
                    label: '折旧方法',
                    value: 'depreciationMethod'
                },
                {
                    label: '折旧率',
                    value: 'depreciationRate'
                },
                {
                    label: '备注',
                    value: 'notes'
                }
            ];
            console.log('Type of Parser:', typeof Parser);
            console.log('Parser itself:', Parser);
            const json2csvParser = new Parser({ fields });
            const csv = json2csvParser.parse(assetsToExport);

            res.header('Content-Type', 'text/csv');
            res.attachment('assets_export.csv');
            res.send(csv);

        } catch (err) {
            console.error(err);
            res.status(500).send('Error exporting data: ' + err.message);
        }
    });

    // 添加资产页面
    app.get('/assets/add', requireLogin, (req, res) => {
        res.render('assets/add',{
            activeMenu: 'assets',
            layout: 'assets/layout.ejs',
            title: '新增资产',
            pageTitle: '新增资产',  
        });
    });

    // 添加资产 POST
    app.post('/assets/add', requireLogin, async (req, res) => {
        try {
            const newAsset = new Asset({
                name: req.body.name,
                type: req.body.type,
                quantity: req.body.quantity,
                cost: req.body.cost,
                currentValue: req.body.currentValue,
                purchaseDate: req.body.purchaseDate,
                condition: req.body.condition,
                depreciationMethod: req.body.depreciationMethod,
                depreciationRate: req.body.depreciationRate,
                notes: req.body.notes,
                user: req.session.userId  // 设置用户 ID
            });
            await newAsset.save();
            res.redirect('/assets');
        } catch (err) {
            console.error(err);
            res.status(500).send('Server Error');
        }
    });

    // 编辑资产页面
    app.get('/assets/edit/:id', requireLogin, async (req, res) => {
        try {
            const asset = await Asset.findById(req.params.id);
            if (!asset) {
                return res.status(404).send('Asset not found');
            }
            res.render('assets/edit', { 
                activeMenu: 'assets',
                layout: 'assets/layout.ejs',
                title: '编辑资产',
                pageTitle: '编辑资产', 
                asset: asset 
            });
        } catch (err) {
            console.error(err);
            res.status(500).send('Server Error');
        }
    });

    // 编辑资产 POST
    app.post('/assets/edit/:id', requireLogin, async (req, res) => {
        try {
            await Asset.findByIdAndUpdate(req.params.id, {
                name: req.body.name,
                type: req.body.type,
                quantity: req.body.quantity,
                cost: req.body.cost,
                currentValue: req.body.currentValue,
                purchaseDate: req.body.purchaseDate,
                condition: req.body.condition,
                depreciationMethod: req.body.depreciationMethod,
                depreciationRate: req.body.depreciationRate,
                notes: req.body.notes
            });
            res.redirect('/assets');
        } catch (err) {
            console.error(err);
            res.status(500).send('Server Error');
        }
    });

    // 删除资产
    app.get('/assets/delete/:id', requireLogin, async (req, res) => {
        try {
            await Asset.findByIdAndDelete(req.params.id);
            res.redirect('/assets');
        } catch (err) {
            console.error(err);
            res.status(500).send('Server Error');
        }
    });

    // 查看资产
    app.get('/assets/view/:id', requireLogin, async (req, res) => {
        try {
            const asset = await Asset.findById(req.params.id);
            if (!asset) {
                return res.status(404).send('Asset not found');
            }
            res.render('assets/view', { 
                activeMenu: 'assets',
                layout: 'assets/layout.ejs',
                title: '查看资产',
                pageTitle: '查看资产',                 
                asset: asset });
        } catch (err) {
                console.error(err);
            res.status(500).send('Server Error');
        }
    });
};