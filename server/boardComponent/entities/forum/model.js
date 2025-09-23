/**
 * forum model
 */
const mongoose = require('mongoose')

const forumSchema = mongoose.Schema({
  forum_slug: String,
  forum_name: String,
}, { usePushEach: true })

export default mongoose.model('forum', forumSchema)
