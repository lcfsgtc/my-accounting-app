const path = require('path');
const bcrypt = require('bcrypt');
module.exports = (app, User, requireLogin, requireAdmin, bcrypt) => {//createAdminUser,
// 限制每天注册的新用户数量
const checkRegistrationLimit = async (req, res, next) => {
    const MAX_DAILY_REGISTRATIONS = 3;
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
    // 注册页面
    app.get('/register', checkRegistrationLimit, (req, res) => {
      res.render('login/register');
    });
    // 注册
    app.post('/register', checkRegistrationLimit, async (req, res) => {
      try {
        const { username, email,password } = req.body;
        // --- Server-side validation for email ---
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).send('Please enter a valid email address.');
        }
        // 检查用户名是否已存在
        const existingUser = await User.findOne({ username: username });
        if (existingUser) {
          return res.status(400).send('Username already exists.');
        }
        // Check if email already exists (important for uniqueness)
        const existingEmailUser = await User.findOne({ email: email });
        if (existingEmailUser) {
          return res.status(400).send('Email already registered.');
        }

        // 对密码进行哈希处理
        const hashedPassword = await bcrypt.hash(password, 10);

        // 创建新用户
        const newUser = new User({
          username: username,
          email: email,
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
        //req.user = user;
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
        const { username, email,isAdmin } = req.body;
        const userId = req.params.id;

        // Get the existing user
        const user = await User.findById(userId);
        if (!user) {
          return res.status(404).send('User not found');
        }
        // --- Server-side validation for email ---
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).send('Please enter a valid email address.');
        }
        // Only update the username if it's different, and check for uniqueness
        if (username !== user.username) {
          const existingUser = await User.findOne({ username: username });
          if (existingUser) {
            return res.status(400).send('Username already exists');
          }
          user.username = username;
        }
        // Only update the email if it's different, and check for uniqueness
        if (email !== user.email) {
          const existingUserWithEmail = await User.findOne({ email: email });
          if (existingUserWithEmail && existingUserWithEmail._id.toString() !== userId) {
            return res.status(400).send('Email already registered by another user.');
          }
          user.email = email; // Update the email
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
    // 重置用户密码功能 (管理员权限)
    app.post('/admin/users/reset-password/:id', requireAdmin, async (req, res) => {
        try {
            const userId = req.params.id;
            const DEFAULT_PASSWORD = '123456'; // 定义默认重置密码

            // 查找用户
            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).send('User not found.');
            }

            // 对新密码进行哈希处理
            const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);

            // 更新密码
            user.password = hashedPassword;
            await user.save();

            console.log(`User ${user.username} (ID: ${userId}) password reset to default.`);
            res.redirect('/admin/users'); // 重定向回用户管理页面
        } catch (err) {
            console.error('Error resetting user password:', err);
            res.status(500).send('Server Error');
        }
    });    
    // 创建管理员账户 (只运行一次)
    const createAdminUser = async () => {
      try {
        const adminUsername = "guanli";
        const adminPassword = "111111"; // 替换为你想要的管理员密码

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
}