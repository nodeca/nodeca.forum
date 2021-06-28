// Fill out methods for NNTP server
//

'use strict';

const _       = require('lodash');
const memoize = require('promise-memoize');
const url     = require('url');


module.exports = function (N) {

  let hostname = url.parse(N.config.bind?.default?.mount || 'http://localhost/').hostname;

  N.wire.before('init:server.nntp', function init_nntp_methods_forum(nntp) {

    const get_section = memoize(function _get_section(id) {
      return N.models.forum.Section.findById(id).lean(true);
    }, { maxAge: 5 * 60 * 1000 });

    nntp._filterAccess_forum = async function (session, groups) {
      let result = groups.map(() => false);

      let forum_groups = groups.filter(group => (group.type === 'forum'));

      if (!forum_groups.length) return result;

      let sections = await Promise.all(forum_groups.map(g => get_section(g.source)));

      if (!sections.length) return result;

      let user_info = await this._getUserInfo(session);

      let access_env = { params: { sections, user_info } };

      await N.wire.emit('internal:forum.access.section', access_env);

      let visible_sections_by_id = _.keyBy(
        sections.filter((section, idx) => !!access_env.data.access_read[idx]),
        '_id'
      );

      return groups.map(group => (group.type === 'forum' && !!visible_sections_by_id[group.source]));
    };


    function mime_encode(str) {
      return /[^\x20-\x7E]|[()<>,:@!/=;]/.test(str) ?
             '=?utf-8?B?' + Buffer.from(str).toString('base64') + '?=' :
             str;
    }


    // Fetch additional data necessary to render NNTP article representing
    // a forum post (from, date, subject, etc.).
    //
    // For each article it returns object like this:
    //
    // {
    //   // generic article data (copied from input)
    //   group:    Object,   // actual group object, not group_id
    //   source:   ObjectId, // post id, also part of message id
    //   index:    Number,
    //
    //   // fields needed for OVER, HDR or renderers
    //   type:     String,   // group type, always 'forum' here
    //   body:     String,   // post.html
    //   date:     Date,
    //   reply_to: ObjectId, // topic.cache.first_post, used for References
    //   subject:  String,   // topic.title
    //   from:     String,
    //
    //   // raw data fetched from db, may be needed for templates
    //   topic:    Object,
    //   post:     Object,
    //   user:     Object
    // }
    //
    nntp._fetchArticleData_forum = async function (group, articles) {
      let single = !Array.isArray(articles);

      if (single) articles = [ articles ];

      let results = [];

      let posts = await N.models.forum.Post.find()
                            .where('_id').in(articles.map(article => String(article.source)))
                            .lean(true);

      if (posts) {
        let topics = await N.models.forum.Topic.find()
                               .where('_id').in(_.uniq(posts.map(post => String(post.topic))))
                               .lean(true);

        let sections = await N.models.forum.Section.find()
                                 .where('_id').in(_.uniq(topics.map(topic => String(topic.section))))
                                 .lean(true);

        let users = await N.models.users.User.find()
                              .where('_id').in(_.uniq(posts.map(post => post.user).filter(Boolean).map(String)))
                              .lean(true);

        let posts_by_id    = _.keyBy(posts, '_id');
        let topics_by_id   = _.keyBy(topics, '_id');
        let sections_by_id = _.keyBy(sections, '_id');
        let users_by_id    = _.keyBy(users, '_id');

        for (let article of articles) {
          let post = posts_by_id[article.source];
          if (!post) continue;

          let topic = topics_by_id[post.topic];
          if (!topic) continue;

          let section = sections_by_id[topic.section];
          if (!section) continue;

          let user = users_by_id[post.user];

          results.push({
            group,
            source:   article.source,
            index:    article.index,

            type:     'forum',
            body:     post.html,
            date:     post.ts,
            reply_to: post.hid > 1 ? (topic.cache && topic.cache.first_post) : null,
            subject:  mime_encode(topic.title),
            from:     mime_encode(user ? user.nick : post.legacy_nick) + ` <no_reply@${hostname}>`,

            section,
            topic,
            post,
            user
          });
        }
      }

      return single ? (results[0] || null) : results;
    };
  });


  // Add/remove NNTP articles whenever user adds or removes a forum post;
  //
  N.wire.after('init:models', { priority: 20 }, function add_forum_hooks() {
    // don't add any hooks if nntp module is not loaded
    if (!N.models.nntp) return;

    // Add post to NNTP index
    //
    N.wire.after([
      'server:forum.topic.create',
      'server:forum.topic.post.reply'
    ], { priority: 20 }, async function add_nntp_article(env) {
      let post = env.data.new_post;
      let topic = env.data.new_topic || env.data.topic;
      let section = env.data.section;

      // permission check (not using forum.access.post because posts
      // inside restricted sections should still be in index);
      // only check `st` for posts assuming st=HB,ste=VISIBLE posts aren't public
      if (!(post.st === N.models.forum.Post.statuses.VISIBLE &&
            N.models.forum.Topic.statuses.LIST_VISIBLE.includes(topic.st))) {
        return;
      }

      let group = await N.models.nntp.Group.findOneAndUpdate(
        {
          type:   'forum',
          source: section._id
        },
        { $inc: { last_index: 1 } },
        { new: true }
      ).lean(true);

      if (!group) return;

      await new N.models.nntp.Article({
        source: post._id,
        parent: topic._id,
        index:  group.last_index,
        group:  group._id
      }).save();

      await N.models.nntp.Group.updateOne(
        { _id: group._id },
        { $set: { max_index: group.last_index } }
      ).lean(true);
    });


    // Remove a single post
    //
    N.wire.after('server:forum.topic.post.destroy', { priority: 20 }, async function remove_nntp_article(env) {
      await N.models.nntp.Article.deleteOne({ source: env.data.post._id });
    });


    // Remove multiple posts from a single topic
    //
    N.wire.after('server:forum.topic.post.destroy_many', { priority: 20 }, async function remove_nntp_articles(env) {
      await N.models.nntp.Article.deleteMany(
        { source: { $in: env.data.posts.map(p => p._id) } }
      );
    });


    // Remove a single topic, move a single topic to a different section
    //
    N.wire.after([
      'server:forum.topic.destroy',
      'server:forum.topic.move'
    ], { priority: 20 }, async function remove_nntp_articles(env) {
      await N.models.nntp.Article.deleteMany(
        { parent: env.data.topic._id }
      );
    });


    // Mass-removal of topics, mass-moving to a different section
    //
    N.wire.after([
      'server:forum.section.topic.destroy_many',
      'server:forum.section.topic.move_many'
    ], { priority: 20 }, async function remove_nntp_articles(env) {
      await N.models.nntp.Article.deleteMany(
        { parent: { $in: env.data.topics.map(t => t._id) } }
      );
    });
  });
};
