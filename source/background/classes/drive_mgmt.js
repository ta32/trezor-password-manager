/*
 * Copyright (c) Peter Jensen, SatoshiLabs
 *
 * Licensed under Microsoft Reference Source License (Ms-RSL)
 * see LICENSE.md file for details
 */

'use strict';
const API_URL = 'https://www.googleapis.com/drive/v2';

class DriveMgmt {

    constructor(bgStore) {
        this.bgStore = bgStore;
        this.token = false;
    }

    handleDriveError(error) {
        console.warn('Drive error:', error);
        switch (error.status) {
            case 0:
                this.bgStore.emit('sendMessage', 'errorMsg', {code: 'NETWORK_ERROR', msg: error.status, storage:'Drive'});
                break;

            case 400:
                console.warn('Bad request');
                this.bgStore.emit('sendMessage', 'errorMsg', {code: 'NETWORK_ERROR', msg: error.status, storage:'Drive'});
                break;

            case 401:
                console.warn('Invalid Token/Credentials');
                if (typeof this.token != 'undefined') {
                    this.disconnect();
                } else {
                    this.connect();
                }
                break;

            case 403:
                console.warn('Daily limit exceeded!');
                this.bgStore.emit('sendMessage', 'errorMsg', {code: 'OVER_QUOTA', msg: error.status, storage:'Drive'});
                break;

            case 404:
                console.warn('File not found!');
                break;

            case 500:
                console.warn('Backend error!');
                this.bgStore.emit('sendMessage', 'errorMsg', {code: 'NETWORK_ERROR', msg: error.status, storage:'Drive'});
                break;

        }
    }

    createCORSRequest(method, url, authorize = false, isFolder = false, readingFile = false) {
        let xhr = new XMLHttpRequest();
        xhr.open(method, url, true);
        if (authorize) {
            xhr.setRequestHeader('Authorization', 'Bearer ' + this.token);
        }
        if (isFolder) {
            xhr.setRequestHeader('Content-Type', 'application/json');
        }
        if (readingFile) {
            xhr.responseType = 'arraybuffer';
            xhr.setRequestHeader('Content-Type', 'text/plain;charset=UTF-8');
            xhr.overrideMimeType('text/plain;charset=UTF-8');
        }
        return xhr;
    }

    connect() {
        chrome.identity.getAuthToken({'interactive': true}, (token) => {
            this.token = token;
            this.getDriveUsername();
        });
    }

    disconnect() {
        chrome.identity.removeCachedAuthToken({'token': this.token}, () => {
            this.bgStore.emit('sendMessage', 'disconnected');
        });
    }

    getDriveUsername() {
        let url = API_URL + '/about';
        let xhr = this.createCORSRequest('GET', url, true);
        xhr.onerror = (e) => {
            this.handleDriveError(xhr);
        };
        xhr.onload = () => {
            if (xhr.status == 200) {
                let name = JSON.parse(xhr.responseText).name;
                this.bgStore.setUsername(name, 'DRIVE');
            } else {
                this.handleDriveError(xhr);
            }
        };
        xhr.send();
    }

    getAppFolderName() {
        return new Promise((resolve, reject) => {
            this.getFileIdByName('Apps').then((id) => {
                let appsFolderId = id;
                if (!!appsFolderId) {
                    this.getFileIdByName('TREZOR Password Manager', appsFolderId).then((tpmFolderId) => {
                        if (!!tpmFolderId) {
                            this.bgStore.tpmFolderId = tpmFolderId;
                            resolve(tpmFolderId);
                        } else {
                            this.createFolder('TREZOR Password Manager', appsFolderId).then((tpmFolderId) => {
                                this.bgStore.tpmFolderId = tpmFolderId;
                                resolve(tpmFolderId);
                            });
                        }
                    });
                } else {
                    this.createFolder('Apps').then((id) => {
                        let appsFolderId = id;
                        this.createFolder('TREZOR Password Manager', appsFolderId).then((tpmFolderId) => {
                            this.bgStore.tpmFolderId = tpmFolderId;
                            resolve(tpmFolderId);
                        });
                    });
                }
            });
        });
    }

