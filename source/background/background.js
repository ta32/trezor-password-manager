/*
 * Copyright (c) Peter Jensen, SatoshiLabs
 *
 * Licensed under Microsoft Reference Source License (Ms-RSL)
 * see LICENSE.md file for details
 */

'use strict';

require('babel-polyfill');
require('trezor-connect');

window.tpmErroLog = [];
window.AppRootFolder = 'Apps';
window.AppFolder = 'TREZOR Password Manager';

// Useful for sendMessage debugging (chrome.runtime.lastError)
const sm = chrome.runtime.sendMessage;
chrome.runtime.sendMessage = (a, b) => {
  console.log("runtime.sendMessage:", a, b);
  sm(a, b);
}

// Storage will be used for background internal messaging (extends EventEmitter) ...
var Promise = require('es6-promise').Promise,
  setupReady = false,
  retriesOpening = 3,
  BgDataStore = require('./classes/bg_data_store'),
  bgStore = new BgDataStore(),
  // Chrome manager will maintain most of injection and other (tab <-> background <-> app) context manipulation
  ChromeMgmt = require('./classes/chrome_mgmt'),
  chromeManager = new ChromeMgmt(bgStore),
  TrezorMgmt = require('./classes/trezor_mgmt'),
  trezorManager = {},
  DropboxMgmt = require('./classes/dropbox_mgmt'),
  TrezorConnect = require('trezor-connect').default,
  dropboxManager = {},
  DriveMgmt = require('./classes/drive_mgmt'),
  driveManager = {},
  // GENERAL STUFF
  preSetup = () => {
    chromeManager.exists().then(() => {
      try {
        bgStore.on('decryptContent', contentDecrypted);
        bgStore.on('initStorageFile', askToInitStorage);
        bgStore.on('disconnect', init);
        bgStore.on('showPinDialog', showPinDialog);
        bgStore.on('retrySetup', setupRetry);
        bgStore.on('loadFile', loadFile);
        bgStore.on('disconnectedTrezor', userSwitch);
        trezorManager = new TrezorMgmt(bgStore, TrezorConnect);
        dropboxManager = new DropboxMgmt(bgStore);
        driveManager = new DriveMgmt(bgStore);
        bgStore.on('clearSession', () => trezorManager.clearSession());
        bgStore.on('decryptPassword', entry => decryptAndInject(entry));
        bgStore.on('sendMessage', (type, content) => chromeManager.sendMessage(type, content));
        chromeManager.updateBadgeStatus('OFF');
        setupReady = true;
        init();
      } catch (err) {
        console.warn(err);
      }
    });
  },
  init = () => {
    if (!setupReady) {
      preSetup();
    } else {
      trezorManager.checkReconnect();
      switch (bgStore.phase) {
        case 'LOADED':
          chromeManager.sendMessage('decryptedContent', {
            data: JSON.stringify(bgStore.decryptedContent),
            username: bgStore.username,
            storageType: bgStore.storageType
          });
          break;
        case 'STORAGE':
          if (!!bgStore.storageType && !!bgStore.username) {
            chromeManager.sendMessage('setUsername', {
              username: bgStore.username,
              storageType: bgStore.storageType
            });
          } else {
            chromeManager.sendMessage('initialized');
          }
          break;
        case 'TREZOR':
          if (bgStore.masterKey === '') {
            bgStore.phase = 'STORAGE';
            init();
          } else {
            bgStore.phase = 'LOADED';
          }
          break;
      }
    }
  },
  isOnline = () => {
    return navigator.onLine;
  },
  setupRetry = () => {
    setupReady = false;
    if (retriesOpening-- === 0) {
      setupReady = true;
      init();
    } else {
      setTimeout(() => {
        init();
      }, 1500);
    }
  },
  askToInitStorage = () => {
    chromeManager.sendMessage('initMsg');
  },
  initNewFile = () => {
    let basicObjectBlob = {
      version: '0.0.1',
      extVersion: '0.6.0',
      config: {
        orderType: 'date'
      },
      tags: {
        '0': {
          title: 'All',
          icon: 'home'
        },
        '1': {
          title: 'Social',
          icon: 'person-stalker'
        },
        '2': {
          title: 'Bitcoin',
          icon: 'social-bitcoin'
        }
      },
      entries: {}
    };
    trezorManager.encrypt(basicObjectBlob, bgStore.encryptionKey).then(res => {
      if (bgStore.storageType === 'DROPBOX') {
        dropboxManager.createNewDataFile(res);
      } else {
        driveManager.createNewDataFile(res);
      }
    });
  },
  userSwitch = () => {
    bgStore.userSwitch();
    // trezorManager.userSwitch();
    chromeManager.updateBadgeStatus('OFF');
    chromeManager.clearContextMenuItem();
    chromeManager.sendMessage('trezorDisconnected');
    init();
  },
  userLoggedOut = () => {
    bgStore.disconnect();
    // trezorManager.userSwitch();
    chromeManager.updateBadgeStatus('OFF');
    chromeManager.clearContextMenuItem();
    chromeManager.sendMessage('trezorDisconnected');
    init();
  },
  contentDecrypted = () => {
    let tempDecryptedData = trezorManager.decrypt(bgStore.loadedData, bgStore.encryptionKey);
    chromeManager.sendMessage('decryptedContent', {
      data: tempDecryptedData,
      username: bgStore.username,
      storageType: bgStore.storageType
    });
    bgStore.decryptedContent =
      typeof tempDecryptedData === 'object' ? tempDecryptedData : JSON.parse(tempDecryptedData);
    bgStore.phase = 'LOADED';
  },
  decryptAndInject = entry => {
    trezorManager.decryptFullEntry(entry, data => chromeManager.fillLoginForm(data), false);
  },
  saveContent = data => {
    if (bgStore.storageType === 'DROPBOX') {
      dropboxManager.saveFile(data);
    } else {
      driveManager.updateFile(data);
    }
  },
  loadFile = () => {
    if (bgStore.storageType === 'DROPBOX') {
      dropboxManager.loadFile();
    } else {
      driveManager.loadFile();
    }
  },
  showPinDialog = () => {
    chrome.runtime.sendMessage({ type: 'showPinDialog', content: '' }, response => {
      if (!!response) {
        if (response.type === 'pinVisible') {
          chromeManager.focusTab(response.tab.id);
        }
      } else {
        chromeManager.openAppTab().then(() => {
          setTimeout(() => {
            showPinDialog();
          }, 1300);
        });
      }
    });
  },
  windowClose = () => {
    chrome.windows.getAll(wins => {
      if (wins.length === 0) {
        bgStore.disconnect();
        chromeManager.updateBadgeStatus('OFF');
        chromeManager.clearContextMenuItem();
      }
    });
  },
  disconnect = () => {
    if (bgStore.storageType === 'DROPBOX') {
      dropboxManager.disconnect();
    } else {
      driveManager.disconnect();
    }
    userLoggedOut();
  },
  chromeMessaging = (request, sender, sendResponse) => {
    switch (request.type) {
      case 'initPlease':
        init();
        break;
      case 'initNewFile':
        initNewFile();
        break;

      case 'retryInitFile':
        loadFile();
        break;

      case 'connectDropbox':
        if (isOnline()) {
          dropboxManager.connect();
        } else {
          chromeManager.sendMessage('errorMsg', { code: 'T_NO_TRANSPORT' });
        }
        break;

      case 'dropboxConnectToken':
        dropboxManager.saveToken(request.content);
        break;

      case 'connectDrive':
        if (isOnline()) {
          driveManager.connect();
        } else {
          chromeManager.sendMessage('errorMsg', { code: 'T_NO_TRANSPORT' });
        }
        break;

      case 'errorMsg':
        chromeManager.sendMessage('errorMsg', request.content);
        break;

      case 'initTrezorPhase':
        bgStore.phase = 'TREZOR';
        trezorManager.init();
        break;

      case 'trezorPin':
        trezorManager.pinEnter(request.content);
        chromeManager.tryRefocusToAccessTab();
        chromeManager.sendMessage('hidePinModal');
        break;

      case 'trezorPinCancel':
        trezorManager.cancelPinDialog();
        break;

      case 'activateTrezor':
        trezorManager.useDevice(request.content);
        break;

      case 'disconnect':
        disconnect();
        break;

      case 'saveContent':
        chrome.runtime.sendMessage({ type: 'fileSaving' });
        trezorManager.encrypt(request.content, bgStore.encryptionKey).then(res => {
          saveContent(res);
        });
        break;

      case 'encryptFullEntry':
        chrome.runtime.sendMessage({ type: 'fileSaving', key_value: request.content.key_value || true });
        trezorManager.encryptFullEntry(request.content, sendResponse);
        break;

      case 'decryptPassword':
        trezorManager.decryptFullEntry(request.content, sendResponse, request.clipboardClear);
        break;

      case 'exportEntries':
        trezorManager.decryptEntries(request.content, sendResponse, request.clipboardClear);
        break;

      case 'importCancel':
        chrome.runtime.sendMessage({ type: 'fileSaved' });
        break;

      case 'decryptFullEntry':
        trezorManager.decryptFullEntry(request.content, sendResponse, false);
        break;

      case 'openTabAndLogin':
        chromeManager.openTabAndLogin(request.content);
        break;

      case 'getFeatures':
        trezorManager.getFeatures();
        break;

      case 'getDeviceState':
        trezorManager.getDeviceState(request.content, sendResponse);
        break;

      case 'renderWebUSBButton':
        trezorManager.renderWebUSBButton(sendResponse);
        break;

      case 'clearSession':
        // trezorManager.clearSession();
        break;

      case 'userSwitch':
        userSwitch();
        break;
    }
    return true;
  };

chrome.runtime.onMessage.addListener(chromeMessaging);

//handling when all windows are closed to clear context etc ...
chrome.windows.onRemoved.addListener(() => windowClose());

// check if app shouldnt reopen after software restart
if (localStorage.getItem('tpmRestart') === 'reopen') {
  setTimeout(() => {
    init();
  }, 1500);
}
