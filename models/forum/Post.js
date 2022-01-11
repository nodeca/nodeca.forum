'use strict';


const _              = require('lodash');
const Mongoose       = require('mongoose');
const Schema         = Mongoose.Schema;


module.exports = function (N, collectionName) {

  function set_content_type(name, value) {
    N.shared = N.shared || {};
    N.shared.content_type = N.shared.content_type || {};

    let duplicate = Object.entries(N.shared.content_type).find(([ , v ]) => v === value)?.[0];

    if (typeof duplicate !== 'undefined') {
      throw new Error(`Duplicate content type id=${value} for ${name} and ${duplicate}`);
    }

    N.shared.content_type[name] = value;
  }

  set_content_type('FORUM_POST', 1);

  let statuses = {
    VISIBLE:      1,
    HB:           2, // hellbanned
    PENDING:      3, // reserved, not used now
    DELETED:      4,
    DELETED_HARD: 5
  };


  statuses.LIST_DELETABLE = [ statuses.VISIBLE, statuses.HB, statuses.PENDING ];
  statuses.LIST_HARD_DELETABLE = [ ...statuses.LIST_DELETABLE, statuses.DELETED ];

  let Post = new Schema({
    topic           : Schema.ObjectId,
    section         : Schema.ObjectId,
    hid             : Number,

    // Related post for replies
    to              : Schema.ObjectId,
    user            : Schema.ObjectId,
    legacy_nick     : String,  // only if user id is undefined, e.g. guests
    ts              : { type: Date, default: Date.now },  // timestamp
    ip              : String,  // ip address

    // Data for displaying "replied to" link
    to_user         : Schema.ObjectId,
    to_phid         : Number,

    // those are rarely used (only if it's a reply to a different topic)
    to_fhid         : Number,
    to_thid         : Number,

    html            : String,  // displayed HTML
    md              : String,  // markdown source

  // State (normal, closed, soft-deleted, hard-deleted, hellbanned,...)
  // constants should be defined globally
    st              : Number,
    ste             : Number,  // real state, if topic is sticky or hellbanned
                               // (general `state` is used for fast selects)

  // Flag set if topic state isn't deleted or hard deleted;
  // used in counting user's activity to quickly determine if a post
  // should be counted (i.e. in a visible topic) or not
    topic_exists    : { type: Boolean, default: true },

  // Aggregated votes count
    votes           : { type: Number, default: 0 },
    votes_hb        : { type: Number, default: 0 },

  // An amount of edits made for this post
    edit_count      : Number,

  // Time when this post was last edited (null if no edits)
    last_edit_ts    : Date,

  // Bookmarks count
    bookmarks       : { type: Number, default: 0 },

    del_reason      : String,
    del_by          : Schema.ObjectId,
  // Previous state for deleted posts
    prev_st         : {
      st: Number,
      ste: Number
    },

  // Post params
    params_ref      : Schema.ObjectId,

  // List of urls to accessible resources being used to build this post (snippets, etc.)
    imports         : [ String ],

  // List of users to fetch in order to properly display the post
    import_users    : [ Schema.ObjectId ]
  }, {
    versionKey : false
  });

  // Indexes
  ////////////////////////////////////////////////////////////////////////////////

  //  - get a post by topic + hid
  //  - get posts by hid range
  //
  Post.index({
    topic: 1,
    hid:   1,
    st:    1
  });

  // - count all posts before current (pagination)
  //
  Post.index({
    topic: 1,
    st:    1,
    hid:   1
  });

  // - get posts in a section sorting by date
  // - get last N posts in a section
  //
  Post.index({
    section: 1,
    _id:     1
  });

  // - count all messages from a user in a given section
  Post.index({
    user: 1,
    section: 1,
    st: 1,
    topic_exists: 1
  });


  // Simultaneously create topic and first post in it.
  //
  // Usage:
  //
  //     let user_info = await userInfo(N, user_id)
  //     let topic = new N.models.forum.Topic({ title })
  //     let post  = new N.models.forum.Post({ section, md })
  //     await post.createWithTopic(topic, user_info)
  //
  Post.methods.createWithTopic = async function (topic, user_info) {
    /* eslint-disable-next-line consistent-this */
    let post = this;

    // fill section if it's missing
    let section_id = post.section || topic.section;
    post.section = post.section || section_id;
    topic.section = topic.section || section_id;

    // set statuses
    if (!topic.st) {
      if (user_info.hb) {
        topic.st  = N.models.forum.Topic.statuses.HB;
        topic.ste = N.models.forum.Topic.statuses.OPEN;
      } else {
        topic.st  = N.models.forum.Topic.statuses.OPEN;
      }
    }

    if (!post.st) {
      if (user_info.hb) {
        post.st  = N.models.forum.Post.statuses.HB;
        post.ste = N.models.forum.Post.statuses.VISIBLE;
      } else {
        post.st  = N.models.forum.Post.statuses.VISIBLE;
      }
    }

    // set user id
    post.user = post.user || user_info.user_id;
    post.ts = post.ts || Date.now();

    // fill cache
    topic.cache.post_count = 1;

    topic.cache.first_post = post._id;
    topic.cache.first_ts = post.ts;
    topic.cache.first_user = post.user;

    topic.cache.last_post = post._id;
    topic.cache.last_ts = post.ts;
    topic.cache.last_post_hid = 1;
    topic.cache.last_user = post.user;

    Object.assign(topic.cache_hb, topic.cache);

    // get parser options if not available
    if (!post.params) {
      post.params = await N.settings.getByCategory(
        'forum_posts_markup',
        { usergroup_ids: user_info.usergroups },
        { alias: true });
    }

    // compile html if it's not available
    if (!post.html) {
      let parse_result = await N.parser.md2html({
        text: post.md,
        options: post.params,
        user_info
      });

      post.html = parse_result.html;
      post.imports = parse_result.imports;
      post.import_users = parse_result.import_users;
    }

    // save topic and post
    await topic.save();
    post.topic = topic._id;
    await post.save();

    // schedule update tasks
    await N.queue.forum_post_images_fetch(post._id).postpone();
    await N.queue.forum_topics_search_update_with_posts([ topic._id ]).postpone();
    await N.models.forum.Section.updateCache(topic.section);

    await N.models.forum.UserTopicCount.inc(user_info.user_id, {
      section_id: topic.section,
      is_hb: user_info.hb
    });

    await N.models.forum.UserPostCount.inc(user_info.user_id, {
      section_id: topic.section,
      is_hb: user_info.hb
    });

    // add new topic notification for subscribers
    let subscriptions = await N.models.users.Subscription.find()
      .where('to').equals(topic.section)
      .where('type').equals(N.models.users.Subscription.types.WATCHING)
      .lean(true);

    if (!subscriptions.length) return;

    let subscribed_users = subscriptions.map(s => s.user);

    let ignore = _.keyBy(
      await N.models.users.Ignore.find()
                .where('from').in(subscribed_users)
                .where('to').equals(user_info.user_id)
                .select('from to -_id')
                .lean(true),
      'from'
    );

    subscribed_users = subscribed_users.filter(user_id => !ignore[user_id]);

    if (!subscribed_users.length) return;

    await N.wire.emit('internal:users.notify', {
      src: topic._id,
      to: subscribed_users,
      type: 'FORUM_NEW_TOPIC'
    });

    // mark current user as active
    await N.wire.emit('internal:users.mark_user_active', { user_info });
  };


  // Set 'hid' for the new post.
  //
  Post.pre('save', async function () {
    if (!this.isNew) return;

    let topic = await N.models.forum.Topic.findByIdAndUpdate(
      this.topic,
      { $inc: { last_post_counter: 1 } },
      { new: true }
    );

    this.hid = topic.last_post_counter;
  });


  // Remove empty "imports" and "import_users" fields
  //
  Post.pre('save', function () {
    if (this.imports?.length === 0) {
      /*eslint-disable no-undefined*/
      this.imports = undefined;
    }

    if (this.import_users?.length === 0) {
      /*eslint-disable no-undefined*/
      this.import_users = undefined;
    }
  });


  // Store parser options separately and save reference to them
  //
  Post.pre('save', async function () {
    if (!this.params) return;

    let id = await N.models.core.MessageParams.setParams(this.params);

    /*eslint-disable no-undefined*/
    this.params = undefined;
    this.params_ref = id;
  });


  // Export statuses
  //
  Post.statics.statuses = statuses;


  N.wire.on('init:models', function emit_init_Post() {
    return N.wire.emit('init:models.' + collectionName, Post);
  });

  N.wire.on('init:models.' + collectionName, function init_model_Post(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
