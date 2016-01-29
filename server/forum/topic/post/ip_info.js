// Get post IP info
//
'use strict';


var dns   = require('mz/dns');
var whois = require('thenify')(require('whois').lookup);


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    post_id: { format: 'mongo', required: true }
  });


  // Check permissions
  //
  N.wire.before(apiPath, function* check_permissions(env) {
    let can_see_ip = yield env.extras.settings.fetch('can_see_ip');

    if (!can_see_ip) throw N.io.FORBIDDEN;
  });


  // Fetch post IP
  //
  N.wire.on(apiPath, function* fetch_post_ip(env) {
    let post = yield N.models.forum.Post
                        .findOne({ _id: env.params.post_id })
                        .select('ip')
                        .lean(true);

    if (!post) throw N.io.NOT_FOUND;

    if (!post.ip) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_no_ip')
      };
    }

    env.res.ip = env.data.ip = post.ip;
  });


  // Fetch whois info
  //
  N.wire.after(apiPath, function* fetch_whois(env) {
    let data = yield whois(env.data.ip);

    env.res.whois = data.replace(/\r?\n/g, '\n')
                        .replace(/^[#%].*/mg, '')     // comments
                        .replace(/^\s+/g, '')         // empty head
                        .replace(/\s+$/g, '')         // empty tail
                        .replace(/[ ]+$/mg, '')       // line tailing spaces
                        .replace(/\n{2,}/g, '\n\n');  // doble empty lines
  });


  // Reverse resolve hostname
  //
  N.wire.after(apiPath, function* reverse_resolve(env) {

    try {
      // this error is not fatal
      let hosts = yield dns.reverse(env.data.ip);

      if (hosts.length) {
        env.res.hostname = hosts[0];
      }
    } catch (__) {}
  });

};
