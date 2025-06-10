const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const diarySchema = new mongoose.Schema({
    date: { type: Date, required: true },
    title: { type: String, default: '无标题' }, // 添加标题
    weather: { type: String,
        enum: ['晴', '多云', '阴', '雨', '雪', '风', '雾', '其他', ''], // 增加天气选项和空值
        default: '' // 默认值可以为空
     },
    mood: { type: String, enum: ['快乐', '悲伤', '平静', '激动', '沮丧'] }, // 使用枚举限制心情选项
    location: { type: String }, // 地点
    people: [{ type: String }], // 相关人物列表
    tags: [{ type: String }], // 标签，用于分类日记
    planList: [{ type: String }], // 计划列表
    eventList: [{ type: String }], // 事件列表
    feeling: { type: String },   // 心情随笔
    summary: { type: String,required: false }, // 每日总结
    imageUrls: [{ type: String }], // 图片 URL 列表
    isPublic: { type: Boolean, default: false }, // 是否公开
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }},
    { timestamps: true }
);

module.exports = mongoose.model('Diary', diarySchema);