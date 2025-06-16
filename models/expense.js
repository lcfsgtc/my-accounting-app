const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
const Schema = mongoose.Schema;

const expenseSchema = new Schema({
    description: { type: String, required: true },
    amount: { type: Number, required: true },
    category: {
        type: String,
        required: true,
        // 添加 enum 属性，限制 category 只能是这些值
        enum: ['衣', '食', '住', '行', '医', '娱', '人情', '其他']
    },
    subcategory: { type: String, required: true },
    date: { type: Date, required: true, default: Date.now },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
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
expenseSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});
expenseSchema.plugin(mongoosePaginate);
module.exports = mongoose.model('Expense', expenseSchema);