require("dotenv").config();
const express = require('express');
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const { Parser } = require('json2csv');
const querystring = require('querystring');
const path = require('path');

const app = express();
const port = 3000;

// 设置 EJS 模板引擎
app.set('view engine', 'ejs');
app.use(express.static('public')); // Serve static files (CSS, images, etc.)

// 使用 body-parser 中间件
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(function(req, res, next) {
  res.locals.basedir = path.join(__dirname, 'views'); // 设置 views 目录为基础目录
  next();
});
// 连接到 MongoDB 数据库
/*mongoose.connect('mongodb://127.0.0.1:27017/accountingDB', {  // 注意：使用 127.0.0.1 代替 localhost
  useNewUrlParser: true,
  useUnifiedTopology: true,
})*/
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// 定义 Transaction Schema
/*const transactionSchema = new mongoose.Schema({
  description: { type: String, required: true },
  amount: { type: Number, required: true },
  category: { type: String, required: true },
  subcategory: { type: String, required: true },
  date: { type: Date,required: true, default: Date.now },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true } // 添加 userId 字段
});

// 创建 Transaction Model
const Transaction = mongoose.model('Transaction', transactionSchema);*/
// 定义 User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isAdmin: { type: Boolean, default: false }, // 添加 isAdmin 字段
  registrationDate: { type: Date, default: Date.now }
});
// 创建 User Model
const User = mongoose.model('User', userSchema);
// 定义 Expense Schema
const expenseSchema = new mongoose.Schema({
    description: { type: String, required: true },
    amount: { type: Number, required: true },
    category: { type: String, required: true },
    subcategory: { type: String, required: true },
    date: { type: Date, required: true, default: Date.now },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
});

// 创建 Expense Model
const Expense = mongoose.model('Expense', expenseSchema);
// 定义 Income Schema
const incomeSchema = new mongoose.Schema({
    description: { type: String, required: true },
    amount: { type: Number, required: true },
    category: { type: String, required: true },
    subcategory: { type: String, required: true },
    date: { type: Date, required: true, default: Date.now },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
});

// 创建 Income Model
const Income = mongoose.model('Income', incomeSchema);

// 配置 session 中间件
app.use(session({
  secret: 'lcf123456', // 替换为你自己的密钥
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 days
}));

// 限制每天注册的新用户数量
const MAX_DAILY_REGISTRATIONS = 3;

// 中间件: 检查是否超过每日注册限制
const checkRegistrationLimit = async (req, res, next) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  try {
    const registrationCount = await User.countDocuments({
      registrationDate: { $gte: startOfDay, $lte: endOfDay }
    });

    if (registrationCount >= MAX_DAILY_REGISTRATIONS) {
      return res.status(403).send('Daily registration limit exceeded.');
    }

    next();
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};
// 中间件：检查用户是否已登录
const requireLogin = (req, res, next) => {
    console.log("Checking login status...");
    console.log("Session:", req.session); // 打印 Session 信息    
    if (!req.session.userId) {
        console.log("User not logged in. Redirecting to /login");       
        return res.redirect('/login');
    }
    console.log("User logged in. Proceeding...");
    next();
};
// 中间件: 检查用户是否是管理员
const requireAdmin = (req, res, next) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    User.findById(req.session.userId)
        .then(user => {
            if (!user || !user.isAdmin) {
                return res.status(403).send('Unauthorized');
            }
            next();
        })
        .catch(err => {
            console.error(err);
            res.status(500).send('Server Error');
        });
};

