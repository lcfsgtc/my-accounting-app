module.exports = {
  functions: {
    'app.js': { // 确保这里的文件名与你的入口文件匹配
      memory: 256, // 调整内存大小 (MB)
      maxDuration: 6, // 调整最大执行时间 (秒)
    },
  },
};