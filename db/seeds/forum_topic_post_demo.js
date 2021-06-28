'use strict';


/*
 * This seed create data for demo section:
 *   3 category, each category contain 10 sections
 *   last section in 3rd category is empty
 *   first section contain 200 topics, all others only one
 *   first topic in first topic contain 100 post, all others only one
 *
 */

const charlatan = require('charlatan');
const ObjectId  = require('mongoose').Types.ObjectId;


let Category;
let Section;
let Topic;
let Post;
let UserTopicCount;
let UserPostCount;
let User;
let Vote;
let UserGroup;
let settings;
let parser;
let shared;


const CATEGORY_COUNT = 3;
const SECTION_COUNT  = 10;
const SUB_SECTION_DEEP = 1;
const TOPIC_COUNT_IN_BIG_SECTION  = 200;
const POST_COUNT_IN_BIG_TOPIC  = 100;
const USER_COUNT = 200;
const MAX_MODERATOR_COUNT = 3;
const MAX_SUB_SECTION_COUNT = 3;
const MAX_VOTES = 10;

let display_order = 0;

function getNextDisplayOrder() {
  display_order++;
  return display_order;
}

// generate a random number with lognormal distribution
function lognorm(mean, sd) {
  let norm = Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random());

  return Math.pow(Math.E, mean + sd * norm);
}

let users = [];
let postDay = 0;


async function createPost(topic, previous_posts) {
  // 50% posts won't have any reply information, 25% posts will be
  // answers to the previous post, 12.5% posts will be answers to the
  // 2nd last post and so on.
  //
  let reply_id = previous_posts.length - Math.floor(1 / Math.random()) + 1;
  let reply_to = previous_posts[reply_id];

  let md = charlatan.Lorem.paragraphs(charlatan.Helpers.rand(5, 1)).join('\n\n');
  let user = users[charlatan.Helpers.rand(USER_COUNT)];

  let options = await settings.getByCategory('forum_posts_markup', { usergroup_ids: user.usergroups }, { alias: true });

  let result = await parser.md2html({
    text: md,
    options
  });

  let ts;

  if (previous_posts.length) {
    // Generate random spacing between posts in a large topic,
    // it gives about 10% probability of 7 days interval, and 0.02% probability of 5 years interval
    //
    ts = new Date(+previous_posts[previous_posts.length - 1].ts + lognorm(17, 2.5));
  } else {
    ts = new Date(2010, 0, postDay++);
  }

  let post = new Post({
    _id: new ObjectId(Math.round(ts / 1000)),

    html:    result.html,
    md,

    st:      Post.statuses.VISIBLE,
    topic:   topic._id,
    section: topic.section,

    user,

    /*eslint-disable new-cap*/
    ip:      charlatan.Internet.IPv4(),

    /*eslint-disable no-undefined*/
    to:      reply_to ? reply_to._id  : undefined,
    to_user: reply_to ? reply_to.user : undefined,
    to_phid: reply_to ? reply_to.hid  : undefined,

    ts
  });

  // params_ref will be generated automatically by the hook,
  // specifying params in constructor doesn't work 'cause params is not in the model
  post.params = options;

  await post.save();

  return post;
}


async function addVotes(post) {
  let votes = 0;

  for (let i = charlatan.Helpers.rand(MAX_VOTES); i > 0; i--) {
    let user = users[charlatan.Helpers.rand(USER_COUNT)];
    let value = Math.random() > 0.5 ? 1 : -1;

    let vote = new Vote({
      to:     post.user,
      from:   user._id,
      for:  post._id,
      type:   shared.content_type.FORUM_POST,
      value
    });

    votes += value;

    await vote.save();
  }

  await post.updateOne({ votes });
}


async function createTopic(section, post_count) {
  let first_post;
  let last_post;

  let topic = new Topic({
    _id: new ObjectId(Math.round(new Date(2010, 0, postDay) / 1000)),

    title: charlatan.Lorem.sentence().slice(0, -1),

    st: Topic.statuses.OPEN,
    section: section._id,

    views_count: charlatan.Helpers.rand(1000)
  });

  // Save topic to the database before creating posts,
  // it's needed because of Post model hooks
  //
  await topic.save();

  let posts = [];

  for (let i = 0; i < post_count; i++) {
    var post = await createPost(topic, posts);

    if (!first_post) {
      first_post = post;
    }

    last_post = post;

    posts.push(post);

    await addVotes(post);
  }

  topic.cache.post_count    = post_count;

  topic.cache.first_post    = first_post._id;
  topic.cache.first_ts      = first_post.ts;
  topic.cache.first_user    = first_post.user;

  topic.cache.last_post     = last_post._id;
  topic.cache.last_post_hid = last_post.hid;
  topic.cache.last_ts       = last_post.ts;
  topic.cache.last_user     = last_post.user;

  Object.assign(topic.cache_hb, topic.cache);

  // Update cache for this topic
  //
  await topic.save();
}


