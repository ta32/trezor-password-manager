/*
 * Copyright (c) Peter Jensen, SatoshiLabs
 *
 * Licensed under Microsoft Reference Source License (Ms-RSL)
 * see LICENSE.md file for details
 */

'use strict';
var crypto = require('crypto'),
    state = crypto.randomBytes(40).toString('hex');
const fullReceiverPath = 'moz-extension://' + browser.runtime.id + '/html/chrome_oauth_receiver.html',
    APIKEY = 's340kh3l0vla1nv',
    STORAGE = 'tpmDropboxToken',
    logoutUrl = 'https://www.dropbox.com/logout',
    ADDRS_PATH = '/',
    Dropbox = require('dropbox');

let dbRetryFileLoad = 3;

class DropboxMgmt {
  constructor(bgStore) {
    this.bgStore = bgStore;
    this.dbc = new Dropbox({ clientId: APIKEY });
    this.authToken = this.loadMetadataToken();
    this.authUrl = this.dbc.getAuthenticationUrl(fullReceiverPath);
  }

  isAuth() {
    return this.authToken !== '';
  }

  disconnect() {
    if (this.isAuth()) {
      this.authToken = '';
      window.open(logoutUrl, '_blank');
    } else {
      this.bgStore.emit('sendMessage', 'disconnected');
    }
  }

    connect() {
        if (!this.isAuth()) {
            state = crypto.randomBytes(40).toString('hex');
            this.authUrl = this.dbc.getAuthenticationUrl(fullReceiverPath, state);
            window.open(this.authUrl);
        } else {
            this.dbc.setAccessToken(this.authToken);
            this.getDropboxUsername();
        }
    }

    loadMetadataToken() {
        return window.localStorage[STORAGE] ? window.localStorage[STORAGE] : '';
    }

    saveToken(val) {
        let retState = this.parseQuery(val).state;
        if (retState === state) {
            this.authToken = this.parseQuery(val).access_token;
            window.localStorage[STORAGE] = this.authToken;
            this.connect();
        }
    }

  getDropboxUsername() {
    this.dbc.usersGetCurrentAccount()
      .then((response) => {
        this.bgStore.setUsername(response.name.display_name, 'DROPBOX');
      })
      .catch((error) => {
        console.error(error);
        if (error.status === 401) {
          this.authToken = '';
          this.connect();
        }
      });
  }

  loadFile() {
    if (!this.bgStore.fileName) {
      try {
        this.bgStore.setFileName();
      } catch (ex) {
        console.log('Crypto failed: ', ex);
        //TODO soon please
      }
    }

    this.dbc
      .filesGetMetadata({ path: ADDRS_PATH + this.bgStore.fileName })
      .then(() => {
        this.dbc
          .filesDownload({ path: ADDRS_PATH + this.bgStore.fileName })
          .then(res => {
            let myReader = new FileReader();
            myReader.addEventListener('loadend', e => {
              this.bgStore.setData(e.srcElement.result);
            });
            myReader.readAsArrayBuffer(res.fileBlob);
          })
          .catch(error => {
            console.error('err ', error);
          });
      })
      .catch(error => {
        console.error('err ', error);
        if (error.status === 400) {
          this.connect();
        }
        if (error.status === 401) {
          return this.handleUnauthorized();
        }
        // we try to check if file is accessible
        if (dbRetryFileLoad) {
          setTimeout(() => {
            dbRetryFileLoad--;
            this.loadFile();
          }, 3500);
        } else {
          dbRetryFileLoad = 3;
          this.bgStore.emit('initStorageFile');
        }
      });
  }

  saveFile(data) {
    var blob = new Blob([data.buffer], { type: 'text/plain;charset=UTF-8' });
    this.dbc
      .filesUpload({ path: ADDRS_PATH + this.bgStore.fileName, contents: blob, mode: 'overwrite' })
      .then((res) => {
        let myReader = new FileReader();
        myReader.addEventListener('loadend', e => {
          this.bgStore.setData(e.srcElement.result);
          browser.runtime.sendMessage({ type: 'fileSaved' });
        });
        myReader.readAsArrayBuffer(blob);
      })
      .catch(error => {
        console.error(error);
        if (error.status === 401) {
          return this.handleUnauthorized();
        }
        this.authToken =
          this.bgStore.emit('sendMessage', 'errorMsg', {
            code: 'NETWORK_ERROR',
            msg: error.status,
            storage: 'Dropbox'
          });
      });
  }

  createNewDataFile(data) {
    this.saveFile(data);
  }

  parseQuery(qstr) {
    var query = Object.create(null);
    if (typeof qstr !== 'string') {
      return query;
    }
    qstr = qstr.trim().replace(/^(\?|#|&)/, '');
    let a = (qstr[0] === '?' ? qstr.substr(1) : qstr).split('&');
    for (let i = 0; i < a.length; i++) {
      let b = a[i].split('=');
      query[decodeURIComponent(b[0])] = decodeURIComponent(b[1] || '');
    }
    return query;
  }

  handleUnauthorized() {
    delete window.localStorage[STORAGE];
    this.authToken = '';
    this.bgStore.disconnect();
    this.bgStore.emit('sendMessage', 'disconnected');
    this.bgStore.emit('sendMessage', 'errorMsg', {
      code: 'UNAUTHORIZED',
      storage: 'Dropbox'
    });
  }
}

module.exports = DropboxMgmt;
