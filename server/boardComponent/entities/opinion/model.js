/**
 * opinion model
 */
const mongoose = require('mongoose');

const opinionSchema = mongoose.Schema({
  forum_id: mongoose.Schema.ObjectId,
  forum: { type: mongoose.Schema.ObjectId, ref: 'forum' },
  discussion_id: mongoose.Schema.ObjectId,
  discussion: { type: mongoose.Schema.ObjectId, ref: 'discussion' },
  user_id: String,
  user: { type: String, ref: 'User' },
  date: Date,
  score: {
    type: Number,
    default: 0,
  },
  content: Object,
}, { usePushEach: true });

module.exports = mongoose.model('opinion', opinionSchema);
