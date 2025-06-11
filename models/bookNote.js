const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
const bookNoteSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    author: {
        type: String,
        trim: true,
        default: '未知'
    },
    publishYear: {
        type: Number,
        min: 1000,
        max: 9999,
        required: false // 出版年份可以为空
    },
    category: { // 图书大类，例如：小说、历史、技术
        type: String,
        trim: true,
        default: '未分类'
    },
    tags: [String], // 标签，方便分类和查询
    readDate: {
        type: Date,
        default: Date.now // 默认为当前日期
    },
    rating: { // 评分，例如1-5星
        type: Number,
        min: 1,
        max: 5,
        required: false
    },
    notes: { // 笔记内容
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// 在保存前更新 updatedAt
bookNoteSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});
bookNoteSchema.plugin(mongoosePaginate);
module.exports = mongoose.model('BookNote', bookNoteSchema);