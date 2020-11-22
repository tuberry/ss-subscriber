// vim:fdm=syntax
// by tuberry
//
const Main = imports.ui.main;
const Util = imports.misc.util;
const ByteArray = imports.byteArray;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const { GLib, Shell, GObject, Soup, Gio, St } = imports.gi;

const proxyGsettings = new Gio.Settings({ schema_id: 'org.gnome.system.proxy' });
const ExtensionUtils = imports.misc.extensionUtils;
const gsettings = ExtensionUtils.getSettings();
const Me = ExtensionUtils.getCurrentExtension();
const Fields = Me.imports.prefs.Fields;
const _ = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;
const PAPER_PLANE_ICON = Me.dir.get_child('icons').get_child('paper-plane-symbolic.svg').get_path();

const Shadowsocks = GObject.registerClass(
class Shadowsocks extends GObject.Object {
    _init() {
        super._init();
        this.MODES = { auto: _('Automatic'), manual: _('Manual'), none: _('Disable') };
    }

    get _subslink() {
        return gsettings.get_string(Fields.SUBSLINK);
    }

    get _autosubs() {
        return gsettings.get_boolean(Fields.AUTOSUBS)
    }

    get _subscache() {
        let fix = x => x.replace(/-/g, '+').replace(/_/g, '/');
        let fill = x => x.length % 4 === 0 ? x : x + "=".repeat(4 - x.length % 4);
        let decode = x => eval("'" + ByteArray.toString(GLib.base64_decode(fill(fix(x)))) + "'");

        return decode(gsettings.get_string(Fields.SUBSCACHE).slice(6)).replace(/\s/g, ' ');
    }

    get _litemode() {
        return gsettings.get_boolean(Fields.LITEMODE);
    }

    get _servername() {
        return gsettings.get_string(Fields.SERVERNAME) || 'NONE';
    }

    get _filename() {
        return gsettings.get_string(Fields.FILENAME);
    }

    get _restart() {
        return gsettings.get_string(Fields.RESTART);
    }

    get _localConf() {
        let local = {};
        if(gsettings.get_string(Fields.LOCALADDR))
            local.local_address = gsettings.get_string(Fields.LOCALADDR);
        local.local_port = gsettings.get_uint(Fields.LOCALPORT);
        local.timeout = gsettings.get_uint(Fields.LOCALTIME);
        if(gsettings.get_string(Fields.ADDITIONAL))
            try {
                Object.assign(local, JSON.parse(gsettings.get_string(Fields.ADDITIONAL)));
            } catch(e) {
                Main.notifyError(Me.metadata.name, "Error: local conf -- %s".format(e.message));
            }

        return local;
    }

    get _proxymode() {
        return proxyGsettings.get_string(Fields.PROXYMODE);
    }

    set _proxymode(mode) {
        proxyGsettings.set_string(Fields.PROXYMODE, mode);
    }

    set _subscache(cache) {
        gsettings.set_string(Fields.SUBSCACHE, cache);
    }

    set _servername(name) {
        gsettings.set_string(Fields.SERVERNAME, name);
    }

    _onModeChanged() {
        this._button.remove_style_class_name(this._tmpMode);
        this._button.add_style_class_name(this._proxymode);
        this._updateMenu();
    }

    _syncSubscribe() {
        if(!this._subslink) {
            this._subscache = '';
            return;
        }
        Main.notify(Me.metadata.name, _('Start synchronizing.'));
        let session = new Soup.SessionAsync();
        Soup.Session.prototype.add_feature.call(session, new Soup.ProxyResolverDefault());
        let uri = new Soup.URI(this._subslink);
        let request = Soup.Message.new_from_uri('GET', uri);
        session.queue_message(request, (session, message) => {
            try {
                if (message.status_code == 200) {
                    this._parseSSD(message.response_body.data.trim());
                } else {
                    Main.notifyError(Me.metadata.name, 'Error: %s status code %d'.format(uri.scheme.toUpperCase(), message.status_code));
                }
            } catch(e) {
                Main.notifyError(Me.metadata.name, e.message);
            }
        });
    }

    _autoSyncSSD() {
        if(!this._subslink) return;
        let session = new Soup.SessionAsync();
        Soup.Session.prototype.add_feature.call(session, new Soup.ProxyResolverDefault());
        let uri = new Soup.URI(this._subslink);
        let request = Soup.Message.new_from_uri('GET', uri);
        session.queue_message(request, (session, message) => {
            if(message.status_code != 200) return;
            if(!message.response_body.data.trim()) return;
            this._subscache = message.response_body.data.trim();
        });
    }

    _parseSSD(subs) {
        if(!subs) {
            Main.notifyError(Me.metadata.name, _('Error: Subscription content is empty.'));
            return;
        }
        this._subscache = subs;
        if(gsettings.get_boolean('gen-all')) this._genAll();
        Main.notify(Me.metadata.name, _('Synchronized successfully.'));
        this._updateMenu();
    }

    _checkCache() {
        if(this._subscache.length) {
            return true;
        } else if(this._subslink.length) {
            this._syncSubscribe();
            return false;
        } else {
            // Main.notifyError(Me.metadata.name, _('Subscription link is missing.'));
            return false;
        }
    }

    _restartService() {
        if(gsettings.get_boolean('gen-all')) {
            this._genAll();
        } else {
            let conf = JSON.parse(this._subscache).servers.find(x => x.remarks == this._servername);
            if(conf) this._genConfig(conf);
            Util.spawnCommandLine(this._restart);
        }
    }

    _genConfig(config) {
        let conf = {};
        let subs = JSON.parse(this._subscache);
        conf.server_port = conf.server_port ? conf.server_port : subs.port;
        conf.password = conf.password ? conf.password : subs.password;
        conf.method = conf.method ? conf.method : subs.encryption;
        Object.assign(conf, config);
        Object.assign(conf, this._localConf);
        try {
            let file = Gio.File.new_for_path(this._filename);
            file.replace_contents(JSON.stringify(conf, null, 2), null, false, Gio.FileCreateFlags.PRIVATE, null);
            Util.spawnCommandLine(this._restart);
        } catch(e) {
            Main.notifyError(Me.metadata.name, e.message);
        }
        this._servername = conf.remarks;
        this._updateMenu();
    }

    _genAll() {
        let conf = {};
        conf.server = [];
        let subs = JSON.parse(this._subscache);
        subs.servers.forEach(x => { if(x.server != '127.0.0.1') conf.server.push(x.server); });
        conf.server_port = conf.server_port ? conf.server_port : subs.port;
        conf.password = conf.password ? conf.password : subs.password;
        conf.method = conf.method ? conf.method : subs.encryption;
        Object.assign(conf, this._localConf);
        try {
            let file = Gio.File.new_for_path(this._filename);
            file.replace_contents(JSON.stringify(conf, null, 2), null, false, Gio.FileCreateFlags.PRIVATE, null);
            Util.spawnCommandLine(this._restart);
        } catch(e) {
            Main.notifyError(Me.metadata.name, e.message);
        }
    }

    _settingItem() {
        let item = new PopupMenu.PopupBaseMenuItem({ style_class: 'ss-subscriber-item', hover: false });
        let hbox = new St.BoxLayout({ x_align: St.Align.START, x_expand: true });
        let addButtonItem = (icon, func) => {
            let btn = new St.Button({
                hover: true,
                x_expand: true,
                style_class: 'ss-subscriber-button',
                child: new St.Icon({ icon_name: icon, style_class: 'ss-subscriber-icon', }),
            });
            btn.connect('clicked', func);
            hbox.add_child(btn);
        }
        addButtonItem('emblem-system-symbolic', () => { item._getTopMenu().close(); ExtensionUtils.openPrefs(); });
        addButtonItem('view-refresh-symbolic', () => {
            item._getTopMenu().close();
            this._restartService();
        });
        addButtonItem('face-cool-symbolic', () => { gsettings.set_boolean(Fields.LITEMODE, !this._litemode); });
        addButtonItem('network-workgroup-symbolic', () => {
            item._getTopMenu().close();
            Shell.AppSystem.get_default().lookup_app('gnome-network-panel.desktop').activate();
        });
        item.add_child(hbox);
        return item;
    }

    _updateMenu() {
        this._button.menu.removeAll();
        if(this._litemode) {
            for(let x in this.MODES) {
                let item = new PopupMenu.PopupMenuItem(this.MODES[x]);
                if(x === this._proxymode) {
                    this._tmpMode = x;
                    item.setOrnament(PopupMenu.Ornament.DOT);
                } else {
                    item.connect("activate", () => { item._getTopMenu().close(); this._proxymode = x; });
                }
                this._button.menu.addMenuItem(item);
            }
        } else {
            let proxy = new PopupMenu.PopupSubMenuMenuItem(_("Proxy: ") + this.MODES[this._proxymode]);
            for(let x in this.MODES) {
                let item = new PopupMenu.PopupMenuItem(this.MODES[x]);
                if(x === this._proxymode) {
                    this._tmpMode = x;
                    item.setOrnament(PopupMenu.Ornament.DOT);
                } else {
                    item.connect("activate", () => { item._getTopMenu().close(); this._proxymode = x; });
                }
                proxy.menu.addMenuItem(item);
            }
            this._button.menu.addMenuItem(proxy);

            if(this._checkCache()) {
                let subs = JSON.parse(this._subscache);
                let servers = new PopupMenu.PopupSubMenuMenuItem(_('Airport: ') + "%d/%d".format(subs.traffic_used, subs.traffic_total));
                this._button.menu.addMenuItem(servers);
                subs.servers.forEach(x => {
                    let item = new PopupMenu.PopupMenuItem(x.remarks, { style_class: 'ss-subscriber-item' });
                    if(x.remarks === this._servername) {
                        item.setOrnament(PopupMenu.Ornament.DOT);
                    } else {
                       item.connect("activate", () => { item._getTopMenu().close(); this._genConfig(x); });
                    }
                    servers.menu.addMenuItem(item);
                });
                let sync = new PopupMenu.PopupMenuItem(_("Sync Subscription"));
                sync.connect("activate", () => { sync._getTopMenu().close(); this._syncSubscribe(); });
                this._button.menu.addMenuItem(sync);
            }
        }

        this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(''));

        this._button.menu.addMenuItem(this._settingItem());
    }

    _addButton() {
        this._button = new PanelMenu.Button(null);
        this._button.add_actor(new St.Icon({
            gicon: new Gio.FileIcon({ file: Gio.File.new_for_path(PAPER_PLANE_ICON) }),
            style_class: 'ss-subscriber system-status-icon'
        }));
        this._button.add_style_class_name(this._proxymode);
        Main.panel.addToStatusArea(Me.metadata.uuid, this._button);
        this._updateMenu();
    }

    enable() {
        if(this._autosubs) this._autoSyncSSD();
        this._proxymodeID = proxyGsettings.connect('changed::' + Fields.PROXYMODE, this._onModeChanged.bind(this));
        this._litemodeId = gsettings.connect('changed::' + Fields.LITEMODE, this._updateMenu.bind(this));
        this._addButton();
    }

    disable() {
        for(let x in this)
            if(RegExp(/^_.+Id$/).test(x)) eval('if(this.%s) gsettings.disconnect(this.%s), this.%s = 0;'.format(x, x, x));
        if(this._proxymodeID)
            proxyGsettings.disconnect(this._proxymodeID), this._proxymodeID = 0;
        this._button.destroy();
    }
});

function init() {
    ExtensionUtils.initTranslations();
    return new Shadowsocks();
}
