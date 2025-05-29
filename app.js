require("dotenv").config();
const express = require('express');
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const session = require('express-session');
const MongoStore = require('connect-mongo');

const app = express();
const port = 3000;

// 设置 EJS 模板引擎
app.set('view engine', 'ejs');
app.use(express.static('public')); // Serve static files (CSS, images, etc.)

// 使用 body-parser 中间件
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

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
const transactionSchema = new mongoose.Schema({
  description: { type: String, required: true },
  amount: { type: Number, required: true },
  category: { type: String, required: true },
  date: { type: Date,required: true, default: Date.now },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true } // 添加 userId 字段
});

// 创建 Transaction Model
const Transaction = mongoose.model('Transaction', transactionSchema);
// 定义 User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isAdmin: { type: Boolean, default: false }, // 添加 isAdmin 字段
  registrationDate: { type: Date, default: Date.now }
});
// 创建 User Model
const User = mongoose.model('User', userSchema);

// 配置 session 中间件
app.use(session({
  secret: 'lcf123456', // 替换为你自己的密钥
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 days
}));

// 限制每天注册的新用户数量
const MAX_DAILY_REGISTRATIONS = 5;

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
    if (!req.session.userId) {
        return res.redirect('/login');
    }
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
  res.render('register');
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
  res.render('login');
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

    // 将用户 ID 存储在 session 中
    req.session.userId = user._id;

    res.redirect('/');
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
// 首页 - 显示所有交易记录
app.get('/', async (req, res) => {
  try {
    //const transactions = await Transaction.find().sort({ date: 'desc' }); // 从数据库中获取所有交易记录
    const transactions = await Transaction.find({ userId: req.session.userId }).sort({ date: 'desc' }); // 只显示当前用户的交易记录
    res.render('index', { transactions: transactions });  // 渲染 index.ejs 模板，并将交易记录传递给模板
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// 添加交易记录页面
app.get('/add', requireLogin,(req, res) => {
  res.render('add_transaction');
});

// 添加交易记录
app.post('/add',  requireLogin,async (req, res) => {
  try {
    const { description, amount, category, date } = req.body;// 获取 date
    const newTransaction = new Transaction({
      description: description,
      amount: amount,
      category: category,
      date: date,
      userId: req.session.userId // 添加 userId     
    });
    await newTransaction.save(); // 将新的交易记录保存到数据库中
    res.redirect('/'); // 重定向到首页
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// 删除交易记录
app.post('/delete/:id', requireLogin,async (req, res) => {
    try {
        const id = req.params.id;
        await Transaction.findByIdAndDelete(id);
        res.redirect('/');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// 获取要编辑的交易记录
app.get('/edit/:id', requireLogin,async (req, res) => {
    try {
        const id = req.params.id;
        const transaction = await Transaction.findById(id);
        // 将日期转换为 ISO 字符串格式
        transaction.dateISO = transaction.date.toISOString().slice(0, 10); // 截取到日期部分
        res.render('edit_transaction', { transaction: transaction });        
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// 更新交易记录
app.post('/edit/:id', requireLogin,async (req, res) => {
    try {
        const id = req.params.id;
        const { description, amount, category,date } = req.body;
        await Transaction.findByIdAndUpdate(id, {
            description: description,
            amount: amount,
            category: category,
            date: date // 更新 date
        });
        res.redirect('/');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// 账单分类统计
app.get('/statistics', requireLogin,async (req, res) => {
    const { period } = req.query; // 获取查询参数 period (month 或 year)
    let groupBy = {};
    let dateFormat = '';

    if (period === 'month') {
        groupBy = {
            year: { $year: '$date' },
            month: { $month: '$date' }
        };
        dateFormat = '%Y-%m';
    } else if (period === 'year') {
        groupBy = {
            year: { $year: '$date' }
        };
        dateFormat = '%Y';
    } else {
        // 默认统计所有数据
        groupBy = {
            category: '$category'
        };
        dateFormat = null;
    }

    try {
        let pipeline = [];

        if (dateFormat) {
             pipeline = [
                {
                    $match: { userId: req.session.userId } // Only statistics for current user
                },
                {
                    $group: {
                        _id: groupBy,
                        totalAmount: { $sum: '$amount' }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        period: {
                            $dateToString: {
                                format: dateFormat,
                                date: {
                                    $dateFromParts: {
                                        'year': '$_id.year',
                                        'month': { $ifNull: ['$_id.month', 1] },
                                        'day': 1
                                    }
                                }
                            }
                        },
                        totalAmount: 1
                    }
                },
                {
                    $sort: { period: 1 }  // Sort by period in ascending order
                }
            ];
        } else {
            // Default grouping by category
            pipeline = [
                {
                    $match: { userId: req.session.userId } // Only statistics for current user
                },
                {
                    $group: {
                        _id: '$category',
                        totalAmount: { $sum: '$amount' }
                    }
                },
                {
                    $sort: { _id: 1 }  // Sort by category in ascending order
                }
            ];
        }

        const statistics = await Transaction.aggregate(pipeline);
        res.render('statistics', { statistics: statistics, period: period });
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