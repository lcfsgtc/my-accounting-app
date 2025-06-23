require("dotenv").config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcrypt');
const multer = require('multer');
const fs = require('fs');
const methodOverride = require('method-override'); // <-- 新增
const expressLayouts = require('express-ejs-layouts'); // <-- 新增
const flash = require('connect-flash');// <-- 新增

const userRoute = require('./routes/user');
const incomeRoute = require('./routes/income');
const expenseRoute = require('./routes/expense');
const assetRoute = require('./routes/asset'); 
const diaryRoute = require('./routes/diary');
const booknoteRoute = require('./routes/booknote');

const app = express();
const port = 3000;
const PROJECT_ROOT = process.cwd();
console.log('PROJECT_ROOT:', PROJECT_ROOT);  
global.__basedir = __dirname;

// 数据库连接
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// 引入 Model
const User = require('./models/user');
const Expense = require('./models/expense');
const Income = require('./models/income');
const Asset = require('./models/asset'); 
const Diary= require('./models/diary');
const Booknote= require('./models/bookNote');
// 中间件
app.set('view engine', 'ejs');
//app.set('views', path.join(__dirname, 'views'));
app.set('views', path.join(PROJECT_ROOT, 'views'));
//app.set('views', './views'); // 确保视图路径正确
//app.use(express.static('public'));
app.use(express.static(path.join(PROJECT_ROOT, 'public')));

// 配置 express-ejs-layouts
app.use(expressLayouts); // <-- 使用布局
//app.set('layout', 'layouts/main'); // 设置默认布局文件 (如果你有的话), 否则在每个页面指定

app.use(bodyParser.urlencoded({ extended: true }));
// Method override
app.use(methodOverride('_method')); // <-- 使用 method-override

app.use(bodyParser.json());
app.use(function(req, res, next) {
    //res.locals.basedir = path.join(__dirname, 'views');
    res.locals.basedir = path.join(PROJECT_ROOT, 'views');
    next();
});
app.use(session({
    secret: process.env.SESSION_SECRET, // 使用环境变量
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));
// Connect flash
//  Flash middleware (must be after session)
app.use(flash());
// 3. Make flash messages available in res.locals (must be after flash)
app.use((req, res, next) => {
    res.locals.messages = req.flash();
    next();
});
// Global variables for flash messages
app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.error = req.flash('error'); // Passport.js 通常会设置 'error'
    res.locals.session = req.session; // 传递 session 信息到所有模板
    next();
});

// 配置 multer 中间件
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        //cb(null, 'public/uploads/'); // 设置上传文件的存储目录
        cb(null, path.join(PROJECT_ROOT, 'public', 'uploads'));
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname)); // 设置上传文件的名称
    }
});

const upload = multer({ storage: storage });
// 中间件：检查用户是否已登录
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

const { Parser } = require('json2csv');
const querystring = require('querystring');

// 引入路由模块，传递 app 和模型, 以及中间件
userRoute(app, User, requireLogin, requireAdmin,bcrypt);//createAdminUser,
incomeRoute(app, Income, requireLogin,mongoose, path, querystring, Parser,formatDate);
expenseRoute(app, Expense, requireLogin,mongoose, path, querystring, Parser,formatDate);
assetRoute(app, Asset, requireLogin,mongoose, path, querystring, Parser,formatDate); 
diaryRoute(app, Diary, requireLogin,mongoose, path, querystring,upload);
booknoteRoute(app, Booknote, requireLogin,mongoose, path, querystring,upload);

// 首页 - 导航页
app.get('/', requireLogin, async (req, res) => {
    res.redirect('/dashboard');
});
app.get('/dashboard', requireLogin, (req, res) => {
    console.log(req);
    res.render('login/dashboard',{ session: req.session });
});
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    //const minutes = String(date.getMinutes()).padStart(2, '0');
    //const seconds = String(date.getSeconds()).padStart(2, '0');
    //return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    return `${year}-${month}-${day}`;
}

const actualPort = process.env.PORT || port;
// 启动服务器
app.listen(actualPort, () => {
    console.log(`Server listening on port ${actualPort}`);
});

module.exports = app;