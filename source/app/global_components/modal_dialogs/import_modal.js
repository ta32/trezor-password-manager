/*
 * Copyright (c) Peter Jensen, SatoshiLabs
 *
 * Licensed under Microsoft Reference Source License (Ms-RSL)
 * see LICENSE.md file for details
 */

'use strict';

var React = require('react'),
  Papa = require('papaparse'),
  Table = require('react-bootstrap').Table,
  Modal = require('react-bootstrap').Modal,
  ImportSelect = require('../import_select'),
  tld = require('tldjs'),
  validator = require('validator'),
  ImportModal = React.createClass({
    getInitialState() {
      return {
        showImportModal: false,
        dropdownOptions: [
          {
            name: 'URL (required)',
            value: 'title',
            selectedCol: 0
          },
          {
            name: 'Title',
            value: 'note',
            selectedCol: 1
          },
          {
            name: 'Username',
            value: 'username',
            selectedCol: 2
          },
          {
            name: 'Password',
            value: 'password',
            selectedCol: 3
          },
          {
            name: 'Tags',
            value: 'tags',
            selectedCol: 4
          },
          {
            name: 'Secret note',
            value: 'safe_note',
            selectedCol: 5
          },
          {
            name: "- don't import -",
            value: 'dont_import',
            selectedCol: -1
          }
        ],
        storage: false,
        storageFile: false,
        firstRowHeader: false,
        importStatus: [],
        importedTags: [],
        encryptedEntries: [],
        dropZoneActive: false
      };
    },

    componentDidMount() {
      window.myStore.on('storageImport', this.importModalMsgHandler);
      window.addEventListener('mouseup', this.fileOnDragLeave);
      window.addEventListener('dragleave', this.fileOnDragLeave);
      window.addEventListener('dragenter', this.fileOnDragOver);
      window.addEventListener('drop', this.fileOnDrop);
    },

    componentWillUnmount() {
      window.myStore.removeListener('storageImport', this.importModalMsgHandler);
      window.removeEventListener('mouseup', this.fileOnDragLeave);
      window.removeEventListener('dragleave', this.fileOnDragLeave);
      window.removeEventListener('dragenter', this.fileOnDragOver);
      window.removeEventListener('drop', this.fileOnDrop);
    },

    importModalMsgHandler(data) {
      var importStatus = [];
      if (data && data.data) {
        let lngt = data.data.length;
        importStatus = Array(lngt).fill('pending');
        this.setState({
          showImportModal: true,
          storage: data,
          importStatus: importStatus
        });
      } else {
        this.showImportModal();
      }
    },

    showImportModal() {
      this.setState({
        showImportModal: true
      }, () => {
        this.resetDropdownOptions();
      });
    },

    closeImportModal() {
      this.setState({
        showImportModal: false,
        firstRowHeader: false,
        storage: false,
        importStatus: []
      });
    },

    stopImportProcess() {
      if (this.state.importedTags.length > 0) {
        this.state.importedTags.map((tagId) => {
          window.myStore.removeTag(tagId, false);
        });
      }

      this.setState({
        storage: false,
        importStatus: [],
        importedTags: [],
        firstRowHeader: false,
        encryptedEntries: []
      });
      browser.runtime.sendMessage({ type: 'importCancel' });
    },

    importStorage(n) {
      if (!this.state.showImportModal) return;
      if (typeof n !== 'number') {
        this.setState({
          encryptedEntries: []
        });
        n = 0;
      }

      if (this.state.dropdownOptions[0].selectedCol === -1) {
        alert('Select column for URL (required)!');
      } else {
        let entry = this.state.storage.data[n];
        if (!!entry) {
          entry = this.sortEntryData(entry);
          this.encryptEntry(entry, n);
        } else {
          this.addEncryptedEntries();
        }
      }
    },

    resetDropdownOptions() {
      var options = [];
      this.state.dropdownOptions.forEach((option, key) => {
        if (key === 6) {
          option.selectedCol = -1;
        } else {
          option.selectedCol = key;
        }
        options.push(option);
      });
      this.setState({
        dropdownOptions: options
      });
    },

    sortEntryData(entry) {
      let r = {};
      this.state.dropdownOptions.forEach(function(option) {
        if (option.value === 'dont_import') return;
        r[option.value] = Object.values(entry)[option.selectedCol];
      });
      return r;
    },

    encryptEntry(entry, n) {
      var encryptedEntries = this.state.encryptedEntries;
      let tags = [];
      if (entry.tags) {
        let tags_titles = entry.tags.split('|');
        tags_titles.map(key => {
          let tag = window.myStore.getTagIdByTitle(key);
          if (tag) {
            tags.push(tag);
          } else {
            let newId = window.myStore.addNewTag(key, 'cloud');
            tags.push(newId);
            
            let importedTags = this.state.importedTags;
                importedTags.push(newId);
            this.setState({
              importedTags: importedTags
            });
          }
        });
      }

      this.setImportEntryStatus(n, 'importing');

      if (!!entry.title || !!entry.note) {
        let data = {
          title: String(entry.title || entry.note),
          username: String(entry.username || ''),
          password: String(entry.password || ''),
          nonce: String(''),
          tags: tags,
          safe_note: String(entry.safe_note || ''),
          note: String(entry.note) || null,
          key_value: this.state.key_value
        };
        
        if (!data.note) {
          if (this.isUrl(this.removeProtocolPrefix(entry.title))) {
            data.note = tld.getDomain(entry.title)
          } else {
            data.note = data.title;
          }
        }

        browser.runtime.sendMessage({ type: 'encryptFullEntry', content: data }, response => {
          var importStatus = this.state.importStatus
          if (importStatus.length === 0) return;
          data.password = response.content.password;
          data.safe_note = response.content.safe_note;
          data.nonce = response.content.nonce;
          data.success = response.content.success;
          if (data.success) {
            this.setImportEntryStatus(n, 'success');
            encryptedEntries.push(data);
            this.setState(
              {
                encryptedEntries: encryptedEntries
              },
              res => {
                this.importStorage(n + 1);
              }
            );
          } else {
            this.importStorage(n + 1);
            this.setImportEntryStatus(n, 'error');
          }
        });
      } else {
        this.setImportEntryStatus(n, 'warning');
        this.importStorage(n + 1);
        console.warn('missing title');
      }
    },

    isUrl(url) {
      return validator.isURL(url.trim());
    },
    
    removeProtocolPrefix(url) {
      return url.indexOf('://') > -1
        ? url.substring(url.indexOf('://') + 3, url.length).split('/')[0]
        : url.split('/')[0];
    },

    addEncryptedEntries() {
      window.myStore.addNewEntries(this.state.encryptedEntries);
      this.setState({
        encryptedEntries: [],
        firstRowHeader: false
      });
    },

    setImportEntryStatus(entryKey, status) {
      let importStatus = this.state.importStatus;
      importStatus[entryKey] = status;
      this.setState({
        importStatus: importStatus
      });
    },

    handleChange(value, selectedCol) {
      let dropdownOptions = Object.assign(this.state.dropdownOptions);

      dropdownOptions.forEach((option, key) => {
        if (option.selectedCol == selectedCol) {
          dropdownOptions[key].selectedCol = -1;
        }
        if (option.value == value) {
          dropdownOptions[key].selectedCol = selectedCol;
        }
      });

      this.setState({
        dropdownOptions: dropdownOptions
      });
    },

    fileChange(event) {
      var file = null,
        firstRowHeader = this.state.firstRowHeader;

      if (event) {
        file = event.target.files[0];
        this.setState({
          storageFile: file
        });
        window.myStore.emit('storageImport', false);
      } else {
        file = this.state.storageFile;
      }

      Papa.parse(file, {
        worker: false,
        skipEmptyLines: true,
        complete: results => {
          if (firstRowHeader) results.data.shift();

          if (results.data.length === 0) {
            alert('Empty file!');
          } else {
            results.data.forEach((v, k) => {
              if (results.data[k].length > 9) {
                results.data[k] = results.data[k].slice(0, 9);
              }
            });

            window.myStore.emit('storageImport', results);
          }
        }
      });
    },

    fileOnDrop(event) {
      event.stopPropagation();
      event.preventDefault();
      this.setState({
        dropZoneActive: false
      });
      this.fileChange({
        target: {
          files: event.dataTransfer.files
        }
      });
    },

    fileOnDragOver(event) {
      event.stopPropagation();
      event.preventDefault();
      this.setState({
        dropZoneActive: true
      });
    },

    fileOnDragLeave(event) {
      event.stopPropagation();
      event.preventDefault();
      this.setState({
        dropZoneActive: false
      });
    },

    onFocusValue(event) {
        event.target.parentNode.classList.add('active');
    },

    onBlurValue(event) {
        event.target.parentNode.classList.remove('active');
    },

    onChangeValue(event) {
        let id = event.target.getAttribute('id').split('-');
        let row = parseInt(id[1]);
        let col = parseInt(id[2]);

        var storage = this.state.storage;
            storage.data[row][col] = event.target.value;

        this.setState({
            storage: storage
        });
    },

    browseFile(event) {
      event.preventDefault();
      document.getElementById('importInput').click();
    },

    setFirstRow(event) {
      event.preventDefault();
      this.setState(
        {
          firstRowHeader: !this.state.firstRowHeader
        },
        () => {
          this.fileChange();
        }
      );
    },

    render() {
      if (this.state.storage) {
        var table_body,
          table_head = [],
          storageData = this.state.storage.data,
          fields = this.state.storage.meta.fields,
          dropdownOptions = this.state.dropdownOptions,
          importStatus = this.state.importStatus,
          firstRowHeader = this.state.firstRowHeader,
          showImportButtons = true,
          showClearFirstRow = true,
          importIsDone = true,
          importInProgress = false,
          importedCound = 0,
          notImportedCound = 0;

        importStatus.forEach(status => {
          if (status == 'pending' || status == 'importing') {
            importIsDone = false;
          }
          if (status == 'importing') {
            importInProgress = true;
          }
          if (status !== 'pending') {
            showImportButtons = false;
          }
        });

        if (importIsDone) {
          importedCound = importStatus.filter(item => {
            return item == 'success';
          }).length;
          notImportedCound = importStatus.filter(item => {
            return item !== 'success';
          }).length;
        }

        if (storageData.length === 1) {
          showClearFirstRow = false;
          if (firstRowHeader) {
            showClearFirstRow = true;
          }
        }

        // table body
        let n = 0;
        table_body = storageData.map(item => {
          let i = 0;
          let cols = Object.values(item).map(col => {
            let key = n.toString() + i.toString();
            var selected = dropdownOptions.find(option => {
              return option.selectedCol == i;
            });
            var val = col;

            if (n == 0) {
              // table header
              let selectKey = 'select' + i;
              let pendingItems = this.state.importStatus.filter(function(val) {
                return val === 'pending';
              });
              let selectDisabled = this.state.importStatus.length !== pendingItems.length;

              table_head.push(
                <th key={i}>
                  <ImportSelect
                    name={selectKey}
                    value={selected ? selected.value : ''}
                    col={i}
                    onChange={this.handleChange}
                    options={dropdownOptions}
                    disabled={selectDisabled}
                  />
                </th>
              );
            }

            if (selected && (selected.value === 'password' || selected.value === 'safe_note')) {
              val = (
                <span>
                  <i className="icon ion-asterisk" />
                  <i className="icon ion-asterisk" />
                  <i className="icon ion-asterisk" />
                  <i className="icon ion-asterisk" />
                  <i className="icon ion-asterisk" />
                </span>
              );
            }

            if (selected && selected.value === 'tags') {
              val = col.split('|').join(', ');
            }

            let id = 'input-' + n + '-' + i;

            i++;
            return <td key={key}>
                {val}
                <input type="text" className="edit" id={id} value={col} onChange={this.onChangeValue} onFocus={this.onFocusValue} onBlur={this.onBlurValue} />
            </td>;
          });
          let statusKey = 'status' + i;
          cols.push(
            <td key={statusKey}>
              {importStatus[n] == 'importing' && (
                <div className={'loading'}>
                  <span className="spinner" />
                </div>
              )}
              {importStatus[n] == 'success' && (
                <div className={'success'}>
                  <img src="./images/success_blue.svg" />
                </div>
              )}
              {(importStatus[n] == 'warning' || importStatus[n] == 'error') && (
                <div className={'warning'}>
                  <img src="./images/cancel_red.svg" />
                </div>
              )}
            </td>
          );

          n++;
          return (
            <tr key={n.toString()} className={importStatus[n - 1]}>
              {cols}
            </tr>
          );
        });
        if (table_head) {
          table_head.push(
            <th key={'status'} className={'status-col'}>
              <span>Status</span>
            </th>
          );
        }
      }

      return (
        <div>
          <Modal
            show={this.state.showImportModal}
            backdrop={'static'}
            dialogClassName={'import-modal-dialog'}
            autoFocus={true}
            enforceFocus={true}
            onHide={this.closeImportModal}
          >
            <Modal.Header>
              {!importInProgress && (
              <button className="close" onClick={this.closeImportModal}>
                <img src="./images/cancel.svg" />
              </button>
              )}
              <Modal.Title id="contained-modal-title-sm">Import keys</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              {!this.state.storage && (
                <form className={'file-form'}>
                  <div
                    className={this.state.dropZoneActive ? 'active' : ''}
                    id={'drop-area'}
                    onDrop={this.fileOnDrop}
                    onDragOver={this.fileOnDragOver}
                  >
                    <img src="./images/csv_file.svg" />
                    <br />
                    <label htmlFor={'importInput'}>
                      Drop file here or{' '}
                      <a href="#" onClick={this.browseFile}>
                        browse
                      </a>{' '}
                      to upload.
                    </label>
                    <input
                      id="importInput"
                      className="hide"
                      type="file"
                      accept=".csv"
                      ref={'fileUploader'}
                      onChange={event => {
                        this.fileChange(event);
                        event.target.value = null;
                      }}
                    />
                  </div>
                </form>
              )}
              {this.state.storage && <p className={'help'}>Sort your .CSV columns by type.</p>}
              {showClearFirstRow && !importInProgress && (
              <label
                className={'checkbox' + (firstRowHeader ? ' active' : '')}
                onClick={this.setFirstRow}
              >
                <i>{firstRowHeader && <img src="./images/checkbox_checked.svg" />}</i>
                Clear first row in the table.
              </label>
              )}
              {this.state.storage && (
                <div className={'storage_content'}>
                  <Table>
                    <thead>
                      <tr>{table_head}</tr>
                    </thead>
                    <tbody>{table_body}</tbody>
                  </Table>
                </div>
              )}
            </Modal.Body>
            {showImportButtons && (
              <Modal.Footer>
                <button type="button" className={'btn btn-link'} onClick={this.closeImportModal}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={'blue-btn add btn-wide'}
                  onClick={this.importStorage}
                >
                  Import keys
                </button>
              </Modal.Footer>
            )}
            {importInProgress && (
              <Modal.Footer>
                <button
                  type="button"
                  className={'red-btn add btn-wide'}
                  onClick={this.stopImportProcess}
                >
                  Stop import
                </button>
              </Modal.Footer>
            )}
            {importIsDone && (
              <Modal.Footer>
                <span className="info">
                  <i className="icon ion-information-circled" /> Imported {importedCound} entries,
                  skipped {notImportedCound}.
                </span>
                <button
                  type="button"
                  className={'blue-btn add btn-wide'}
                  onClick={this.closeImportModal}
                >
                  Continue
                </button>
              </Modal.Footer>
            )}
          </Modal>
        </div>
      );
    }
  });

module.exports = ImportModal;