async function createSection(category, sub_section_deep) {
  let section = new Section({
    title: charlatan.Lorem.sentence(charlatan.Helpers.rand(5, 3)).slice(0, -1),
    description: charlatan.Lorem.sentence(),

    parent: category._id,
    display_order: getNextDisplayOrder(),

    cache: {
      real: {}
    }
  });

  await section.save();

  // add sub-sections
  if (!sub_section_deep || charlatan.Helpers.rand(3) === 2) {
    return;
  }

  for (let i = charlatan.Helpers.rand(MAX_SUB_SECTION_COUNT); i > 0; i--) {
    await createSection(section, sub_section_deep - 1);
  }
}


async function createUsers() {
  let userGroupsByName = {};
  let groups = await UserGroup.find().select('_id short_name');

  // collect usergroups
  groups.forEach(function (group) {
    userGroupsByName[group.short_name] = group;
  });

  for (let i = 0; i < USER_COUNT; i++) {
    let user = new User({
      first_name: charlatan.Name.firstName(),
      last_name:  charlatan.Name.lastName(),
      nick:       charlatan.Internet.userName(),
      email:      charlatan.Internet.email(),
      joined_ts:  new Date(),
      joined_ip:  charlatan.Internet.IPv4(),
      usergroups: userGroupsByName.members,
      active:     true
    });

    await user.save();

    // add user to store
    users.push(user);
  }
}


async function createSections() {
  for (let i = 0; i < CATEGORY_COUNT; i++) {
    let category = new Category({
      title: charlatan.Lorem.sentence(charlatan.Helpers.rand(5, 3)).slice(0, -1),
      description: charlatan.Lorem.sentence(),

      display_order: getNextDisplayOrder('display_order'),
      is_category: true
    });

    await category.save();

    // create sections
    for (let j = 0; j < SECTION_COUNT; j++) {
      await createSection(category, SUB_SECTION_DEEP);
    }
  }
}


async function updateSectionStat(section) {
  let topicCount;
  let postCount;

  // Clear getSectionTree cache (used in both `updateCache` and `getChildren`
  // functions below).
  //
  Section.getChildren.clear();

  await Section.updateCache(section._id);

  let sections = await Section.getChildren(section._id, -1);

  let sum = await Topic.aggregate([
    {
      $match: {
        section: { $in: sections.concat([ section ]).map(s => s._id) }
      }
    },
    {
      $group: {
        _id: null,
        topic_count: { $sum: 1 },
        post_count: { $sum: '$cache.post_count' }
      }
    }
  ]).exec();

  if (sum && sum[0]) {
    postCount  = sum[0].post_count;
    topicCount = sum[0].topic_count;
  } else {
    // no topics found in section or any of its subsections
    postCount  = 0;
    topicCount = 0;
  }

  section.cache.post_count = postCount;
  section.cache.topic_count = topicCount;

  section.cache_hb.post_count = postCount;
  section.cache_hb.topic_count = topicCount;

  await section.save();
}


async function createTopics() {
  let sections = await Section.find({ is_category: false })
                              .select('_id cache')
                              .sort({ hid: -1 })
                              .skip(1);

  for (let i = 0; i < sections.length; i++) {
    let section = sections[i];

    // create topic with single post
    await createTopic(section, 1);
    await updateSectionStat(section);
  }
}


async function fillBigSection() {
  let section = await Section.findOne({ is_category: false })
                             .sort({ hid: 1 });

  for (let i = 0; i < TOPIC_COUNT_IN_BIG_SECTION; i++) {
    await createTopic(section, 1);
  }

  await updateSectionStat(section);
}


async function addBigTopic() {
  let section = await Section.findOne({ is_category: false })
                             .sort({ hid: 1 });

  await createTopic(section, POST_COUNT_IN_BIG_TOPIC);
  await updateSectionStat(section);
}


async function addModerators() {
  let SectionModeratorStore = settings.getStore('section_moderator');

  if (!SectionModeratorStore) {
    throw new Error('Settings store `section_moderator` is not registered.');
  }

  let sections = await Section.find({ is_category: false }).select('_id');

  for (let i = 0; i < sections.length; i++) {
    let section = sections[i];

    for (let j = charlatan.Helpers.rand(MAX_MODERATOR_COUNT); j > 0; j--) {
      let user = users[charlatan.Helpers.rand(USER_COUNT)];

      await SectionModeratorStore.set(
        { forum_mod_visible: { value: true } },
        { section_id: section._id, user_id: user._id }
      );
    }
  }
}


async function updateUserCounters() {
  await UserTopicCount.recount(users.map(user => [ user._id ]));
  await UserPostCount.recount(users.map(user => [ user._id ]));
}


module.exports = async function (N) {
  Category       = N.models.forum.Section;
  Section        = N.models.forum.Section;
  Topic          = N.models.forum.Topic;
  Post           = N.models.forum.Post;
  UserPostCount  = N.models.forum.UserPostCount;
  UserTopicCount = N.models.forum.UserTopicCount;
  User           = N.models.users.User;
  UserGroup      = N.models.users.UserGroup;
  Vote           = N.models.users.Vote;
  settings       = N.settings;
  parser         = N.parser;
  shared         = N.shared;

  await createUsers();
  await createSections();
  await createTopics();
  await fillBigSection();
  await addBigTopic();
  await addModerators();
  await updateUserCounters();
};
