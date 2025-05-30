const path = require('path');
const querystring = require('querystring');
const mongoose = require('mongoose'); // 引入 Mongoose 模块
module.exports = (app, Income, requireLogin,mongoose, path, querystring, Parser,formatDate) => {
    // 收入列表页面
    app.get('/incomes', requireLogin, async (req, res) => {
        try {
            const { startDate, endDate, category, subcategory } = req.query;
            const userId = req.session.userId;

            let query = { userId: new mongoose.Types.ObjectId(String(userId)) };

            if (startDate && endDate) {
                query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
            }

            if (category) {
                query.category = category;
            }

            if (subcategory) {
                query.subcategory = subcategory;
            }
            const queryString = querystring.encode(req.query); //生成查询字符串
            const incomes = await Income.find(query).sort({ date: 'desc' });
            res.render('incomes/index', { incomes: incomes, queryString: queryString, path: path , __dirname: __dirname , basedir:path.join(__basedir, 'views') });// 传递 path  __dirname, basedir: path.join(__dirname, 'views')
        } catch (err) {
            console.error(err);
            res.status(500).send('Server Error');
        }
    });
    // 导出收入
    app.get('/incomes/export', requireLogin, async (req, res) => {
            try {
                const { startDate, endDate, category, subcategory } = req.query;
                const userId = req.session.userId;

                let query = { userId: new mongoose.Types.ObjectId(String(userId)) };

                if (startDate && endDate) {
                    query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
                }

                if (category) {
                    query.category = category;
                }

                if (subcategory) {
                    query.subcategory = subcategory;
                }

                const incomes = await Income.find(query).sort({ date: 'desc' });

                if (!incomes || incomes.length === 0) {
                    return res.status(404).send('No income data found.');
                }
                // 转换交易记录为 JSON 格式，并格式化日期
                const formattedincomes = incomes.map(income => {
                    return {
                        description: income.description,
                        amount: income.amount,
                        category: income.category,
                        subcategory: income.subcategory,
                        date: formatDate(income.date)
                    };
                });

                const fields = ['description', 'amount', 'category', 'subcategory', 'date'];
                const opts = { fields };

                try {
                    const parser = new Parser(opts);
                    const csv = parser.parse(formattedincomes);

                    res.header('Content-Type', 'text/csv');
                    res.attachment('income.csv');
                    return res.send(csv);
                } catch (err) {
                    console.error(err);
                    return res.status(500).send('Error generating CSV.');
                }

            } catch (err) {
                console.error(err);
                res.status(500).send('Server Error');
            }
        });
        // 收入统计路由
    app.get('/incomes/statistics', requireLogin, async (req, res) => {
        try {
            const { startDate, endDate, categoryType, minAmount, maxAmount, period } = req.query;
            const userId = req.session.userId;

            let match = { userId: new mongoose.Types.ObjectId(String(userId) )};

            // 时间段过滤
            if (startDate && endDate) {
                match.date = {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                };
            }

            // 金额范围过滤
            if (minAmount) {
                match.amount = { $gte: parseFloat(minAmount) };
            }
            if (maxAmount) {
                match.amount = { ...match.amount, $lte: parseFloat(maxAmount) };
            }

            let groupBy = {};
            if (categoryType && (categoryType === 'category' || categoryType === 'subcategory')) {
                groupBy = { _id: `$${categoryType}` };
            } else if (period === 'year') {
                groupBy = { _id: { $year: '$date' } };
            } else if (period === 'month') {
                groupBy = { _id: { $year: '$date', $month: '$date' } };
            } else {
                groupBy = { _id: null }; //所有
            }

            const pipeline = [
                { $match: match },
                { $group: { _id: groupBy._id, totalAmount: { $sum: '$amount' } } }
            ];

            const statistics = await Income.aggregate(pipeline);

            res.render('incomes/statistics', { statistics: statistics, startDate, endDate, categoryType, minAmount, maxAmount, period });
        } catch (err) {
            console.error(err);
            res.status(500).send('Server Error');
        }
    });
    // 添加收入记录页面
    app.get('/incomes/add', requireLogin, (req, res) => {
        res.render('incomes/add');
    });
    // 添加收入记录
    app.post('/incomes/add', requireLogin, async (req, res) => {
        try {
            const { description, amount, category, subcategory, date } = req.body;
            console.log("Received date:", date);
            //const parsedDate = new Date(date + 'Z'); // Append 'Z' for UTC
            //const parsedDate = new Date(date)
            //console.log("Parsed date:", parsedDate);           
            const newIncome = new Income({
                description: description,
                amount: amount,
                category: category,
                subcategory: subcategory,
                date: date,
                userId: req.session.userId
            });
            await newIncome.save();
            res.redirect('/incomes');
        } catch (err) {
            console.error(err);
            res.status(500).send('Server Error');
        }
    });
    // 删除收入记录
    app.post('/incomes/delete/:id', requireLogin, async (req, res) => {
        try {
            const id = req.params.id;
            await Income.findByIdAndDelete(id);
            res.redirect('/incomes');
        } catch (err) {
            console.error(err);
            res.status(500).send('Server Error');
        }
    });
    // 获取要编辑的收入记录
    app.get('/incomes/edit/:id', requireLogin, async (req, res) => {
        try {
            const id = req.params.id;
            const income = await Income.findById(id);
            res.render('incomes/edit', { income: income });
        } catch (err) {
            console.error(err);
            res.status(500).send('Server Error');
        }
    });
    // 更新收入记录
    app.post('/incomes/edit/:id', requireLogin, async (req, res) => {
        try {
            const id = req.params.id;
            const { description, amount, category, subcategory, date } = req.body;
            console.log("Received date:", date);
            //const parsedDate = new Date(date + 'Z'); // Append 'Z' for UTC
            //const parsedDate = new Date(date)
            //console.log("Parsed date:", parsedDate);               
            await Income.findByIdAndUpdate(id, {
                description: description,
                amount: amount,
                category: category,
                subcategory: subcategory,
                date: date
            });
            res.redirect('/incomes');
        } catch (err) {
            console.error(err);
            res.status(500).send('Server Error');
        }
    });
}