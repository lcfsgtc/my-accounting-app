const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userSchema = new Schema({
  username: { type: String, required: true, unique: true },
  email: { // Add this new field
    type: String,
    required: true,
    unique: true, // Email should also be unique
    lowercase: true, // Store email in lowercase for consistency
    trim: true, // Remove whitespace from both ends
    match: [/^[\w-]+(?:\.[\w-]+)*@(?:[\w-]+\.)+[a-zA-Z]{2,7}$/, 'Please enter a valid email address'] // Basic email regex validation
  },  
  password: { type: String, required: true },
  isAdmin: { type: Boolean, default: false },
  registrationDate: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);