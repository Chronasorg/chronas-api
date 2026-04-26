/**
 * forum model
 */
import mongoose from 'mongoose';

const forumSchema = mongoose.Schema({
  forum_slug: String,
  forum_name: String
});

export default mongoose.model('forum', forumSchema);
