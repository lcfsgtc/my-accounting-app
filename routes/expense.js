const path = require('path');
const querystring = require('querystring');
const mongoose = require('mongoose'); // 引入 Mongoose 模块
module.exports = (app, Expense, requireLogin,mongoose, path, querystring, Parser,formatDate) => {
    // 支出列表页面
    app.get('/expenses', requireLogin, async (req, res) => {
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
             // 获取所有不重复的类别和子类别，用于筛选下拉菜单
            const distinctCategories = await Expense.distinct('category', { userId: userId });
            const distinctSubcategories = await Expense.distinct('subcategory', { userId: userId });
            const expenses = await Expense.find(query).sort({ date: 'desc' });
            res.render('expenses/index', {
                expenses: expenses,
                queryString: queryString,
                distinctCategories: distinctCategories.sort(),
                distinctSubcategories: distinctSubcategories.sort() ,             
                path: path,
                //__dirname: __dirname,
                basedir: path.join(__basedir, 'views')
            });
        } catch (err) {
            console.error(err);
            res.status(500).send('Server Error');
        }
    });
    // 导出支出
    app.get('/expenses/export', requireLogin, async (req, res) => {
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

            const expenses = await Expense.find(query).sort({ date: 'desc' });

            if (!expenses || expenses.length === 0) {
                return res.status(404).send('No expense data found.');
            }
            // 转换交易记录为 JSON 格式，并格式化日期
            const formattedexpenses = expenses.map(expense => {
                return {
                    description: expense.description,
                    amount: expense.amount,
                    category: expense.category,
                    subcategory: expense.subcategory,
                    date: formatDate(expense.date)
                };
            });

            const fields = ['description', 'amount', 'category', 'subcategory', 'date'];
            const opts = { fields };

            try {
                const parser = new Parser(opts);
                const csv = parser.parse(formattedexpenses);

                res.header('Content-Type', 'text/csv');
                res.attachment('expense.csv');
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
     // 支出统计路由
    app.get('/expenses/statistics', requireLogin, async (req, res) => {
        try {
            //const { startDate, endDate, categoryType, minAmount, maxAmount, period } = req.query;
            const { startDate, endDate, category, subcategory, minAmount, maxAmount, period } = req.query; // 修改 categoryType 为 category, subcategory
            const userId = req.session.userId;

            let match = { userId: new mongoose.Types.ObjectId(String(userId) )};

            // 时间段过滤
            /*if (startDate && endDate) {
                match.date = {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                };
            }*/
            if (startDate) { // 修改为只判断 startDate 存在
                match.date = { ...match.date, $gte: new Date(startDate) };
            }
            if (endDate) { // 修改为只判断 endDate 存在
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999); // 设置到当天的最后一刻
                match.date = { ...match.date, $lte: end };
            }    
            // 类别和子类别过滤
            if (category && category !== '') {
                match.category = category;
            }
            if (subcategory && subcategory !== '') {
                match.subcategory = subcategory;
            }                  

            // 金额范围过滤
            /*if (minAmount) {
                match.amount = { $gte: parseFloat(minAmount) };
            }
            if (maxAmount) {
                match.amount = { ...match.amount, $lte: parseFloat(maxAmount) };
            }*/
            if (minAmount) {
                match.amount = { ...match.amount, $gte: parseFloat(minAmount) };
            }
            if (maxAmount) {
                match.amount = { ...match.amount, $lte: parseFloat(maxAmount) };
            }

            let groupBy = {};
            let sortOrder = {}; // 用于排序统计结果
            let project = { // 用于格式化输出 _id
                totalAmount: 1
            };

            /*if (categoryType && (categoryType === 'category' || categoryType === 'subcategory')) {
                groupBy = { _id: `$${categoryType}` };
            } else if (period === 'year') {
                groupBy = { _id: { $year: '$date' } };
            } else if (period === 'month') {
                groupBy = { _id: { $year: '$date', $month: '$date' } };
            } else {
                groupBy = { _id: null }; //所有
            }*/
            if (period === 'category') { // 按大类统计
                groupBy = { _id: '$category' };
                sortOrder = { _id: 1 };
                project._id = '$_id';
            } else if (period === 'subcategory') { // 按小类统计
                groupBy = { _id: '$subcategory' };
                sortOrder = { _id: 1 };
                project._id = '$_id';
            } else if (period === 'year') { // 按年统计
                groupBy = { _id: { $year: '$date' } };
                sortOrder = { _id: 1 };
                project._id = { $toString: '$_id' }; // 将年份转换为字符串
            } else if (period === 'month') { // 按月统计
                groupBy = { _id: { $dateToString: { format: "%Y-%m", date: "$date" } } }; // 格式化为 "YYYY-MM"
                sortOrder = { _id: 1 };
                project._id = '$_id';
            } else { // 默认总计
                groupBy = { _id: null };
                project._id = { $literal: '总计' }; // 将 _id 设置为 '总计' 字符串
                sortOrder = { totalAmount: -1 }; // For '总计', sort by totalAmount descending
            }       

           /* const pipeline = [
                { $match: match },
                { $group: { _id: groupBy._id, totalAmount: { $sum: '$amount' } } }
            ];*/
            const pipeline = [
                { $match: match },
                { $group: { _id: groupBy._id, totalAmount: { $sum: '$amount' } } },
                { $project: project }, // 应用 project 阶段
                { $sort: sortOrder } // 添加排序
            ];

            const statistics = await Expense.aggregate(pipeline);
           // 获取所有不重复的类别和子类别，用于统计页面的下拉列表
            const distinctCategories = await Expense.distinct('category', { userId: userId });
            const distinctSubcategories = await Expense.distinct('subcategory', { userId: userId });
            //res.render('expenses/statistics', { statistics: statistics, startDate, endDate, categoryType, minAmount, maxAmount, period });
              res.render('expenses/statistics', {
                statistics: statistics,
                query: req.query, // 传递完整的查询对象，方便前端填充
                distinctCategories: distinctCategories.sort(),
                distinctSubcategories: distinctSubcategories.sort(),
                path: path,
                //__dirname: __dirname,
                basedir: path.join(__basedir, 'views')                
            });      
        } catch (err) {
            console.error(err);
            res.status(500).send('Server Error');
        }
    });
    // 添加支出记录页面
    app.get('/expenses/add', requireLogin,(req, res) => {
      res.render('expenses/add_transaction');
    });
    // 添加支出记录
    app.post('/expenses/add',  requireLogin,async (req, res) => {
      try {
        const { description, amount, category, subcategory, date } = req.body;// 获取 获取 category 和 subcategory date
        const newExpense = new Expense({
          description: description,
          amount: amount,
          category: category,
          subcategory: subcategory,     
          date: date,
          userId: req.session.userId // 添加 userId     
        });
        await newExpense.save(); // 将新的交易记录保存到数据库中
        res.redirect('/expenses'); // 重定向到首页
      } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
      }
    });
    // 删除交易记录
    app.post('/expenses/delete/:id', requireLogin,async (req, res) => {
        try {
            const id = req.params.id;
            await Expense.findByIdAndDelete(id);
            res.redirect('/expenses');
        } catch (err) {
            console.error(err);
            res.status(500).send('Server Error');
        }
    });
    // 获取要编辑的支出记录
    app.get('/expenses/edit/:id', requireLogin,async (req, res) => {
        try {
            const id = req.params.id;
            const expense = await Expense.findById(id);
            // 将日期转换为 ISO 字符串格式
            //transaction.dateISO = transaction.date.toISOString().slice(0, 10); // 截取到日期部分
            res.render('expenses/edit_transaction', { expense: expense });        
        } catch (err) {
            console.error(err);
            res.status(500).send('Server Error');
        }
    });
    // 更新支出记录
    app.post('/expenses/edit/:id', requireLogin,async (req, res) => {
        try {
            const id = req.params.id;
            const { description, amount, category,subcategory,date } = req.body;
            await Expense.findByIdAndUpdate(id, {
                description: description,
                amount: amount,
                category: category,
                subcategory: subcategory,
                date: date // 更新 date
            });
            res.redirect('/expenses');
        } catch (err) {
            console.error(err);
            res.status(500).send('Server Error');
        }
    });
}