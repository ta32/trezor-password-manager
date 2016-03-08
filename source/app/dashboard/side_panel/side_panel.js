"use strict";

var React = require('react'),
    Router = require('react-router'),
    DataService = require('../../global_components/data_service'),
    SidePanel = React.createClass({


        getInitialState() {
            return {
                context: window.myStore,
                tags: window.myStore.data.tags,
                active_id: 0,
                active_title: window.myStore.getTagTitleById(0)
            }
        },

        componentWillMount() {
            window.myStore.on('contextInit', this.saveContext);
            window.myStore.on('changeTag', this.changeTag);
        },

        componentWillUnmount() {
            window.myStore.removeListener('contextInit', this.saveContext);
            window.myStore.removeListener('changeTag', this.changeTag);
        },

        changeTag(e) {
            if (e === undefined) {
                this.setState({
                    active_id: this.state.active_id,
                    active_title: this.state.active_title
                });
            } else {
                this.setState({
                    active_id: parseInt(e),
                    active_title: this.state.context.getTagTitleById(e)
                });
            }
        },

        changeTagAndEmitt(e) {
            window.myStore.emit('changeTag', e);
            this.setState({
                active_id: parseInt(e),
                active_title: this.state.context.getTagTitleById(e)
            });
        },

        addTag() {
            window.myStore.emit('openAddTag');
        },

        saveContext(context) {
            this.setState({
                context: window.myStore,
                tags: window.myStore.data.tags,
                active_title: window.myStore.getTagTitleById(this.state.active_id)
            });
        },

        render(){
            var tag_array = Object.keys(this.state.tags).map((key) => {
                var obj = this.state.tags[key];
                obj.active = this.state.active_id == key ? 'active' : '';
                return (
                    <li key={key} className={obj.active}>
                        <a data-tag-key={key}
                           data-tag-name={obj.title}
                           onClick={this.changeTagAndEmitt.bind(null, key)}
                           onTouchStart={this.changeTagAndEmitt.bind(null, key)}>
                            <i className={"icon ion-" + obj.icon}></i>
                            <span className="nav-label">{obj.title}</span>
                        </a></li>)
            });

            return (
                <aside className="left-panel">
                    <div className="logo">
                        <span className="logo-expanded">
                            <img src="dist/app-images/logo-mini.png" alt="logo"/>
                            <span className="nav-label">
                                <b>PASSWORD</b>
                                <span>Manager</span>
                            </span>
                        </span>
                    </div>

                    <nav className="navigation">
                        <ul className="list-unstyled">
                            {tag_array}

                            <li className="add-tag-btn">
                                <a onClick={this.addTag} onTouchStart={this.addTag}>
                                    <i className="icon ion-plus-circled"></i>
                                    <span className="nav-label">Add tag</span>
                                </a>
                            </li>
                        </ul>
                    </nav>

                </aside>
            )
        }
    });

module.exports = SidePanel;
