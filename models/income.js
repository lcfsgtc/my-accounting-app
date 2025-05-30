const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const incomeSchema = new Schema({
    description: { type: String, required: true },
    amount: { type: Number, required: true },
    category: { type: String, required: true },
    subcategory: { type: String, required: true },
    date: { type: Date, required: true, default: Date.now },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
});

module.exports = mongoose.model('Income', incomeSchema);