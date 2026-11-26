import User from '../models/user.model.js';

// The users API (/v1/users) was retired on 2026-11-26. What is left keeps the
// karma counters of edits and revisions up to date.

async function changePoints(username, type, delta = 1) {
  try {
    const user = await User.findOne({ username }).exec();
    if (typeof user !== 'undefined') {
      user.karma = (Number(user.karma) || 0) + delta;
      user[`count_${type}`] = (Number(user[`count_${type}`]) || 0) + delta;
      await user.save();
    }
  } catch (e) {
    console.error('Error changing points:', e);
  }
}


async function incrementLoginCount(username) {
  try {
    const user = await User.findOne({ username }).exec();
    if (typeof user !== 'undefined') {
      user.loginCount = (Number(user.loginCount) || 0) + 1;
      await user.save();
    }
  } catch (e) {
    console.error('Error incrementing login count:', e);
  }
}

export default { changePoints, incrementLoginCount };
