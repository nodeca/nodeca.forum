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


const render = require('nodeca.core/lib/system/render/common');


module.exports = function (N) {

  // Create new topic or add to existing one
  //
  N.wire.before('internal:common.abuse_report.deliver', function* log_abuse_report(params) {
    let section_id = yield N.settings.get('general_abuse_report_section');

    // If section id not specified - skip
    if (!section_id) return;

    if (!params.log_templates) {
      N.logger.warn(`Abuse report (${params.report.type}): log templates not specified`);
      return;
    }

    // Use default locale
    let helpers = {};

    helpers.t = (phrase, params) => N.i18n.t(N.config.locales[0], phrase, params);
    helpers.t.exists = phrase => N.i18n.hasPhrase(N.config.locales[0], phrase);
    helpers.link_to = (name, params) => N.router.linkTo(name, params) || '#';

    let subject = render(N, params.log_templates.subject, params.locals, helpers);
    let body = render(N, params.log_templates.body, params.locals, helpers);

    let section = yield N.models.forum.Section.findOne()
                            .where('_id').equals(section_id)
                            .lean(true);

    // Create new post
    let post = new N.models.forum.Post({
      html: (yield N.parse({ text: body, attachments: [], options: {} })).html,
      md: body,
      st: N.models.forum.Post.statuses.VISIBLE,
      user: params.report.from
    });

    let report_ref = yield N.models.forum.AbuseReportRef.findOne()
                              .where('src_id').equals(params.report.src_id)
                              .lean(true);
    let topic;

    // If ref exists - try fetch topic
    if (report_ref) {
      topic = yield N.models.forum.Topic.findOne()
                        .where('_id').equals(report_ref.dest_id)
                        .lean(true);

      // If topic not exists - delete invalid ref
      if (!topic) {
        yield N.models.forum.AbuseReportRef.remove({ _id: report_ref._id });
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
        src_id: params.report.src_id,
        dest_id: topic._id
      });

      yield [
        topic.save(),
        report_ref.save()
      ];
    }

    post.topic = topic._id;

    // We should save post before `updateCache` call because cache use topic data
    yield post.save();

    yield [
      N.models.forum.Topic.updateCache(topic._id),
      N.models.forum.Section.updateCache(section._id)
    ];

    // Add report url to locals
    params.locals.report_topic_url = N.router.linkTo('forum.topic', { section_hid: section.hid, topic_hid: topic.hid });
  });
};
