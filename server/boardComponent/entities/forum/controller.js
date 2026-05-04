import Discussion from '../discussion/model.js';
import Forum from './model.js';

const getAllForums = async () => {
  try {
    const results = await Forum.find({}).exec();
    return results || [];
  } catch (error) {
    console.log(error);
    throw error;
  }
};

const getDiscussions = async (forum_slug, pinned, sorting_method = 'date', qEntity = false, offset = 0, limit = 10) => {
  try {
    const sortWith = {};
    if (sorting_method === 'date') sortWith.date = -1;
    if (sorting_method === 'popularity') sortWith.favorites = -1;

    const forumFound = await Forum.findOne({ forum_slug }).exec();

    const searchObj = { pinned };
    if (qEntity) {
      searchObj.qa_id = qEntity;
    } else {
      searchObj.forum_id = (forumFound || {})._id;
    }

    const [discussions, discussionCount] = await Promise.all([
      Discussion
        .find(searchObj)
        .sort(sortWith)
        .populate('forum')
        .populate('user')
        .lean()
        .skip(+offset)
        .limit(+limit)
        .exec(),
      Discussion.countDocuments(searchObj).exec()
    ]);

    if (!discussions) {
      return [[], 0];
    }

    return [discussions, discussionCount];
  } catch (error) {
    console.error('Error in getDiscussions:', error);
    throw error;
  }
};

export default {
  getAllForums,
  getDiscussions
};
