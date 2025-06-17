const path = require('path');
const querystring = require('querystring');
const mongoose = require('mongoose'); // 引入 Mongoose 模块
module.exports = (app, Expense, requireLogin,mongoose, path, querystring, Parser,formatDate) => {
    // 支出列表页面
    app.get('/expenses', requireLogin, async (req, res) => {
        try {
            const { startDate, endDate, category, subcategory } = req.query;
            // --- 分页参数 ---
            const page = parseInt(req.query.page) || 1; // 当前页码，默认为第一页
            const limit = parseInt(req.query.limit) || 10; // 每页数量，默认为10条
            const skip = (page - 1) * limit; // 计算跳过的文档数量
            // ------------------

            const userId = req.session.userId;

            let query = { userId: new mongoose.Types.ObjectId(String(userId)) };

            if (startDate && endDate) {
                // 为了包含 endDate 当天的数据，将 endDate 设置为当天的最后一毫秒
                const endOfDay = new Date(endDate);
                endOfDay.setHours(23, 59, 59, 999);
                query.date = { $gte: new Date(startDate), $lte: endOfDay };
            } else if (startDate) {
                query.date = { $gte: new Date(startDate) };
            } else if (endDate) {
                const endOfDay = new Date(endDate);
                endOfDay.setHours(23, 59, 59, 999);
                query.date = { $lte: endOfDay };
            }

            if (category) {
                query.category = category;
            }

            if (subcategory) {
                query.subcategory = subcategory;
            }
            const allCategories = ['衣', '食', '住', '行', '医', '娱', '人情', '其他'];
            // 获取总支出数量 (用于计算总页数)
            const totalExpenses = await Expense.countDocuments(query);
            const totalPages = Math.ceil(totalExpenses / limit); // 计算总页数

            // 获取分页后的支出数据
            const expenses = await Expense.find(query)
                                        .sort({ date: 'desc' }) // 按日期倒序
                                        .skip(skip)             // 跳过
                                        .limit(limit);          // 限制数量

            // 重新生成查询字符串，确保不包含 page 和 limit，因为它们会通过分页链接单独处理
            const currentQuery = { ...req.query };
            delete currentQuery.page;
            delete currentQuery.limit;
            const queryString = querystring.encode(currentQuery);      
            // 获取所有不重复的类别和子类别，用于筛选下拉菜单
            const distinctDbCategories = await Expense.distinct('category', { userId: userId });
            const distinctCategories = Array.from(new Set([...allCategories, ...distinctDbCategories]));            
            let distinctSubcategories = [];
            if (category) {
                distinctSubcategories = await Expense.distinct('subcategory', { userId, category: category });
            } else {
                distinctSubcategories = await Expense.distinct('subcategory', { userId });
            }            
            res.render('expenses/index', {              
                activeMenu: 'expenses',
                layout: 'expenses/layout.ejs',
                title: '支出列表',
                pageTitle: '支出列表',
                expenses: expenses,
                queryString: queryString, // 传递筛选条件字符串 (不含page/limit)
                distinctCategories: distinctCategories.sort(),
                distinctSubcategories: distinctSubcategories.sort(),
                currentPage: page,      // 当前页码
                totalPages: totalPages, // 总页数
                limit: limit,           // 当前每页数量
                startDate: startDate || '', // 传递回表单，保持筛选状态
                endDate: endDate || '',     // 传递回表单，保持筛选状态
                query: req.query,           // 传递完整查询对象，方便选中下拉框
                path: path,
                basedir: path.join(__basedir, 'views'),
                success_msg: req.flash('success_msg'), // 如果有闪存消息
                error_msg: req.flash('error_msg')     // 如果有闪存消息
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
    app.get('/expenses/statistics', requireLogin,async (req, res) => {
        try {
            const { startDate, endDate, category, subcategory, minAmount, maxAmount, period, year } = req.query;

            let matchConditions = {};

            // 日期筛选
            if (startDate && endDate) {
                matchConditions.date = {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                };
            } else if (startDate) {
                matchConditions.date = { $gte: new Date(startDate) };
            } else if (endDate) {
                matchConditions.date = { $lte: new Date(endDate) };
            }

            // 类别筛选
            if (category) {
                matchConditions.category = category;
            }
            if (subcategory) {
                matchConditions.subcategory = subcategory;
            }

            // 金额筛选
            if (minAmount) {
                matchConditions.amount = { ...matchConditions.amount, $gte: parseFloat(minAmount) };
            }
            if (maxAmount) {
                matchConditions.amount = { ...matchConditions.amount, $lte: parseFloat(maxAmount) };
            }

            let groupStage;
            let sortStage = { _id: 1 }; // 默认按_id升序

            if (period === 'category') {
                groupStage = {
                    _id: '$category',
                    totalAmount: { $sum: '$amount' }
                };
            } else if (period === 'subcategory') {
                groupStage = {
                    _id: '$subcategory',
                    totalAmount: { $sum: '$amount' }
                };
            } else if (period === 'categoryAndSubcategory') { // ADD THIS BLOCK
                groupStage = {
                    _id: {
                        category: '$category',
                        subcategory: '$subcategory'
                    },
                    totalAmount: { $sum: '$amount' }
                };
                sortStage = { '_id.category': 1, '_id.subcategory': 1 }; // Sort by major then minor category
            } else if (period === 'year') {
                groupStage = {
                    _id: { $year: '$date' },
                    totalAmount: { $sum: '$amount' }
                };
            } else if (period === 'month') {
                // 如果按月统计，并且指定了年份，则在匹配条件中加入年份
                if (year) {
                    // 将年份添加到日期筛选，或者单独筛选年份
                    // 假设日期字段是Date类型
                    matchConditions.date = {
                        ...matchConditions.date, // 保留原有的日期范围（如果有的话）
                        $gte: new Date(parseInt(year), 0, 1), // 某年的1月1日
                        $lt: new Date(parseInt(year) + 1, 0, 1) // 下一年的1月1日
                    };
                }
                groupStage = {
                    _id: { $month: '$date' }, // 按月份聚合
                    totalAmount: { $sum: '$amount' }
                };
                sortStage = { _id: 1 }; // 月份按数字升序
            } else {
                // 默认总计
                groupStage = {
                    _id: null,
                    totalAmount: { $sum: '$amount' }
                };
            }

            let aggregationPipeline = [];

            if (Object.keys(matchConditions).length > 0) {
                aggregationPipeline.push({ $match: matchConditions });
            }

            aggregationPipeline.push({ $group: groupStage });
            aggregationPipeline.push({ $sort: sortStage });

            const statistics = await Expense.aggregate(aggregationPipeline);

            // 获取所有不重复的年份用于年度选择框
            const distinctYearsResult = await Expense.aggregate([
                { $group: { _id: { $year: '$date' } } },
                { $sort: { _id: 1 } }
            ]);
            const distinctYears = distinctYearsResult.map(item => item._id);

            // 获取所有不重复的大类和小类（用于筛选条件）
            const distinctCategories = await Expense.distinct('category');
            const distinctSubcategories = await Expense.distinct('subcategory');

            res.render('expenses/statistics', {
                activeMenu: 'expenses',
                layout: 'expenses/layout.ejs', 
                title: '支出统计',
                pageTitle: '支出统计' ,                 
                statistics: period === '' ? [{ _id: '总计', totalAmount: statistics[0] ? statistics[0].totalAmount : 0 }] : statistics,
                query: req.query,
                distinctCategories,
                distinctSubcategories,
                distinctYears // 将年份传递给前端
            });

        } catch (err) {
            console.error(err);
            res.status(500).send('服务器错误');
        }
    });     
    // 添加支出记录页面
    app.get('/expenses/add', requireLogin,async (req, res) => {
        try {
            // Retrieve flash messages (if any from previous redirects/re-renders)
            const successMessage = req.flash('success_msg');
            const errorMessage = req.flash('error_msg');
            const validationErrors = req.flash('validation_errors'); // This would be an array   
            // Fetch distinct categories and subcategories for dropdowns
            // In a real app, you might fetch these from dedicated Category/Subcategory models
            const distinctCategories = await Expense.distinct('category');
            const distinctSubcategories = await Expense.distinct('subcategory');             
            res.render('expenses/add_transaction', {
                activeMenu: 'expenses',
                layout: 'expenses/layout.ejs', 
                title: '添加支出记录',
                pageTitle: '添加支出记录',
                messages: {
                    success: successMessage.length > 0 ? successMessage[0] : null,
                    error: errorMessage.length > 0 ? errorMessage[0] : null,
                    validationErrors: validationErrors // Pass as array
                },
                formData: {}      
            });
        } catch (err) {
            console.error('Error fetching data for add transaction form:', err);
            req.flash('error_msg', '无法加载添加支出页面。');
            res.redirect('/expenses'); // Redirect to a safe page on error
        }           
    });
    // 添加支出记录
    app.post('/expenses/add',  requireLogin,async (req, res) => {
      try {
        const { description, amount, category, subcategory, date } = req.body;// 获取 获取 category 和 subcategory date
    // 2. Basic Server-side Validation (more comprehensive validation might be in a dedicated validator)
        let errors = [];

        if (!date) {
            errors.push('日期是必填项。');
        }
        if (!category || category.trim() === '') {
            errors.push('大类是必填项。');
        }
        if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
            errors.push('金额必须是有效的正数。');
        }
        // Add more validation rules as needed, e.g., for subcategory, description length, etc.

        // 3. Handle Validation Errors
        if (errors.length > 0) {
            req.flash('error_msg', '请修正以下错误：'); // General error message
            req.flash('validation_errors', errors); // Pass specific errors as an array

            // Re-fetch dropdown data if you're re-rendering the form
            const distinctCategories = await Expense.distinct('category');
            const distinctSubcategories = await Expense.distinct('subcategory');

            // Re-render the form with errors and previously submitted data
            return res.render('expenses/add_transaction', {
                title: '添加新支出',
                distinctCategories: distinctCategories,
                distinctSubcategories: distinctSubcategories,
                messages: {
                    success: null, // No success message on re-render due to error
                    error: req.flash('error_msg')[0] || null, // Retrieve immediate error flash
                    validationErrors: req.flash('validation_errors') // Retrieve immediate validation errors flash
                },
                formData: req.body // Pass back the submitted data to pre-fill the form fields
            });
        }

        const newExpense = new Expense({
          description: description,
          amount: amount,
          category: category,
          subcategory: subcategory,     
          date: date,
          userId: req.session.userId // 添加 userId     
        });
        await newExpense.save(); // 将新的交易记录保存到数据库中
        //req.flash('success_msg', '支出已成功添加！');
        // 6. Success: Set flash message and redirect
        req.flash('success_msg', '支出记录已成功添加！');      
        res.redirect('/expenses'); // 重定向到首页
      } catch (err) {
        console.error(err);
        //res.status(500).send('Server Error');
        // This block handles errors not caught by initial validation (e.g., Mongoose validation errors)
        let specificErrors = [];
        if (err.name === 'ValidationError') {
            specificErrors = Object.values(err.errors).map(el => el.message);
            req.flash('error_msg', '添加支出失败：' + specificErrors.join('; '));
            req.flash('validation_errors', specificErrors);
        } else {
            req.flash('error_msg', '添加支出时发生未知错误。请稍后再试。');
        }

        // Re-render the form in case of database errors as well,
        // preserving user input and showing errors.
        const distinctCategories = await Expense.distinct('category');
        const distinctSubcategories = await Expense.distinct('subcategory');

        return res.render('expenses/add_transaction', {
            activeMenu: 'expenses',
            layout: 'expenses/layout.ejs', 
            title: '添加支出记录',
            pageTitle: '添加支出记录',            
            distinctCategories: distinctCategories,
            distinctSubcategories: distinctSubcategories,
            messages: {
                success: null,
                error: req.flash('error_msg')[0] || null,
                validationErrors: req.flash('validation_errors')
            },
            formData: req.body // Pass data back to pre-fill form
        });        
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
            // Check if expense exists and belongs to the current user
            if (!expense) {
                req.flash('error_msg', '未找到该支出记录。');
                return res.redirect('/expenses');
            }         
            // 将日期转换为 ISO 字符串格式
            //transaction.dateISO = transaction.date.toISOString().slice(0, 10); // 截取到日期部分
            // Retrieve flash messages (if any from previous redirects/re-renders)
            const successMessage = req.flash('success_msg');
            const errorMessage = req.flash('error_msg');
            const validationErrors = req.flash('validation_errors'); // This would be an array

            // Fetch distinct categories and subcategories for dropdowns, just like in add_transaction
            const distinctCategories = await Expense.distinct('category');
            const distinctSubcategories = await Expense.distinct('subcategory');            
            res.render('expenses/edit_transaction', { 
                expense: expense,
                activeMenu: 'expenses',
                layout: 'expenses/layout.ejs', 
                title: '编辑支出记录',
                pageTitle: '编辑支出记录',
                distinctCategories: distinctCategories,
                distinctSubcategories: distinctSubcategories,
                // Pass the messages object to the EJS template
                messages: {
                    success: successMessage.length > 0 ? successMessage[0] : null,
                    error: errorMessage.length > 0 ? errorMessage[0] : null,
                    validationErrors: validationErrors // Pass as array
                },
                formData: expense // Pre-fill form with existing expense data                                  
                });        
        } catch (err) {
            console.error(err);
            req.flash('error_msg', '无法加载编辑页面。');
            res.redirect('/expenses');            
            //res.status(500).send('Server Error');
        }
    });
    // 更新支出记录
    app.post('/expenses/edit/:id', requireLogin,async (req, res) => {
        
            const id = req.params.id;
            const { description, amount, category,subcategory,date } = req.body;
            let errors = [];
            // Basic Server-side Validation
            if (!date) {
                errors.push('日期是必填项。');
            }
            if (!category || category.trim() === '') {
                errors.push('大类是必填项。');
            }
            if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
                errors.push('金额必须是有效的正数。');
            }
            // Add more validation rules as needed

            if (errors.length > 0) {
                req.flash('error_msg', '请修正以下错误：');
                req.flash('validation_errors', errors);
            
                let expense;
            try {    
                expense = await Expense.findById(id);
                if (!expense) {
                    req.flash('error_msg', '未找到该支出记录，无法进行编辑。');
                    return res.redirect('/expenses');
                } 
                // Re-fetch dropdown data if you're re-rendering the form
                const distinctCategories = await Expense.distinct('category');
                const distinctSubcategories = await Expense.distinct('subcategory');   
                // Re-render the form with errors and previously submitted data
                return res.render('expenses/edit_transaction', {
                    activeMenu: 'expenses',
                    layout: 'expenses/layout.ejs', 
                    title: '编辑支出记录',
                    pageTitle: '编辑支出记录',
                    expense: expense, // Pass the re-fetched expense object
                    distinctCategories: distinctCategories,
                    distinctSubcategories: distinctSubcategories,
                    messages: {
                        success: null, // No success message on re-render due to error
                        error: req.flash('error_msg')[0] || null, // Retrieve immediate error flash
                        validationErrors: req.flash('validation_errors') // Retrieve immediate validation errors flash
                    },
                    formData: req.body // Pass back the submitted data to pre-fill the form fields
                });     
                } catch (err) {
                    // Handle error if fetching expense or categories/subcategories fails during re-render
                    console.error('Error re-rendering edit form with validation errors:', fetchErr);
                    req.flash('error_msg', '处理编辑请求时发生错误，无法加载表单。');
                    return res.redirect('/expenses');
                } 
            }

            try {
                    await Expense.findByIdAndUpdate(id, {
                        description: description,
                        amount: amount,
                        category: category,
                        subcategory: subcategory,
                        date: date // 更新 date
                    });
                    req.flash('success_msg', '支出记录已成功更新！');
                    res.redirect('/expenses');

            } catch (err) {
                console.error('Error updating expense:', err);
                //res.status(500).send('Server Error');
                let specificErrors = [];
                if (err.name === 'ValidationError') {
                    specificErrors = Object.values(err.errors).map(el => el.message);
                    req.flash('error_msg', '更新支出失败：' + specificErrors.join('; '));
                    req.flash('validation_errors', specificErrors);
                } else {
                    req.flash('error_msg', '更新支出时发生未知错误。请稍后再试。');
                }

                // Re-render the form in case of database errors as well,
                // preserving user input and showing errors.
                try {
                    const distinctCategories = await Expense.distinct('category');
                    const distinctSubcategories = await Expense.distinct('subcategory');
                    // Re-fetch the original expense in case of database error to pass to template
                    const expense = await Expense.findById(id); // Re-fetch here as well!

                    return res.render('expenses/edit_transaction', {
                        activeMenu: 'expenses',
                        layout: 'expenses/layout.ejs', 
                        title: '编辑支出记录',
                        pageTitle: '编辑支出记录',
                        expense: expense, // Pass the original expense or partially updated one
                        distinctCategories: distinctCategories,
                        distinctSubcategories: distinctSubcategories,
                        messages: {
                            success: null,
                            error: req.flash('error_msg')[0] || null,
                            validationErrors: req.flash('validation_errors')
                        },
                        formData: req.body // Pass submitted data back
                    });
                } catch (fetchErr) {
                    console.error('Error re-rendering edit form after update failure:', fetchErr);
                    req.flash('error_msg', '处理编辑请求时发生错误。');
                    return res.redirect('/expenses');
                }                
            }
    });
}