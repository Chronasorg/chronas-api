/**
 * discussion model
 */
const mongoose = require('mongoose');

const discussionSchema = mongoose.Schema({
  forum_id: mongoose.Schema.ObjectId,
  forum: { type: mongoose.Schema.ObjectId, ref: 'forum' },
  discussion_slug: String,
  user_id: String,
  user: { type: String, ref: 'User' },
  date: Date,
  title: String,
  qa_id: { type: String, default: '!na' },
  content: Object,
  favorites: Array,
  tags: Array,
  pinned: Boolean,
}, { usePushEach: true })

module.exports = mongoose.model('discussion', discussionSchema)
