/*
 * Copyright (c) Peter Jensen, SatoshiLabs
 *
 * Licensed under Microsoft Reference Source License (Ms-RSL)
 * see LICENSE.md file for details
 */

'use strict';

var Promise = require('es6-promise').Promise;
class ChromeMgmt {
  constructor(bgStore) {
    this.bgStore = bgStore;
    this.bgStore.on('decryptedPassword', data => this.fillLoginForm(data));
    this.bgStore.on('checkReopen', () => this._checkReopen());
    this.activeUrl = '';
    this.activeDomain = '';
    this.hasCredentials = false;
    this.accessTabId = 0;
    browser.tabs.onActivated.addListener(() => this._detectActiveUrl());
    browser.tabs.onUpdated.addListener(() => this._detectActiveUrl());
    browser.commands.onCommand.addListener(c => this._chromeCommands(c));
    browser.browserAction.onClicked.addListener(() => this.openAppTabOnce(this.bgStore.appUrl).then(() => console.log(' OnClick App tab opened')));
  }

  exists() {
    if (typeof browser === 'undefined') {
      return Promise.reject(new Error('Global browser does not exist; probably not running browser'));
    }
    if (typeof browser.runtime === 'undefined') {
      return Promise.reject(
        new Error('Global browser.runtime does not exist; probably not running browser')
      );
    }
    if (typeof browser.runtime.sendMessage === 'undefined') {
      return Promise.reject(
        new Error(
          'Global browser.runtime.sendMessage does not exist; probably not whitelisted website in extension manifest'
        )
      );
    }
    return Promise.resolve();
  }

  _checkReopen() {
    if (localStorage.getItem('tpmRestart') === 'reopen') {
      localStorage.setItem('tpmRestart', 'nope');
      this.openAppTab();
    }
  }

  openAppTab(appUrl) {
    return new Promise((resolve, reject) => {
      browser.runtime.sendMessage({ type: 'isAppOpen', content: '' }, response => {
        if (!response) {
          console.log('App not open, opening new tab');
          browser.tabs.create({ url: appUrl, active: true }, tab => {
            this.focusTab(tab.id).then(() => {
              console.log('App tab focused (id: ' + tab.id + ')');
              resolve(tab.id);
            });
          });
        } else {
          console.log('App already open, focusing tab');
          this.focusTab(response.tab.id).then(() => {
            resolve(response.tab.id);
          });
        }
      });
    });
  }

  openAppTabOnce(appUrl) {
    return this.getAppTabId().then(response => {
      if(response.open) {
        console.log('App already open, focusing tab');
        this.focusTab(response.id).then(() => {
          return response.id;
        });
      } else {
        console.log('App not open, opening new tab');
        return this.openAppTab(appUrl);
      }
    });
  }

  getAppTabId() {
    console.log('getAppTabId if open');
    return browser.runtime.sendMessage({ type: 'isAppOpen', content: '' }).then(response => {
      console.log('isAppOpen response', response);
      if(!response) {
        console.log('App not open');
        return {open: false, id: 0}
      }
      return {open: true, id: response.tab.id};
    }, error => {
      console.log('isAppOpen request error', error);
      return {open: false, id: 0}
    })
  }

  openAppTab(appUrl) {
    return browser.tabs.create({ url: appUrl, active: true }).then(tab => {
      console.log('App tab created (id: ' + tab.id + ')');
      return tab.id;
    })
  }


  focusTab(tabId) {
    return new Promise((resolve, reject) => {
      browser.tabs.update(tabId, { highlighted: true }, tab => {
        console.log('about to send message to tab', tabId);
        this.sendTabMessage(tabId, 'focus');
        resolve(tab);
      });
    });
  }

  _detectActiveUrl() {
    if (this.bgStore.phase === 'LOADED' && this.bgStore.decryptedContent) {
      browser.tabs.query({ active: true, lastFocusedWindow: true }, tabs => {
        if (typeof tabs[0] !== 'undefined') {
          if (this.bgStore.isUrl(tabs[0].url)) {
            this.activeUrl = tabs[0].url;
            let newActiveDomain = this.bgStore.decomposeUrl(this.activeUrl).domain;
            if (this.activeDomain !== newActiveDomain) {
              this.activeDomain = newActiveDomain;
              if (this._matchingContent(this.activeDomain)) {
                this.updateBadgeStatus(this.bgStore.phase);
                this.hasCredentials = true;
              } else {
                this.updateBadgeStatus('ERROR');
                this.hasCredentials = false;
              }
              this._createContextMenuItem(this.hasCredentials);
            }
          } else {
            this.activeUrl = '';
            this.activeDomain = '';
            this.clearContextMenuItem();
            this.updateBadgeStatus('ERROR');
            this.hasCredentials = false;
          }
        }
      });
    } else {
      this.hasCredentials = false;
    }
  }

  _fillOrSave() {
    if (this.activeDomain !== '') {
      if (this.hasCredentials) {
        this._fillCredentials(this.activeDomain);
      } else {
        this._saveEntry();
      }
    }
  }

  _chromeCommands(command) {
    switch (command) {
      case 'fill_login_form':
        this._fillOrSave();
        break;

      case 'restart_app':
        browser.runtime.reload();
        break;
    }
  }

