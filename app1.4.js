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

// 数据库连接
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// 定义 Schema
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    isAdmin: { type: Boolean, default: false },
    registrationDate: { type: Date, default: Date.now }
});
const expenseSchema = new mongoose.Schema({
    description: { type: String, required: true },
    amount: { type: Number, required: true },
    category: { type: String, required: true },
    subcategory: { type: String, required: true },
    date: { type: Date, required: true, default: Date.now },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
});
const incomeSchema = new mongoose.Schema({
    description: { type: String, required: true },
    amount: { type: Number, required: true },
    category: { type: String, required: true },
    subcategory: { type: String, required: true },
    date: { type: Date, required: true, default: Date.now },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
});

// 定义 Model
const User = mongoose.model('User', userSchema);
const Expense = mongoose.model('Expense', expenseSchema);
const Income = mongoose.model('Income', incomeSchema);

// 中间件
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(function(req, res, next) {
    res.locals.basedir = path.join(__dirname, 'views');
    next();
});
app.use(session({
    secret: process.env.SESSION_SECRET || 'lcf123456', // Use environment variable
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));
const checkRegistrationLimit = async (req, res, next) => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    try {
        const registrationCount = await User.countDocuments({
            registrationDate: { $gte: startOfDay, $lte: endOfDay }
        });

        if (registrationCount >= 3) { // Using the defined constant
            return res.status(403).send('Daily registration limit exceeded.');
        }

        next();
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};
const requireLogin = (req, res, next) => {
    console.log("Checking login status...");
    console.log("Session:", req.session);
    if (!req.session.userId) {
        console.log("User not logged in. Redirecting to /login");
        return res.redirect('/login');
    }
    console.log("User logged in. Proceeding...");
    next();
};
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

// 注册和登录
app.get('/register', checkRegistrationLimit, (req, res) => {
  res.render('login/register');
});
app.post('/register', checkRegistrationLimit, async (req, res) => {
  try {
    const { username, password } = req.body;
    const existingUser = await User.findOne({ username: username });
    if (existingUser) {
      return res.status(400).send('Username already exists.');
    }
    const hashedPassword = await bcrypt.hash(password, 10);
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

app.get('/login', (req, res) => {
  res.render('login/login');
});
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username: username });
    if (!user) {
      return res.status(400).send('Invalid username or password.');
    }
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(400).send('Invalid username or password.');
    }
    console.log(username+"登录成功");
    req.session.userId = user._id;
    req.session.isAdmin = user.isAdmin;
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Server Error');
    }
    res.redirect('/login');
  });
});

