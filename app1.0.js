require("dotenv").config();
const express = require('express');
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const bodyParser = require('body-parser');

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
  date: { type: Date,required: true, default: Date.now }
});

// 创建 Transaction Model
const Transaction = mongoose.model('Transaction', transactionSchema);

// 首页 - 显示所有交易记录
app.get('/', async (req, res) => {
  try {
    const transactions = await Transaction.find().sort({ date: 'desc' }); // 从数据库中获取所有交易记录
    res.render('index', { transactions: transactions });  // 渲染 index.ejs 模板，并将交易记录传递给模板
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// 添加交易记录页面
app.get('/add', (req, res) => {
  res.render('add_transaction');
});

// 添加交易记录
app.post('/add', async (req, res) => {
  try {
    const { description, amount, category } = req.body;
    const newTransaction = new Transaction({
      description: description,
      amount: amount,
      category: category
    });
    await newTransaction.save(); // 将新的交易记录保存到数据库中
    res.redirect('/'); // 重定向到首页
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// 删除交易记录
app.post('/delete/:id', async (req, res) => {
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
app.get('/edit/:id', async (req, res) => {
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
app.post('/edit/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const { description, amount, category , date } = req.body;
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
app.get('/statistics', async (req, res) => {
  try {
    const statistics = await Transaction.aggregate([
      {
        $group: {
          _id: '$category',  //  按照 category 字段分组
          totalAmount: { $sum: '$amount' } //  计算每个 category 的总金额
        }
      }
    ]);
    res.render('statistics', { statistics: statistics });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// 启动服务器
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});