// 注册页面
app.get('/register', checkRegistrationLimit, (req, res) => {
  res.render('login/register');
});
// 注册
app.post('/register', checkRegistrationLimit, async (req, res) => {
  try {
    const { username, password } = req.body;

    // 检查用户名是否已存在
    const existingUser = await User.findOne({ username: username });
    if (existingUser) {
      return res.status(400).send('Username already exists.');
    }

    // 对密码进行哈希处理
    const hashedPassword = await bcrypt.hash(password, 10);

    // 创建新用户
    const newUser = new User({
      username: username,
      password: hashedPassword
    });

    await newUser.save();

    res.redirect('/login');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// 登录页面
app.get('/login', (req, res) => {
  res.render('login/login');
});

// 登录
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // 查找用户
    const user = await User.findOne({ username: username });
    if (!user) {
      return res.status(400).send('Invalid username or password.');
    }
    // 验证密码
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(400).send('Invalid username or password.');
    }
    console.log(username+"登录成功");
    // 将用户 ID 存储在 session 中
    req.session.userId = user._id;
    req.session.isAdmin = user.isAdmin;
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// 登出
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Server Error');
    }
    res.redirect('/login');
  });
});
// 导航页
app.get('/dashboard', requireLogin, (req, res) => {
  res.render('login/dashboard');
});
// 首页 - 导航页
app.get('/', requireLogin, async (req, res) => {
  res.redirect('/dashboard');
});
// 修改密码页面
app.get('/change-password', requireLogin, (req, res) => {
  res.render('login/change-password');
});
// 修改密码
app.post('/change-password', requireLogin, async (req, res) => {
  try {
    const { oldPassword, newPassword, confirmPassword } = req.body;
    const userId = req.session.userId;

    // 查找用户
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send('User not found.');
    }

    // 验证旧密码
    const passwordMatch = await bcrypt.compare(oldPassword, user.password);
    if (!passwordMatch) {
      return res.status(400).send('Invalid old password.');
    }

    // 检查新密码和确认密码是否一致
    if (newPassword !== confirmPassword) {
      return res.status(400).send('New password and confirm password do not match.');
    }

    // 对新密码进行哈希处理
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 更新密码
    user.password = hashedPassword;
    await user.save();

    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});
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
        res.render('incomes/index', { incomes: incomes, queryString: queryString, path: path , __dirname: __dirname , basedir: path.join(__dirname, 'views')});// 传递 path  __dirname, basedir: path.join(__dirname, 'views')
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
        const expenses = await Expense.find(query).sort({ date: 'desc' });
        res.render('expenses/index', {
            expenses: expenses,
            queryString: queryString,
            path: path,
            __dirname: __dirname,
            basedir: path.join(__dirname, 'views')
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

        let query = { userId: new mongoose.Types.ObjectId(userId) };

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
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
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
// 支出统计路由
app.get('/expenses/statistics', requireLogin, async (req, res) => {
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

        const statistics = await Expense.aggregate(pipeline);

        res.render('expenses/statistics', { statistics: statistics, startDate, endDate, categoryType, minAmount, maxAmount, period });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});
// 添加支出记录页面
app.get('/expenses/add', requireLogin,(req, res) => {
  res.render('expenses/add_transaction');
});
// 添加收入记录页面
app.get('/incomes/add', requireLogin, (req, res) => {
    res.render('incomes/add');
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
// 添加收入记录
app.post('/incomes/add', requireLogin, async (req, res) => {
    try {
        const { description, amount, category, subcategory, date } = req.body;
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
// 更新收入记录
app.post('/incomes/edit/:id', requireLogin, async (req, res) => {
    try {
        const id = req.params.id;
        const { description, amount, category, subcategory, date } = req.body;
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

// 用户管理页面 (管理员权限)
app.get('/admin/users', requireAdmin, async (req, res) => {
  try {
    const users = await User.find();
    res.render('admin/users', { users: users });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});
// 编辑用户 (管理员权限)
app.get('/admin/users/edit/:id', requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    res.render('admin/edit_user', { user: user });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});
// 更新用户 (管理员权限)
app.post('/admin/users/edit/:id', requireAdmin, async (req, res) => {
  try {
    const { username, isAdmin } = req.body;
    const userId = req.params.id;

    // Get the existing user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send('User not found');
    }

    // Only update the username if it's different, and check for uniqueness
    if (username !== user.username) {
      const existingUser = await User.findOne({ username: username });
      if (existingUser) {
        return res.status(400).send('Username already exists');
      }
      user.username = username;
    }

    //Update isAdmin Status
    user.isAdmin = isAdmin === 'true';

    await user.save();
    res.redirect('/admin/users');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});
// 删除用户 (管理员权限)
app.post('/admin/users/delete/:id', requireAdmin, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.redirect('/admin/users');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});
// 创建管理员账户 (只运行一次)
const createAdminUser = async () => {
  try {
    const adminUsername = "admin";
    const adminPassword = "lcf123456"; // 替换为你想要的管理员密码

    // 检查管理员账户是否已存在
    const existingAdmin = await User.findOne({ username: adminUsername });
    if (existingAdmin) {
      console.log("管理员账户已存在");
      return;
    }

    // 对密码进行哈希处理
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    // 创建管理员账户
    const newAdmin = new User({
      username: adminUsername,
      password: hashedPassword,
      isAdmin: true
    });

    await newAdmin.save();
    console.log("管理员账户创建成功");
  } catch (err) {
    console.error("创建管理员账户失败:", err);
  }
};
// 在应用启动时创建管理员账户(只运行一次)
//createAdminUser();


// 启动服务器
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});