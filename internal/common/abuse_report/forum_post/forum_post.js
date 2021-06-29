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
// - subject_email
// - subject_log
// - template
//
'use strict';


const userInfo = require('nodeca.users/lib/user_info');


module.exports = function (N, apiPath) {

  // Subcall `internal:forum.abuse_report` for `FORUM_POST` content type
  //
  N.wire.on('internal:common.abuse_report', async function forum_post_abuse_report_subcall(params) {
    if (params.report.type === N.shared.content_type.FORUM_POST) {
      params.data = params.data || {};
      await N.wire.emit('internal:common.abuse_report.forum_post', params);
    }
  });


  // Fetch post, topic and section
  //
  N.wire.before(apiPath, async function fetch_post_topic_section(params) {
    params.data.post = await N.models.forum.Post.findOne({ _id: params.report.src }).lean(true);

    if (!params.data.post) throw N.io.NOT_FOUND;

    params.data.topic = await N.models.forum.Topic.findOne({ _id: params.data.post.topic }).lean(true);

    if (!params.data.topic) throw N.io.NOT_FOUND;

    params.data.section = await N.models.forum.Section.findOne({ _id: params.data.topic.section }).lean(true);

    if (!params.data.section) throw N.io.NOT_FOUND;
  });


  // Fetch recipients
  //
  N.wire.before(apiPath, async function fetch_recipients(params) {
    let section_moderator_store = N.settings.getStore('section_moderator');
    let recipients = await section_moderator_store.getModeratorsInfo(params.data.section);
    let recipients_ids = recipients.map(r => r._id);

    // If no moderators found - send message to all administrators
    if (!recipients_ids.length) {
      let admin_group_id = await N.models.users.UserGroup.findIdByName('administrators');

      recipients = await N.models.users.User.find()
                            .where('usergroups').equals(admin_group_id)
                            .select('_id')
                            .lean(true);
      recipients_ids = recipients.map(r => r._id);
    }

    params.recipients = await userInfo(N, recipients_ids);
  });


  // Prepare locals
  //
  N.wire.on(apiPath, async function prepare_locals(params) {
    let locals = params.locals || {};
    let author = params.report.from ? await userInfo(N, params.report.from) : null;

    const TEMPLATE_PATH = 'common.abuse_report.forum_post';

    params.subject_log   = `${TEMPLATE_PATH}.subject_log`;
    params.subject_email = `${TEMPLATE_PATH}.subject_email`;
    params.template      = TEMPLATE_PATH;

    locals.project_name = await N.settings.get('general_project_name');
    locals.report_text = params.report.text;

    if (params.report.data?.move_to) {
      let move_to_section = await N.models.forum.Section
                                      .findById(params.report.data.move_to)
                                      .lean(true);

      locals.move_from_link = N.router.linkTo('forum.section', {
        section_hid: params.data.section.hid
      });

      locals.move_to_link = N.router.linkTo('forum.section', {
        section_hid: move_to_section.hid
      });

      locals.move_from_title = params.data.section.title;
      locals.move_to_title = move_to_section.title;

      locals.src_title = params.data.topic.title;
      locals.src_url = N.router.linkTo('forum.topic', {
        section_hid: params.data.section.hid,
        topic_hid: params.data.topic.hid
      });
      locals.move_link = N.router.linkTo('forum.topic', {
        section_hid: params.data.section.hid,
        topic_hid: params.data.topic.hid,
        $anchor: `move_to_${move_to_section.hid}`
      });
    } else {
      locals.src_url = N.router.linkTo('forum.topic', {
        section_hid: params.data.section.hid,
        topic_hid: params.data.topic.hid,
        post_hid: params.data.post.hid
      });
      locals.src_text = params.data.post.md;

      // calculate minimum backtick length for ````quote, so it would encapsulate
      // original content (longest backtick sequence plus 1, but at least 3)
      let backtick_seq_len = Math.max.apply(
        null,
        ('`` ' + locals.report_text + ' ' + locals.src_text)
          .match(/`+/g) //`
          .map(s => s.length)
        ) + 1;

      locals.backticks = '`'.repeat(backtick_seq_len);
    }

    locals.auto_reported = params.report.auto_reported;

    if (author) {
      locals.author = author;
      locals.author_link = N.router.linkTo('users.member', { user_hid: author.user_hid });
    }

    params.locals = locals;
  });
};
