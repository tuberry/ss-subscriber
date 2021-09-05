// vim:fdm=syntax
// by tuberry
'use strict';

const Main = imports.ui.main;
const Util = imports.misc.util;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const { GLib, Shell, GObject, Soup, Gio, St } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const _ = ExtensionUtils.gettext;
const gsettings = ExtensionUtils.getSettings();
const Me = ExtensionUtils.getCurrentExtension();
const Fields = Me.imports.fields.Fields;
const proxyGsettings = new Gio.Settings({ schema_id: 'org.gnome.system.proxy' });
const PAPER_PLANE_ICON = Me.dir.get_child('icons').get_child('paper-plane-symbolic.svg').get_path();

const Shadowsocks = GObject.registerClass({
    Properties: {
        'restart':     GObject.ParamSpec.string('restart', 'restart', 'restart', GObject.ParamFlags.READWRITE, ''),
        'filename':    GObject.ParamSpec.string('filename', 'filename', 'filename', GObject.ParamFlags.READWRITE, ''),
        'subs-link':   GObject.ParamSpec.string('subs-link', 'subs-link', 'subs link', GObject.ParamFlags.READWRITE, ''),
        'additions':   GObject.ParamSpec.string('additions', 'additions', 'additions', GObject.ParamFlags.READWRITE, ''),
        'local-addr':  GObject.ParamSpec.string('local-addr', 'local-addr', 'local address', GObject.ParamFlags.READWRITE, ''),
        'subs-cache':  GObject.ParamSpec.string('subs-cache', 'subs-cache', 'subs cache', GObject.ParamFlags.READWRITE, ''),
        'proxy-mode':  GObject.ParamSpec.string('proxy-mode', 'proxy-mode', 'proxy mode', GObject.ParamFlags.READWRITE, ''),
        'server-name': GObject.ParamSpec.string('server-name', 'server-name', 'server name', GObject.ParamFlags.READWRITE, ''),
        'auto-subs':   GObject.ParamSpec.boolean('auto-subs', 'auto-subs', 'auto subs', GObject.ParamFlags.READWRITE, false),
        'lite-mode':   GObject.ParamSpec.boolean('lite-mode', 'lite-mode', 'lite mode', GObject.ParamFlags.READWRITE, false),
        'local-time':  GObject.ParamSpec.uint('local-time', 'local-time', 'timeout', GObject.ParamFlags.READWRITE, 0, 1000, 300),
        'local-port':  GObject.ParamSpec.uint('local-port', 'local-port', 'local port', GObject.ParamFlags.READWRITE, 0, 65535, 1080),
    },
}, class Shadowsocks extends GObject.Object {
    _init() {
        super._init();
        this.MODES = { auto: _('Automatic'), manual: _('Manual'), none: _('Disable') };
        this._bindSettings();
        this._addIndicator();
        this.proxyModeId = proxyGsettings.connect('changed::' + Fields.PROXYMODE, this._onModeChanged.bind(this));
        if(this.auto_subs) this._fetchSubs().then(scc => { this.subs_cache = scc; })
    }

    _bindSettings() {
        gsettings.bind(Fields.ADDITIONAL, this, 'additions',   Gio.SettingsBindFlags.GET);
        gsettings.bind(Fields.AUTOSUBS,   this, 'auto-subs',   Gio.SettingsBindFlags.GET);
        gsettings.bind(Fields.FILENAME,   this, 'filename',    Gio.SettingsBindFlags.GET);
        gsettings.bind(Fields.LOCALADDR,  this, 'local-addr',  Gio.SettingsBindFlags.GET);
        gsettings.bind(Fields.LOCALPORT,  this, 'local-port',  Gio.SettingsBindFlags.GET);
        gsettings.bind(Fields.LOCALTIME,  this, 'local-time',  Gio.SettingsBindFlags.GET);
        gsettings.bind(Fields.RESTART,    this, 'restart',     Gio.SettingsBindFlags.GET);
        gsettings.bind(Fields.SUBSLINK,   this, 'subs-link',   Gio.SettingsBindFlags.GET);
        gsettings.bind(Fields.LITEMODE,   this, 'lite-mode',   Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.SERVERNAME, this, 'server-name', Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.SUBSCACHE,  this, 'subs-cache',  Gio.SettingsBindFlags.DEFAULT);
        proxyGsettings.bind(Fields.PROXYMODE, this, 'proxy-mode', Gio.SettingsBindFlags.DEFAULT);
    }

    get _subs_cache() {
        let fix = x => x.replace(/-/g, '+').replace(/_/g, '/');
        let fill = x => x.length % 4 === 0 ? x : x + "=".repeat(4 - x.length % 4);
        let decode = x => eval("'" + new TextDecoder().decode(GLib.base64_decode(fill(fix(x)))) + "'");
        let caches = JSON.parse(decode(this.subs_cache.slice(6)).replace(/\s/g, ' '));

        return caches;
    }

    async _fetchSubs() {
        if(!this.subs_link) throw new Error(_('Subscription link is missing.'));
        let result = await this.visit('GET', this.subs_link)
        if(!result) throw new Error(_('Error: Subscription content is empty.'));

        return result;
    }

    async visit(method, url) {
        let message = Soup.Message.new(method, url);
        let bytes = await new Soup.Session().send_and_read_async(message, GLib.PRIORITY_DEFAULT, null);
        if(message.statusCode !== Soup.Status.OK)
            throw new Error('Unexpected response: %s'.format(Soup.Status.get_phrase(message.statusCode)));

        return new TextDecoder().decode(bytes.get_data());
    }

    _onModeChanged() {
        this._button.remove_style_class_name(this._tmpMode);
        this._button.add_style_class_name(this.proxy_mode);
        this._updateMenu();
    }

    _syncSubscribe() {
        Main.notify(Me.metadata.name, _('Start synchronizing.'));
        this._fetchSubs().then(scc => {
            this.subs_cache = scc;
            this._updateMenu();
            Main.notify(Me.metadata.name, _('Synchronized successfully.'));
        }).catch(err => {
            Main.notifyError(Me.metadata.name, err.message);
        });
    }

    async _genConfig(config) {
        let conf = {};
        if(config) {
            Object.assign(conf, JSON.parse(JSON.stringify(config).replace(/encryption/g, 'method').replace(/port/g, 'server_port')));
            this.server_name = config.remarks;
            this._updateMenu();
        } else {
            conf = { server: this._subs_cache.servers.map(x => x.server).filter(x => x != '127.0.0.1'),
                server_port: this._subs_cache.port, password: this._subs_cache.password, method: this._subs_cache.encryption, };
        }
        let local = { local_port: this.local_port, timeout: this.local_time, local_addr: this.local_addr || undefined };
        if(this.additions) Object.assign(local, JSON.parse(this.additions));
        conf = JSON.stringify(Object.assign(conf, local), null, 2);
        if(!this.filename) throw new Error(_('Config file is not set.'));
        Gio.File.new_for_path(this.filename).replace_contents(conf, null, false, Gio.FileCreateFlags.PRIVATE, null);
    }

    _checkCache() {
        if(this.subs_cache) {
            return true;
        } else if(this.subs_link) {
            this._syncSubscribe();
            return false;
        } else {
            return false;
        }
    }

    _restartService() {
        if(gsettings.get_boolean('gen-all')) { // NOTE: need redesign
            this._genConfig().then(() => { Util.spawnCommandLine(this.restart); });
        } else {
            let conf = this._subs_cache.servers.find(x => x.remarks == this.server_name);
            if(conf) this._genConfig(conf).then(() => { Util.spawnCommandLine(this.restart); });
        }
    }

    _networkSetting() {
        let network = Shell.AppSystem.get_default().lookup_app('gnome-network-panel.desktop');
        if(network) network.activate();
    }

    _settingItem() {
        let item = new PopupMenu.PopupBaseMenuItem({ style_class: 'ss-subscriber-item popup-menu-item', hover: false });
        let hbox = new St.BoxLayout({ x_align: St.Align.START, x_expand: true });
        let addButtonItem = (icon, func) => {
            let btn = new St.Button({
                x_expand: true,
                style_class: 'ss-subscriber-button',
                child: new St.Icon({ icon_name: icon, style_class: 'ss-subscriber-icon popup-menu-icon', }),
            });
            btn.connect('clicked', func);
            hbox.add_child(btn);
        }
        addButtonItem('emblem-system-symbolic', () => { this._button.menu.close(); ExtensionUtils.openPrefs(); });
        addButtonItem('view-refresh-symbolic', () => { this._button.menu.close(); this._restartService(); });
        addButtonItem('face-cool-symbolic', () => { this.lite_mode = !this.lite_mode; this._updateMenu(); });
        addButtonItem('network-workgroup-symbolic', () => { this._button.menu.close(); this._networkSetting(); });
        item.add_child(hbox);
        return item;
    }

    _proxyItems() {
        let items = [];
        for(let x in this.MODES) {
            let item = new PopupMenu.PopupMenuItem(this.MODES[x]);
            if(x === this.proxy_mode) {
                this._tmpMode = x;
                item.setOrnament(PopupMenu.Ornament.DOT);
            } else {
                item.connect('activate', () => { this._button.menu.close(); this.proxy_mode = x; });
            }
            items.push(item);
        }
        return items;
    }

    _updateMenu(callback) {
        this._button.menu.removeAll();
        if(this.lite_mode) {
            this._proxyItems().forEach(item => { this._button.menu.addMenuItem(item); });
        } else {
            let proxy = new PopupMenu.PopupSubMenuMenuItem(_("Proxy: ") + this.MODES[this.proxy_mode]);
            this._proxyItems().forEach(item => { proxy.menu.addMenuItem(item); });
            this._button.menu.addMenuItem(proxy);
            if(this._checkCache()) {
                let subs = this._subs_cache;
                let servers = new PopupMenu.PopupSubMenuMenuItem(_('Airport: ') + "%d/%d".format(subs.traffic_used, subs.traffic_total));
                subs.servers.forEach(x => {
                    let item = new PopupMenu.PopupMenuItem(x.remarks, { style_class: 'ss-subscriber-item popup-menu-item' });
                    if(typeof callback == 'function') callback(x.server, item);
                    if(x.remarks === this.server_name) {
                        item.setOrnament(PopupMenu.Ornament.DOT);
                    } else {
                        item.connect('activate', item => { this._button.menu.close();
                            this._genConfig(x).then(() => { Util.spawnCommandLine(this.restart); }); });
                    }
                    servers.menu.addMenuItem(item);
                });
                this._button.menu.addMenuItem(servers);
                let sync = new PopupMenu.PopupMenuItem(_("Sync Subscription"));
                sync.connect('activate', this._syncSubscribe.bind(this));
                this._button.menu.addMenuItem(sync);
            }
        }

        this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(''));
        this._button.menu.addMenuItem(this._settingItem());
    }

    _addIndicator() {
        this._button = new PanelMenu.Button(null, Me.metadata.uuid);
        this._button.add_actor(new St.Icon({
            style_class: 'ss-subscriber system-status-icon',
            gicon: new Gio.FileIcon({ file: Gio.File.new_for_path(PAPER_PLANE_ICON) }),
        }));
        this._button.add_style_class_name(this.proxy_mode);
        Main.panel.addToStatusArea(Me.metadata.uuid, this._button);
        this._updateMenu();
    }

    destroy() {
        if(this.proxyModeId)
            proxyGsettings.disconnect(this.proxyModeId), this.proxyModeId = 0;
        this._button.destroy();
        delete this._button;
    }
});

const Extension = class Extension {
    constructor() {
        ExtensionUtils.initTranslations();
    }

    enable() {
        this._ext = new Shadowsocks();
    }

    disable() {
        this._ext.destroy();
        delete this._ext;
    }
}

function init() {
    return new Extension();
}
