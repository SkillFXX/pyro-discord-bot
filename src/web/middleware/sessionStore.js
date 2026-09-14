const session = require('express-session');
const { Session } = require('../../database');

/**
 * Persistent SQLite Session Store via Sequelize
 * Prevents MemoryStore memory leak warnings and preserves sessions across server restarts.
 */
class SequelizeSessionStore extends session.Store {
  async get(sid, fn) {
    try {
      const sess = await Session.findByPk(sid);
      if (!sess) return fn();
      if (sess.expires && new Date(sess.expires).getTime() < Date.now()) {
        await sess.destroy();
        return fn();
      }
      const data = JSON.parse(sess.data);
      fn(null, data);
    } catch (err) {
      fn(err);
    }
  }

  async set(sid, sess, fn) {
    try {
      const expires = sess.cookie && sess.cookie.expires ? new Date(sess.cookie.expires) : null;
      await Session.upsert({
        sid,
        data: JSON.stringify(sess),
        expires
      });
      if (fn) fn();
    } catch (err) {
      if (fn) fn(err);
    }
  }

  async destroy(sid, fn) {
    try {
      await Session.destroy({ where: { sid } });
      if (fn) fn();
    } catch (err) {
      if (fn) fn(err);
    }
  }

  async touch(sid, sess, fn) {
    try {
      const expires = sess.cookie && sess.cookie.expires ? new Date(sess.cookie.expires) : null;
      if (expires) {
        await Session.update({ expires }, { where: { sid } });
      }
      if (fn) fn();
    } catch (err) {
      if (fn) fn(err);
    }
  }
}

module.exports = {
  SequelizeSessionStore
};

