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


const _        = require('lodash');
const render   = require('nodeca.core/lib/system/render/common');
const userInfo = require('nodeca.users/lib/user_info');


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

    let topic = new N.models.forum.Topic({ title: subject });
    let post = new N.models.forum.Post({ md: body, section: section_id });
    post.params = options;

    await post.createWithTopic(topic, await userInfo(N, bot._id));

    // Add report url to locals
    params.locals.report_topic_url = N.router.linkTo('forum.topic', { section_hid: section.hid, topic_hid: topic.hid });
  });
};
