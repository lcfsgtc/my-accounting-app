const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userSchema = new Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isAdmin: { type: Boolean, default: false },
  registrationDate: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);