    getAppFileStorage() {
        return new Promise((resolve, reject) => {
            this.getFileIdByName(this.bgStore.fileName, this.bgStore.tpmFolderId).then((fileId) => {

                if (!!fileId) {
                    this.bgStore.fileId = fileId;
                    resolve(fileId);
                } else {
                    this.bgStore.emit('initStorageFile');
                    reject;
                }
            });
        });
    }

    createFolder(title, parentId = false) {
        return new Promise((resolve, reject) => {
            let url = API_URL + '/files';
            let xhr = this.createCORSRequest('POST', url, true, true);
            xhr.onerror = () => {
                this.handleDriveError(xhr);
            };
            xhr.onload = () => {
                if (xhr.status == 200) {
                    let output = JSON.parse(xhr.responseText);
                    resolve(output.id);
                } else {
                    this.handleDriveError(xhr.status);
                }
            };
            let body = {
                "title": title,
                "mimeType": 'application/vnd.google-apps.folder'
            };
            if (parentId) {
                body.parents = [{"id": parentId}];
            }
            xhr.send(JSON.stringify(body));
        });
    }

    getFileIdByName(fileName, folderId = 'root') {
        return new Promise((resolve, reject) => {
            let url = API_URL + "/files/" + folderId + "/children?maxResults=1000&orderBy=createdDate&q=title = '" + fileName + "' and trashed = false";
            let xhr = this.createCORSRequest('GET', url, true);
            var fileId = false;
            xhr.onerror = () => {
                this.handleDriveError(xhr);
            };
            xhr.onload = () => {
                if (xhr.status == 200) {
                    let output = JSON.parse(xhr.responseText);
                    if (typeof output.items !== 'undefined') {
                        if (typeof output.items[0] !== 'undefined') {
                            fileId = output.items[0].id;
                        }
                    }
                    resolve(fileId);
                }
            };
            xhr.send();
        });
    }

    loadFile() {
        if (!this.bgStore.fileName) {
            this.bgStore.setFileName();
        }

        if (!this.bgStore.tpmFolderId) {
            this.getAppFolderName().then((folderId) => {
                this.getAppFileStorage().then((fileId) => {
                    this.loadFileContent(fileId);
                });
            });
        } else {
            if (!this.bgStore.fileId) {
                this.getAppFileStorage().then((fileId) => {
                    this.loadFileContent(fileId);
                });
            } else {
                this.loadFileContent(this.bgStore.fileId);
            }
        }
    }

    loadFileContent(fileId) {
        return new Promise((resolve, reject) => {
            let url = API_URL + '/files/' + fileId + '?alt=media';
            let xhr = this.createCORSRequest('GET', url, true, false, true);
            xhr.onerror = (e) => {
                this.handleDriveError(xhr);
                reject(e);
            };
            xhr.onload = () => {
                if (xhr.status == 200) {
                    var dataArr = new Uint8Array(xhr.response);
                    this.bgStore.setData(dataArr);
                    resolve(dataArr);
                }
            };
            xhr.send();
        });
    }

    createNewDataFile(data) {
        this.saveFile(data).then((fileId) => {
            this.bgStore.fileId = fileId;
            this.loadFileContent(fileId);
        });
    }

    saveFile(data) {
        return new Promise((resolve, reject) => {
            let blob = new Blob([data.buffer], {type: 'text/plain;charset=UTF-8'});
            let uploader = new MediaUploader({
                file: blob,
                token: this.token,
                fileId: this.bgStore.fileId,
                contentType: 'text/plain;charset=UTF-8',
                metadata: {
                    'title': this.bgStore.fileName,
                    'fileId': this.bgStore.fileId,
                    'parents': [{'id': this.bgStore.tpmFolderId}],
                    'mimeType': 'text/plain;charset=UTF-8'
                },
                onComplete: (data) => {
                    resolve(JSON.parse(data).id);
                }
            });
            uploader.upload();
        });
    }

    updateFile(data) {
        this.saveFile(data);
    }
}

module.exports = DriveMgmt;