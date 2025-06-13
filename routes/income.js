const path = require('path');
const querystring = require('querystring');
const mongoose = require('mongoose'); // 引入 Mongoose 模块
module.exports = (app, Income, requireLogin,mongoose, path, querystring, Parser,formatDate) => { 
    // 收入列表页面
    app.get('/incomes', requireLogin, async (req, res) => {
        try {
            const { startDate, endDate, category, subcategory, page = 1, limit = 10 } = req.query;
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

            const parsedLimit = parseInt(limit);
            const parsedPage = parseInt(page);
            const skip = (parsedPage - 1) * parsedLimit;

            const totalIncomes = await Income.countDocuments(query);
            const totalPages = Math.ceil(totalIncomes / parsedLimit);

            const incomes = await Income.find(query)
                                        .sort({ date: 'desc' })
                                        .skip(skip)
                                        .limit(parsedLimit);

            const currentQueryParams = { ...req.query };
            delete currentQueryParams.page;
            delete currentQueryParams.limit;
            const queryString = querystring.encode(currentQueryParams); //生成查询字符串

            //const queryString = querystring.encode(req.query); //生成查询字符串
            //const incomes = await Income.find(query).sort({ date: 'desc' });
            res.render('incomes/index', { 
                activeMenu: 'incomes',
                layout: 'incomes/layout.ejs', 
                title: '收入列表',
                pageTitle: '收入列表' ,               
                incomes: incomes, 
                queryString: queryString, 
                startDate: startDate || '',
                endDate: endDate || '',
                category: category || '',
                subcategory: subcategory || '',
                currentPage: parsedPage,
                totalPages: totalPages,                
                path: path ,
                __dirname: __dirname ,
                basedir:path.join(__basedir, 'views')
            });// 传递 path  __dirname, basedir: path.join(__dirname, 'views')
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

                let match = { userId: new mongoose.Types.ObjectId(String(userId)) };

                if (startDate && endDate) {
                    const start = new Date(startDate);
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999); // 确保包含结束日期的全天

                    match.date = {
                        $gte: start,
                        $lte: end
                    };
                }

                if (minAmount) {
                    match.amount = { ...match.amount, $gte: parseFloat(minAmount) };
                }
                if (maxAmount) {
                    match.amount = { ...match.amount, $lte: parseFloat(maxAmount) };
                }

                let groupBy = { _id: null }; // 默认总计

                // 动态构建 groupBy 字段
                if (categoryType === 'category') {
                    if (period === 'year') {
                        groupBy._id = { category: '$category', year: { $year: '$date' } };
                    } else if (period === 'month') {
                        groupBy._id = { category: '$category', year: { $year: '$date' }, month: { $month: '$date' } };
                    } else {
                        groupBy._id = '$category';
                    }
                } else if (categoryType === 'subcategory') {
                    if (period === 'year') {
                        groupBy._id = { subcategory: '$subcategory', year: { $year: '$date' } };
                    } else if (period === 'month') {
                        groupBy._id = { subcategory: '$subcategory', year: { $year: '$date' }, month: { $month: '$date' } };
                    } else {
                        groupBy._id = '$subcategory';
                    }
                } else if (categoryType === 'categoryAndSubcategory') {
                    // 新增：按大类和小类统计
                    if (period === 'year') {
                        groupBy._id = { category: '$category', subcategory: '$subcategory', year: { $year: '$date' } };
                    } else if (period === 'month') {
                        groupBy._id = { category: '$category', subcategory: '$subcategory', year: { $year: '$date' }, month: { $month: '$date' } };
                    } else {
                        groupBy._id = { category: '$category', subcategory: '$subcategory' };
                    }
                } else if (period === 'year') {
                    groupBy._id = { $year: '$date' };
                } else if (period === 'month') {
                    groupBy._id = { year: { $year: '$date' }, month: { $month: '$date' } };
                }
                // 如果 categoryType 和 period 都为空，则 groupBy._id 保持为 null (总计)

                const pipeline = [
                    { $match: match },
                    { $group: { _id: groupBy._id, totalAmount: { $sum: '$amount' } } },
                    { $sort: {
                        // 优先按类别排序，然后按小类，再按年份和月份
                        '_id.category': 1,
                        '_id.subcategory': 1,
                        '_id.year': 1,
                        '_id.month': 1,
                        '_id': 1 // 对于简单 _id (如只按类别或只按年)，按 _id 本身排序
                    }}
                ];

                const statistics = await Income.aggregate(pipeline);

                res.render('incomes/statistics', {
                    activeMenu: 'incomes',
                    layout: 'incomes/layout.ejs', // 明确指定布局
                    title: '收入统计',
                    pageTitle: '收入统计',                    
                    statistics: statistics,
                    startDate: startDate || '',
                    endDate: endDate || '',
                    categoryType: categoryType || '',
                    minAmount: minAmount || '',
                    maxAmount: maxAmount || '',
                    period: period || '',
                    activeMenu: 'incomesStatistics'
                });
            } catch (err) {
                console.error(err);
                res.status(500).send('Server Error');
            }
        });


    /*app.get('/incomes/statistics', requireLogin, async (req, res) => {
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
    });*/
    /*app.get('/incomes/statistics', requireLogin, async (req, res) => {
        try {
            const { startDate, endDate, categoryType, minAmount, maxAmount, period } = req.query;
            const userId = req.session.userId;

            let match = { userId: new mongoose.Types.ObjectId(String(userId)) };

            if (startDate && endDate) {
                // 确保日期字符串能够被正确解析为日期对象
                const start = new Date(startDate);
                // 结束日期设置为当天的最后一刻，确保包含整天
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999); 

                match.date = {
                    $gte: start,
                    $lte: end
                };
            }

            if (minAmount) {
                match.amount = { ...match.amount, $gte: parseFloat(minAmount) }; // 使用 ... 运算符合并，以防 amount 已有属性
            }
            if (maxAmount) {
                match.amount = { ...match.amount, $lte: parseFloat(maxAmount) }; // 使用 ... 运算符合并，以防 amount 已有属性
            }

            let groupBy = {};
            if (categoryType && (categoryType === 'category' || categoryType === 'subcategory')) {
                groupBy = { _id: `$${categoryType}` };
            } else if (period === 'year') {
                groupBy = { _id: { $year: '$date' } };
            } else if (period === 'month') {
                // **核心修改在这里**
                // 确保 $group 的 _id 字段的结构是正确的 MongoDB 表达式
                groupBy = { _id: { year: { $year: '$date' }, month: { $month: '$date' } } };
            } else {
                groupBy = { _id: null }; // 总计
            }

            const pipeline = [
                { $match: match },
                { $group: { _id: groupBy._id, totalAmount: { $sum: '$amount' } } },
                { $sort: {
                    // 对按月统计的复合 _id 进行排序
                    '_id.year': 1,
                    '_id.month': 1,
                    // 对于其他情况，按 _id 本身排序 (例如类别名称)
                    '_id': 1
                }}
            ];

            const statistics = await Income.aggregate(pipeline);

            res.render('incomes/statistics', {
                statistics: statistics,
                startDate: startDate || '',
                endDate: endDate || '',
                categoryType: categoryType || '',
                minAmount: minAmount || '',
                maxAmount: maxAmount || '',
                period: period || '',
                activeMenu: 'incomesStatistics'
            });
        } catch (err) {
            console.error(err);
            res.status(500).send('Server Error');
        }
    }); */
    /*app.get('/incomes/statistics', requireLogin, async (req, res) => {
        try {
            const { startDate, endDate, categoryType, minAmount, maxAmount, period } = req.query;
            const userId = req.session.userId;

            let match = { userId: new mongoose.Types.ObjectId(String(userId)) };

            if (startDate && endDate) {
                const start = new Date(startDate);
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999); // 确保包含结束日期的全天

                match.date = {
                    $gte: start,
                    $lte: end
                };
            }

            if (minAmount) {
                match.amount = { ...match.amount, $gte: parseFloat(minAmount) };
            }
            if (maxAmount) {
                match.amount = { ...match.amount, $lte: parseFloat(maxAmount) };
            }

            let groupBy = { _id: null }; // 默认总计

            // 动态构建 groupBy 字段
            // 优先处理类别统计，因为它似乎是您截图中的“类别”选择器
            if (categoryType && (categoryType === 'category' || categoryType === 'subcategory')) {
                // 如果选择了类别，那么 _id 必须包含类别信息
                if (period === 'year') {
                    // 按类别和按年统计
                    groupBy._id = {
                        category: `$${categoryType}`, // 动态选择 category 或 subcategory
                        year: { $year: '$date' }
                    };
                } else if (period === 'month') {
                    // 按类别和按月统计
                    groupBy._id = {
                        category: `$${categoryType}`,
                        year: { $year: '$date' },
                        month: { $month: '$date' }
                    };
                } else {
                    // 只按类别统计 (period 为空或'total')
                    groupBy._id = `$${categoryType}`;
                }
            } else if (period === 'year') {
                // 只按年统计 (未选择类别)
                groupBy._id = { $year: '$date' };
            } else if (period === 'month') {
                // 只按月统计 (未选择类别)
                groupBy._id = { year: { $year: '$date' }, month: { $month: '$date' } };
            }
            // 如果 categoryType 和 period 都为空，则 groupBy._id 保持为 null (总计)

            const pipeline = [
                { $match: match },
                { $group: { _id: groupBy._id, totalAmount: { $sum: '$amount' } } },
                { $sort: {
                    // 根据 _id 的结构进行复杂排序
                    '_id.category': 1, // 优先按类别排序
                    '_id.year': 1,     // 然后按年份排序
                    '_id.month': 1,    // 最后按月份排序
                    '_id': 1           // 对于简单 _id (如只按类别或只按年)，按 _id 本身排序
                }}
            ];

            const statistics = await Income.aggregate(pipeline);

            res.render('incomes/statistics', {
                statistics: statistics,
                startDate: startDate || '',
                endDate: endDate || '',
                categoryType: categoryType || '',
                minAmount: minAmount || '',
                maxAmount: maxAmount || '',
                period: period || '',
                activeMenu: 'incomesStatistics'
            });
        } catch (err) {
            console.error(err);
            res.status(500).send('Server Error');
        }
    }); */  
    // 添加收入记录页面
    app.get('/incomes/add', requireLogin, (req, res) => {
        res.render('incomes/add',{
            activeMenu: 'incomes',
            layout: 'incomes/layout.ejs', 
            title: '新增收入',
            pageTitle: '新增收入'          
        });
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
            req.flash('success', '收入记录添加成功！'); // 添加成功消息
            req.flash('error', '添加收入记录失败，请重试。' + (err.message || '')); // 添加错误消息，包含具体错误信息            
            //res.redirect('/incomes');
            // 重新渲染添加页面，并保留用户输入的数据
            res.render('incomes/add', {
                activeMenu: 'incomes',
                layout: 'incomes/layout.ejs', // 明确指定布局
                title: '新增收入',
                pageTitle: '新增收入',
                oldData: req.body // 将用户提交的数据传回，以便在表单中预填充
            });            
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
            //const userId = req.user._id;
            const income = await Income.findById(id);
            //const income = await Income.findOne({ _id: id, userId: userId });
            if (!income) {
                req.flash('error', '未找到该收入记录或您无权访问。');
                return res.redirect('/incomes');
            }            
            res.render('incomes/edit', { 
                activeMenu: 'incomes',
                layout: 'incomes/layout.ejs', 
                title: '编辑收入',
                pageTitle: '编辑收入' ,               
                income: income 
            });
        } catch (err) {
            //console.error(err);
            console.error("Error fetching income for edit:", err);
            req.flash('error', '获取收入记录失败，请重试。');   
            res.redirect('/incomes'); // 获取失败重定向回列表         
           // res.status(500).send('Server Error');
        }
    });
    // 更新收入记录
    app.post('/incomes/edit/:id', requireLogin, async (req, res) => {
        try {
            const id = req.params.id;
            //const userId = req.user._id;
            const { description, amount, category, subcategory, date } = req.body;
            console.log("Received date:", date);
            //const parsedDate = new Date(date + 'Z'); // Append 'Z' for UTC
            //const parsedDate = new Date(date)
            //console.log("Parsed date:", parsedDate); 

            const updatedIncome=await Income.findByIdAndUpdate(id, {
                description: description,
                amount: amount,
                category: category,
                subcategory: subcategory,
                date: date
            });

            /*const updatedIncome = await Income.findOneAndUpdate(
                { _id: id, userId: userId }, // 确保只有记录的拥有者才能更新
                {
                    description: description,
                    amount: amount,
                    category: category,
                    subcategory: subcategory,
                    date: new Date(date) // 将日期字符串转换为 Date 对象
                },
                { new: true, runValidators: true } // 返回更新后的文档并运行模型验证
            );*/

            if (!updatedIncome) {
                req.flash('error', '未找到要更新的收入记录，或您无权更新此记录。');
                return res.redirect('/incomes');
            }            
            req.flash('success', '收入记录更新成功！');
            res.redirect('/incomes');
        } catch (err) {
            //console.error(err);
            //res.status(500).send('Server Error');
            console.error("Error updating income:", err);
            req.flash('error', '更新收入记录失败，请重试。' + (err.message || '')); // 添加错误消息，包含具体错误信息

            // 重新渲染编辑页面，并带上错误和用户输入数据
            const id = req.params.id;
            // 构造一个临时的 income 对象来填充表单，保留用户最新的输入
            const income = { id: id, ...req.body };
            res.render('incomes/edit', {
                activeMenu: 'incomes',
                layout: 'incomes/layout.ejs', // 明确指定布局
                title: '编辑收入',
                pageTitle: '编辑收入',
                income: income // 传递用户提交的数据
            });            
        }
    });
}