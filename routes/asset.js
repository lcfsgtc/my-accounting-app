const path = require('path');
module.exports = (app, Asset, requireLogin,mongoose, path, querystring, Parser,formatDate) => {

    // 资产列表页面
    app.get('/assets', requireLogin, async (req, res) => {
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