// 导航页和修改密码
app.get('/dashboard', requireLogin, (req, res) => {
  res.render('login/dashboard');
});
app.get('/', requireLogin, async (req, res) => {
  res.redirect('/dashboard');
});
app.get('/change-password', requireLogin, (req, res) => {
  res.render('login/change-password');
});
app.post('/change-password', requireLogin, async (req, res) => {
  try {
    const { oldPassword, newPassword, confirmPassword } = req.body;
    const userId = req.session.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send('User not found.');
    }
    const passwordMatch = await bcrypt.compare(oldPassword, user.password);
    if (!passwordMatch) {
      return res.status(400).send('Invalid old password.');
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).send('New password and confirm password do not match.');
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// 收入和支出管理
const getList = async (Model, req, res) => {
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
    const items = await Model.find(query).sort({ date: 'desc' });
    return {items,queryString};
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

const renderList = async (Model, view, req, res) => {
  try{
      const{items,queryString} = await getList(Model,req,res);
      res.render(view, { items: items, queryString: queryString, path: path, __dirname: __dirname, basedir: path.join(__dirname, 'views')});
  } catch (err) {
      console.error(err);
      res.status(500).send('Server Error');
  }
}

app.get('/incomes', requireLogin, async (req, res) => {
    renderList(Income, 'incomes/index', req, res)
});

app.get('/expenses', requireLogin, async (req, res) => {
    renderList(Expense, 'expenses/index', req, res)
});

// 导出
const exportData = async (Model, req, res) => {
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
    const items = await Model.find(query).sort({ date: 'desc' });

    if (!items || items.length === 0) {
      return res.status(404).send('No data found.');
    }
    const formattedData = items.map(item => ({
      description: item.description,
      amount: item.amount,
      category: item.category,
      subcategory: item.subcategory,
      date: formatDate(item.date)
    }));

    const fields = ['description', 'amount', 'category', 'subcategory', 'date'];
    const opts = { fields };

    try {
      const parser = new Parser(opts);
      const csv = parser.parse(formattedData);

      res.header('Content-Type', 'text/csv');
      res.attachment('data.csv');
      return res.send(csv);
    } catch (err) {
      console.error(err);
      return res.status(500).send('Error generating CSV.');
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

app.get('/incomes/export', requireLogin, async (req, res) => {
  exportData(Income, req, res);
});
app.get('/expenses/export', requireLogin, async (req, res) => {
  exportData(Expense, req, res);
});

// 收入和支出 统计
const renderStatistics = async (Model, view, req, res) => {
  try {
    const { startDate, endDate, categoryType, minAmount, maxAmount, period } = req.query;
    const userId = req.session.userId;

    let match = { userId: new mongoose.Types.ObjectId(String(userId)) };

    if (startDate && endDate) {
      match.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

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

    const statistics = await Model.aggregate(pipeline);

    res.render(view, { statistics: statistics, startDate, endDate, categoryType, minAmount, maxAmount, period });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};
app.get('/incomes/statistics', requireLogin, async (req, res) => {
    renderStatistics(Income, "incomes/statistics", req, res)
});
app.get('/expenses/statistics', requireLogin, async (req, res) => {
    renderStatistics(Expense, "expenses/statistics", req, res)
});
// 增删改查
const renderAdd = (view, req, res) => {
     res.render(view);
}
app.get('/expenses/add', requireLogin,(req, res) => {
    renderAdd('expenses/add_transaction', req, res)
});
app.get('/incomes/add', requireLogin, (req, res) => {
    renderAdd('incomes/add', req, res)
});
const addData = async (Model, req, res,path) => {
   try {
        const { description, amount, category, subcategory, date } = req.body;// 获取 获取 category 和 subcategory date
        const newItem = new Model({
          description: description,
          amount: amount,
          category: category,
          subcategory: subcategory,     
          date: date,
          userId: req.session.userId // 添加 userId     
        });
        await newItem.save(); // 将新的交易记录保存到数据库中
        res.redirect(path); // 重定向到首页
      } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
      }
}
app.post('/expenses/add',  requireLogin,async (req, res) => {
    addData(Expense,req,res,'/expenses')
});
app.post('/incomes/add', requireLogin, async (req, res) => {
   addData(Income,req,res,'/incomes')
});

const deleteData = async (Model,req,res,path) => {
     try {
        const id = req.params.id;
        await Model.findByIdAndDelete(id);
        res.redirect(path);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
}
app.post('/expenses/delete/:id', requireLogin,async (req, res) => {
    deleteData(Expense,req,res,'/expenses')
});
app.post('/incomes/delete/:id', requireLogin, async (req, res) => {
    deleteData(Income,req,res,'/incomes')
});

const renderEdit = async (Model, view, req, res) => {
        try {
        const id = req.params.id;
        const item = await Model.findById(id);
        // 将日期转换为 ISO 字符串格式
        //transaction.dateISO = transaction.date.toISOString().slice(0, 10); // 截取到日期部分
        res.render(view, { item: item });       
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
}
app.get('/expenses/edit/:id', requireLogin,async (req, res) => {
   renderEdit(Expense, 'expenses/edit_transaction',req,res);
});
app.get('/incomes/edit/:id', requireLogin, async (req, res) => {
    renderEdit(Income, 'incomes/edit',req,res);
});

const updateData = async (Model,req,res,path) => {
    try {
        const id = req.params.id;
        const { description, amount, category,subcategory,date } = req.body;
        await Model.findByIdAndUpdate(id, {
            description: description,
            amount: amount,
            category: category,
            subcategory: subcategory,
            date: date // 更新 date
        });
        res.redirect(path);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
}

app.post('/expenses/edit/:id', requireLogin,async (req, res) => {
    updateData(Expense,req,res,'/expenses')
});
app.post('/incomes/edit/:id', requireLogin, async (req, res) => {
    updateData(Income,req,res,'/incomes')
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