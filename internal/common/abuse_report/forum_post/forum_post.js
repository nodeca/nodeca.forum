// Extend `internal:common.abuse_report` to send abuse report for type `FORUM_POST`
//
// In:
//
// - report - N.models.core.AbuseReport
//
// Out:
//
// - recipients - { user_id: user_info }
// - locals - rendering data
// - email_templates - { body, subject }
// - log_templates - { body, subject }
//
//
'use strict';


const _        = require('lodash');
const userInfo = require('nodeca.users/lib/user_info');


module.exports = function (N, apiPath) {

  // Subcall `internal:forum.abuse_report` for `FORUM_POST` content type
  //
  N.wire.on('internal:common.abuse_report', function* forum_post_abuse_report_subcall(params) {
    if (params.report.type === 'FORUM_POST') {
      params.data = params.data || {};
      yield N.wire.emit('internal:common.abuse_report.forum_post', params);
    }
  });


  // Fetch post, topic and section
  //
  N.wire.before(apiPath, function* fetch_post_topic_section(params) {
    params.data.post = yield N.models.forum.Post.findOne({ _id: params.report.src_id }).lean(true);

    if (!params.data.post) throw N.io.NOT_FOUND;

    params.data.topic = yield N.models.forum.Topic.findOne({ _id: params.data.post.topic }).lean(true);

    if (!params.data.topic) throw N.io.NOT_FOUND;

    params.data.section = yield N.models.forum.Section.findOne({ _id: params.data.topic.section }).lean(true);

    if (!params.data.section) throw N.io.NOT_FOUND;
  });


  // Fetch recipients
  //
  N.wire.before(apiPath, function* fetch_recipients(params) {
    let section_moderator_store = N.settings.getStore('section_moderator');
    let recipients = yield section_moderator_store.getModeratorsInfo(params.data.section);
    let recipients_ids = _.map(recipients, '_id');

    // If no moderators found - send message to all administrators
    if (!recipients_ids.length) {
      let admin_group = yield N.models.users.UserGroup.findOne({ short_name: 'administrators' });

      recipients = yield N.models.users.User.find()
                            .where('usergroups').equals(admin_group._id)
                            .select('_id')
                            .lean(true);
      recipients_ids = _.map(recipients, '_id');
    }

    params.recipients = yield userInfo(N, recipients_ids);
  });


  // Prepare locals
  //
  N.wire.on(apiPath, function* prepare_locals(params) {
    let locals = params.locals || {};
    let author = params.report.from ? yield userInfo(N, params.report.from) : null;

    params.log_templates = {
      body: 'common.abuse_report.forum_post.log_templates.body',
      subject: 'common.abuse_report.forum_post.log_templates.subject'
    };

    params.email_templates = {
      body: 'common.abuse_report.forum_post.email_templates.body',
      subject: 'common.abuse_report.forum_post.email_templates.subject'
    };

    locals.project_name = yield N.settings.get('general_project_name');
    locals.report_text = params.report.text;
    locals.src_url = N.router.linkTo('forum.topic', {
      section_hid: params.data.section.hid,
      topic_hid: params.data.topic.hid,
      post_hid: params.data.post.hid
    });
    locals.src_text = params.data.post.md;
    locals.src_html = params.data.post.html;
    locals.recipients = _.values(params.recipients);

    if (author) locals.author = author;

    params.locals = locals;
  });
};
