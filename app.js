require("dotenv").config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcrypt');

const userRoute = require('./routes/user');
const incomeRoute = require('./routes/income');
const expenseRoute = require('./routes/expense');

const app = express();
const port = 3000;

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
    secret: process.env.SESSION_SECRET, // 使用环境变量
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

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

// 启动服务器
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});

//放在最后
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}