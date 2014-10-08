// Show reply dialog

'use strict';

var _ = require('lodash');

module.exports = function (N, apiPath) {

  N.validate(apiPath, {});


  // Check user permission
  //
  N.wire.before(apiPath, function check_permissions(env) {
    if (env.user_info.is_guest) {
      return N.io.NOT_FOUND;
    }
  });


  // Fill post options
  //
  N.wire.before(apiPath, function fill_post_options(env) {

    // TODO: fetch
    env.res.post_options = { nomlinks: false, nosmiles: false };
  });


  // Fill parser options
  //
  N.wire.on(apiPath, function fill_parser_options(env) {
    var providers;

    // Get medialink providers list
    if (N.config.medialinks.content === true) {
      providers = N.config.medialinks.providers;
    } else {
      providers = _.filter(N.config.medialinks.providers, function (provider, providerName) {
        return N.config.medialinks.albums.indexOf(providerName) !== -1;
      });
    }

    // Prepare medialink providers stubs
    var stubProviders = {};
    _.forEach(providers, function (provider, providerName) {
      stubProviders[providerName] = {
        match: _.map(provider.match, function (match) {
          return match.toString();
        }),
        stub: provider.stub
      };
    });

    env.res.parse_rules = {
      cleanupRules: N.config.parser.cleanup,
      smiles: N.config.smiles,
      medialinks: {
        providers: _.map(N.config.medialinks.providers, function (provider) {
          return _.omit(provider, [ 'fetch', 'template' ]);
        }),
        content: N.config.medialinks.content
      }
    };
  });
};