  _fillCredentials(host) {
    let entry = false;
    if (this.bgStore.decryptedContent) {
      entry = this._matchingContent(host);
      browser.tabs.query({ active: true, lastFocusedWindow: true }, tabs => {
        if (typeof tabs[0] !== 'undefined') {
          if (this.bgStore.isUrl(tabs[0].url)) {
            if (this.bgStore.decomposeUrl(tabs[0].url).domain === this.activeDomain) {
              this.accessTabId = tabs[0].id;
              this._injectContentScript(tabs[0].id, 'showTrezorMsg', null);
              this.bgStore.emit('decryptPassword', entry);
            }
          }
        }
      });
    }
  }

  _saveEntry() {
    console.log('Saving entry');
    var domain = this.activeUrl;
    this.openAppTab().then(tabId => {
      setTimeout(() => {
        browser.runtime.sendMessage({ type: 'saveEntry', content: domain }, response => {
          if (!response) {
            setTimeout(() => {
              browser.runtime.sendMessage({ type: 'saveEntry', content: domain });
            }, 800);
          }
        });
      }, 300);
    });
  }

  updateBadgeStatus(status) {
    let badgeState = {
      LOADED: { color: [76, 175, 80, 255], defaultText: '\u0020' },
      STORAGE: { color: [237, 199, 85, 100], defaultText: '\u0020' },
      TREZOR: { color: [237, 199, 85, 100], defaultText: '\u0020' },
      ERROR: { color: [255, 173, 51, 255], defaultText: '\u0020' },
      OFF: { color: [255, 255, 0, 100], defaultText: '' }
    };
    browser.browserAction.setBadgeText({ text: badgeState[status].defaultText });
    browser.browserAction.setBadgeBackgroundColor({ color: badgeState[status].color });
  }

  _matchingContent(host) {
    let entry = false;
    if (this.bgStore.decryptedContent && typeof host !== 'undefined') {
      host = host.split('.').reverse();

      Object.keys(this.bgStore.decryptedContent.entries).map(key => {
        let obj = this.bgStore.decryptedContent.entries[key];
        let urlRegex = /^((http[s]?):\/)?\/?([^:\/\s]+)((\/\w+)*\/)?([\w\-\.]*[^#?\s]+)?(.*)?(#[\w\-]+)?$/;
        let title = obj.title.match(urlRegex);
        let titleUrl = title[3].split('.').reverse();
        let matches = [];

        titleUrl.forEach(function(item, k) {
          matches.push(item === host[k]);
        });

        if (matches.every(function(v) { return v === true })) {
          entry = obj;
        }
      });
    }
    return entry;
  }

  _setProtocolPrefix(url) {
    return url.indexOf('://') > -1 ? url : 'https://' + url;
  }

  _injectContentScript(id, type, data) {
    var tabId = id;
    browser.tabs.sendMessage(tabId, { type: 'isScriptExecuted' }, response => {
      if (browser.runtime.lastError) {
        browser.tabs.insertCSS(
          tabId,
          { file: 'css/content_style.css', runAt: 'document_start' },
          () => {
            browser.tabs.executeScript(
              tabId,
              { file: 'js/content_script.js', runAt: 'document_start' },
              () => {
                browser.tabs.sendMessage(tabId, { type: 'isScriptExecuted' }, response => {
                  if (response.type === 'scriptReady') {
                    this.sendTabMessage(tabId, type, data);
                  } else {
                    browser.tabs.executeScript(tabId, { file: 'js/content_script.js' }, () => {
                      if (browser.runtime.lastError) {
                        console.error(browser.runtime.lastError);
                        throw Error('Unable to inject script into tab ' + tabId);
                      }
                      this.sendTabMessage(tabId, type, data);
                    });
                  }
                });
              }
            );
          }
        );
      } else {
        if (response.type === 'scriptReady') {
          this.sendTabMessage(tabId, type, data);
        }
      }
    });
  }

  fillLoginForm(data) {
    if (typeof data === 'undefined' || data.content.success === false) {
      this.sendTabMessage(this.accessTabId, 'cancelData');
    } else {
      this._injectContentScript(parseInt(this.accessTabId), 'fillData', {
        username: data.content.username,
        password: data.content.password
      });
      this.accessTabId = 0;
    }
  }

  openTabAndLogin(data) {
    browser.tabs.create({ url: this._setProtocolPrefix(data.title) }, tab => {
      let sendObj = { username: data.username, password: data.password };
      this._injectContentScript(tab.id, 'fillData', sendObj);
    });
  }

  tryRefocusToAccessTab() {
    if (this.accessTabId !== 0) {
      this.focusTab(parseInt(this.accessTabId));
    }
  }

  sendMessage(msgType, msgContent) {
    browser.runtime.sendMessage({ type: msgType, content: msgContent }).then( response => {
      console.log('sendMessage response', response);
    }, error => {
      console.log('sendMessage error', error);
    });
  }

  sendTabMessage(tabId, type, data) {
    console.log('sendTabMessage', tabId, type, data);
    browser.tabs.sendMessage(tabId, { type: type, content: data });
  }

  clearContextMenuItem() {
    browser.contextMenus.removeAll();
  }

  _createContextMenuItem(hasItem) {
    browser.contextMenus.removeAll(() => {
      browser.contextMenus.create({
        id: this.activeDomain,
        contexts: ['page', 'selection', 'image', 'link'],
        title: hasItem ? 'Login to ' + this.activeDomain : 'Save ' + this.activeDomain,
        onclick: () => {
          this._fillOrSave();
        }
      });
    });
  }
}

module.exports = ChromeMgmt;
