// Get post IP info
//
'use strict';


var dns   = require('dns');
var whois = require('whois');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    post_id: { format: 'mongo', required: true }
  });


  // Check permissions
  //
  N.wire.before(apiPath, function* check_permissions(env) {
    let can_see_ip = yield env.extras.settings.fetch('can_see_ip');

    if (!can_see_ip) {
      throw N.io.FORBIDDEN;
    }
  });


  // Fetch post IP
  //
  N.wire.on(apiPath, function fetch_post_ip(env, callback) {
    N.models.forum.Post
        .findOne({ _id: env.params.post_id })
        .select('ip')
        .lean(true)
        .exec(function (err, post) {
      if (err) {
        callback(err);
        return;
      }

      if (!post) {
        callback(N.io.NOT_FOUND);
        return;
      }

      if (!post.ip) {
        callback({
          code: N.io.CLIENT_ERROR,
          message: env.t('err_no_ip')
        });
        return;
      }

      env.res.ip = env.data.ip = post.ip;
      callback();
    });
  });


  // Fetch whois info
  //
  N.wire.after(apiPath, function fetch_whois(env, callback) {
    whois.lookup(env.data.ip, function (err, data) {
      if (err) {
        callback(err);
        return;
      }

      env.res.whois = data.replace(/\r?\n/g, '\n')
                          .replace(/^[#%].*/mg, '')     // comments
                          .replace(/^\s+/g, '')         // empty head
                          .replace(/\s+$/g, '')         // empty tail
                          .replace(/[ ]+$/mg, '')       // line tailing spaces
                          .replace(/\n{2,}/g, '\n\n');  // doble empty lines
      callback();
    });
  });


  // Reverse resolve hostname
  //
  N.wire.after(apiPath, function reverse_resolve(env, callback) {

    dns.reverse(env.data.ip, function (err, hosts) {
      if (err) {
        callback(); // this error is not fatal
        return;
      }

      if (hosts.length) {
        env.res.hostname = hosts[0];
      }

      callback();
    });
  });

};
