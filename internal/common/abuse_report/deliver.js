// Log abuse report to special forum section
//
// Params:
//
// - report - N.models.core.AbuseReport
// - recipients - { user_id: user_info }
// - locals - rendering data
// - log_templates - { body, subject } - i18n path
//
//
'use strict';


const _       = require('lodash');
const Promise = require('bluebird');
const render  = require('nodeca.core/lib/system/render/common');


module.exports = function (N, apiPath) {

  // Create new topic or add to existing one
  //
  N.wire.before(apiPath, async function log_abuse_report(params) {
    let section_id = await N.settings.get('general_abuse_report_section');

    // If section id not specified - skip
    if (!section_id) return;

    if (!params.log_templates) {
      let type_name = _.invert(_.get(N, 'shared.content_type', {}))[params.report.type];

      N.logger.warn(`Abuse report (${type_name}): log templates not specified`);
      return;
    }

    // Use default locale
    let helpers = {};

    helpers.t = (phrase, params) => N.i18n.t(N.config.locales[0], phrase, params);
    helpers.t.exists = phrase => N.i18n.hasPhrase(N.config.locales[0], phrase);
    helpers.link_to = (name, params) => N.router.linkTo(name, params) || '#';

    let subject = render(N, params.log_templates.subject, params.locals, helpers);
    let body = render(N, params.log_templates.body, params.locals, helpers);

    let section = await N.models.forum.Section.findOne()
                            .where('_id').equals(section_id)
                            .lean(true);

    let options = await N.models.core.MessageParams.getParams(params.report.params_ref);

    // Fetch user to send messages from
    //
    let bot = await N.models.users.User.findOne()
                        .where('hid').equals(N.config.bots.default_bot_hid)
                        .lean(true);

    // Create new post
    let post = new N.models.forum.Post();

    post.html   = (await N.parser.md2html({ text: body, attachments: [], options })).html;
    post.md     = body;
    post.st     = N.models.forum.Post.statuses.VISIBLE;
    post.user   = bot._id;
    post.params = options;

    let report_ref = await N.models.forum.AbuseReportRef.findOne()
                              .where('src').equals(params.report.src)
                              .lean(true);
    let topic;

    // If ref exists - try fetch topic
    if (report_ref) {
      topic = await N.models.forum.Topic.findOne()
                        .where('_id').equals(report_ref.dest)
                        .lean(true);

      // If topic not exists - delete invalid ref
      if (!topic) {
        await N.models.forum.AbuseReportRef.deleteOne({ _id: report_ref._id });
      }
    }

    // If topic does not created yet - create topic and ref
    if (!topic) {
      topic = new N.models.forum.Topic({
        st: N.models.forum.Topic.statuses.OPEN,
        section: section_id,
        title: subject,
        cache: { first_post: post._id, first_ts: post.ts, first_user: post.user },
        cache_hb: { first_post: post._id, first_ts: post.ts, first_user: post.user }
      });

      report_ref = new N.models.forum.AbuseReportRef({
        src: params.report.src,
        dest: topic._id
      });

      await Promise.all([
        topic.save(),
        report_ref.save()
      ]);
    }

    post.topic   = topic._id;
    post.section = topic.section;

    // We should save post before `updateCache` call because cache use topic data
    await post.save();

    await Promise.all([
      N.models.forum.Topic.updateCache(topic._id),
      N.models.forum.Section.updateCache(section._id)
    ]);

    await N.queue.forum_topics_search_update_with_posts([ topic._id ]).postpone();

    // Add report url to locals
    params.locals.report_topic_url = N.router.linkTo('forum.topic', { section_hid: section.hid, topic_hid: topic.hid });
  });
};
