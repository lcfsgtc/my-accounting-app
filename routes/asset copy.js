const path = require('path');
const querystring = require('querystring');
const mongoose = require('mongoose'); // 引入 Mongoose 模块
module.exports = (app, Asset, requireLogin,mongoose, path, querystring, Parser,formatDate) => {
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
            if (query.subcategory) { 
                findQuery.subcategory = { $regex: new RegExp(query.subcategory, 'i') };
            }

            const assets = await Asset.find(findQuery).sort({ purchaseDate: -1 });

            let totalCost = 0;
            let totalCurrentValue = 0;
            assets.forEach(asset => {
                totalCost += parseFloat(asset.cost || 0) * parseFloat(asset.quantity || 0);
                totalCurrentValue += parseFloat(asset.currentValue || 0) * parseFloat(asset.quantity || 0);
            });

            const assetTypeCounts = {};
            assets.forEach(asset => {
                const value = parseFloat(asset.currentValue || 0) * parseFloat(asset.quantity || 0);
                if (assetTypeCounts[asset.type]) {
                    assetTypeCounts[asset.type] += value;
                } else {
                    assetTypeCounts[asset.type] = value;
                }
            });

            totalCost = totalCost.toFixed(2);
            totalCurrentValue = totalCurrentValue.toFixed(2);

            // ====== 新增：生成 queryString ======
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
                queryString: fullQueryString // 新增：用于导出链接
            });
        } catch (err) {
            console.error(err);
            res.status(500).send('Server Error');
        }
    });
    // 资产列表页面
    /*app.get('/assets', requireLogin, async (req, res) => {
        try {
            const assets = await Asset.find({ user: req.session.userId }); // 只获取当前用户的资产
            let totalCost = 0;
            let totalCurrentValue = 0;
            assets.forEach(asset => {
                totalCost += asset.cost * asset.quantity;
                totalCurrentValue += asset.currentValue * asset.quantity;
            });

            // 统计每种类型的资产数量
            const assetTypeCounts = {};
            assets.forEach(asset => {
                if (assetTypeCounts[asset.type]) {
                    assetTypeCounts[asset.type] += asset.currentValue
                } else {
                    assetTypeCounts[asset.type] = asset.currentValue;
                }
            });

            res.render('assets/list', {
                assets: assets,
                assetTypeCounts: assetTypeCounts,
                totalCost: totalCost,
                totalCurrentValue: totalCurrentValue
            });
        } catch (err) {
            console.error(err);
            res.status(500).send('Server Error');
        }
    });*/

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