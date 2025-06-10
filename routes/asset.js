const path = require('path');
const querystring = require('querystring');
const mongoose = require('mongoose'); // 引入 Mongoose 模块
const { Parser } = require('json2csv'); // 引入 json2csv 的 Parser

module.exports = (app, Asset, requireLogin, mongoose, path, querystring, formatDate) => {
    // 资产列表页面
    app.get('/assets', requireLogin, async (req, res) => {
        try {
            const userId = req.session.userId;
            const query = req.query; // 获取所有查询参数

            let findQuery = { user: userId }; // 初始查询条件

            // 根据查询参数构建筛选条件
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

            const assets = await Asset.find(findQuery).sort({ purchaseDate: -1 });

            let totalCost = 0;
            let totalCurrentValue = 0;
            assets.forEach(asset => {
                totalCost += parseFloat(asset.cost || 0) * parseFloat(asset.quantity || 0);
                totalCurrentValue += parseFloat(asset.currentValue || 0) * parseFloat(asset.quantity || 0);
            });
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

            totalCost = totalCost.toFixed(2);
            totalCurrentValue = totalCurrentValue.toFixed(2);

            // ====== 生成 queryString ======
            const queryString = querystring.stringify(query); // 将查询对象转换为查询字符串
            // 如果存在查询参数，添加 '?' 前缀
            const fullQueryString = queryString ? `?${queryString}` : '';
            // ===================================

            res.render('assets/list', {
                assets: assets,
                assetTypeCounts: assetTypeCounts,
                totalCost: totalCost,
                totalCurrentValue: totalCurrentValue,
                query: query, // 用于填充搜索表单
                queryString: fullQueryString ,// 用于导出链接
                distinctAssetTypes: Array.from(distinctAssetTypes).sort() // 传递所有不重复的资产类型
            });
        } catch (err) {
            console.error(err);
            res.status(500).send('Server Error');
        }
    });
    // 新增：资产统计页面
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
                statistics: statistics,
                query: req.query, // 将查询参数传回前端，以便填充表单
                distinctAssetTypes: distinctAssetTypes.sort(), // 传递不重复的类型列表
                formatDate: formatDate // 传递 formatDate 辅助函数
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
        res.render('assets/add');
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
            res.render('assets/edit', { asset: asset });
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
            res.render('assets/view', { asset: asset });
        } catch (err) {
                console.error(err);
            res.status(500).send('Server Error');
        }
    });
};