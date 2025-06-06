const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const diarySchema = new mongoose.Schema({
    date: { type: Date, required: true },
    title: { type: String, default: '无标题' }, // 添加标题
    weather: { type: String },
    mood: { type: String, enum: ['happy', 'sad', 'neutral', 'excited', 'frustrated'] }, // 使用枚举限制心情选项
    location: { type: String }, // 地点
    people: [{ type: String }], // 相关人物列表
    tags: [{ type: String }], // 标签，用于分类日记
    planList: [{ type: String }], // 计划列表
    eventList: [{ type: String }], // 事件列表
    feeling: { type: String },   // 心情随笔
    summary: { type: String }, // 每日总结
    imageUrls: [{ type: String }], // 图片 URL 列表
    isPublic: { type: Boolean, default: false }, // 是否公开
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
});

module.exports = mongoose.model('Diary', diarySchema);