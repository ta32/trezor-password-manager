/*
 * Copyright (c) Peter Jensen, SatoshiLabs
 *
 * Licensed under Microsoft Reference Source License (Ms-RSL)
 * see LICENSE.md file for details
 */

'use strict';

// override chrome.runtime.id to bypass the trezor bridge api's gatekeeping
console.log(chrome.runtime.id);
var runtime = {...chrome.runtime, id: 'nkbihfbeogaeaoehlefnkodbefgpgknn'};
var tmp = {...chrome, runtime: runtime};
chrome = tmp;
console.log(chrome.runtime.id);

var React = require('react'),
  Router = require('react-router'),
  { Route } = Router,
  Promise = require('es6-promise').Promise,
  Layout = require('./global_components/layout'),
  Home = require('./home/home'),
  DashboardLayout = require('./dashboard/dashboard_layout'),
  routes = (
    <Route handler={Layout}>
      <Route name="home" path="/" handler={Home} />
      <Route name="dashboard" path="/dashboard" handler={DashboardLayout} />
    </Route>
  );

if (typeof window !== 'undefined') {
  window.React = React;
}

Router.run(routes, Handler => {
  React.render(
    <div>
      <Handler />
    </div>,
    document.body
  );
});
