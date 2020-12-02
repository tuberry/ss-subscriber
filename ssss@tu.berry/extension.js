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

const Shadowsocks = GObject.registerClass({
    Properties: {
        'restart':    GObject.param_spec_string('restart', 'restart', 'restart', '', GObject.ParamFlags.READWRITE),
        'filename':   GObject.param_spec_string('filename', 'filename', 'file name', '', GObject.ParamFlags.READWRITE),
        'subslink':   GObject.param_spec_string('subslink', 'subslink', 'subs link', '', GObject.ParamFlags.READWRITE),
        'additions':  GObject.param_spec_string('additions', 'additions', 'additions', '', GObject.ParamFlags.READWRITE),
        'localaddr':  GObject.param_spec_string('localaddr', 'localaddr', 'local_address', '', GObject.ParamFlags.READWRITE),
        'subscache':  GObject.param_spec_string('subscache', 'subscache', 'subs cache', '', GObject.ParamFlags.READWRITE),
        'proxymode':  GObject.param_spec_string('proxymode', 'proxymode', 'proxy mode', '', GObject.ParamFlags.READWRITE),
        'servername': GObject.param_spec_string('servername', 'servername', 'server name', '', GObject.ParamFlags.READWRITE),
        'autosubs':   GObject.param_spec_boolean('autosubs', 'autosubs', 'auto subs', false, GObject.ParamFlags.WRITABLE),
        'litemode':   GObject.param_spec_boolean('litemode', 'litemode', 'lite mode', false, GObject.ParamFlags.READWRITE),
        'localtime':  GObject.param_spec_uint('localtime', 'localtime', 'timeout', 0, 1000, 300, GObject.ParamFlags.READWRITE),
        'localport':  GObject.param_spec_uint('localport', 'localport', 'local_port', 0, 65535, 1080, GObject.ParamFlags.READWRITE),
    },
}, class Shadowsocks extends GObject.Object {
    _init() {
        super._init();
        this.MODES = { auto: _('Automatic'), manual: _('Manual'), none: _('Disable') };
    }

    _bindSettings() {
        gsettings.bind(Fields.ADDITIONAL, this, 'additions',  Gio.SettingsBindFlags.GET);
        gsettings.bind(Fields.FILENAME,   this, 'filename',   Gio.SettingsBindFlags.GET);
        gsettings.bind(Fields.LOCALADDR,  this, 'localaddr',  Gio.SettingsBindFlags.GET);
        gsettings.bind(Fields.LOCALPORT,  this, 'localport',  Gio.SettingsBindFlags.GET);
        gsettings.bind(Fields.LOCALTIME,  this, 'localtime',  Gio.SettingsBindFlags.GET);
        gsettings.bind(Fields.RESTART,    this, 'restart',    Gio.SettingsBindFlags.GET);
        gsettings.bind(Fields.SUBSLINK,   this, 'subslink',   Gio.SettingsBindFlags.GET);
        gsettings.bind(Fields.LITEMODE,   this, 'litemode',   Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.SERVERNAME, this, 'servername', Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.SUBSCACHE,  this, 'subscache',  Gio.SettingsBindFlags.DEFAULT);
        proxyGsettings.bind(Fields.PROXYMODE, this, 'proxymode', Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.AUTOSUBS,   this, 'autosubs',   Gio.SettingsBindFlags.GET);
    }

    set autosubs(autosubs) {
        if(autosubs) this._fetchSubs().then(scc => { this.subscache = scc; });
    }

    get _subscache() {
        let fix = x => x.replace(/-/g, '+').replace(/_/g, '/');
        let fill = x => x.length % 4 === 0 ? x : x + "=".repeat(4 - x.length % 4);
        let decode = x => eval("'" + ByteArray.toString(GLib.base64_decode(fill(fix(x)))) + "'");
        let caches = JSON.parse(decode(this.subscache.slice(6)).replace(/\s/g, ' '));

        return caches;
    }

    _fetchSubs() {
        return new Promise((resolve, reject) => {
            try{
                if(!this.subslink) reject(_('Subscription link is missing.'));
                let session = new Soup.SessionAsync();
                Soup.Session.prototype.add_feature.call(session, new Soup.ProxyResolverDefault());
                let uri = new Soup.URI(this.subslink);
                let request = Soup.Message.new_from_uri('GET', uri);
                session.queue_message(request, (session, message) => {
                    if(message.status_code == 200) {
                        let data = message.response_body.data.trim();
                        data ? resolve(data) : reject(_('Error: Subscription content is empty.'));
                    } else {
                        reject('Error: HTTP status code %d'.format(message.status_code));
                    }
                });
            } catch(e) {
                reject(e.message);
            }
        });
    }

    _onModeChanged() {
        this._button.remove_style_class_name(this._tmpMode);
        this._button.add_style_class_name(this.proxymode);
        this._updateMenu();
    }

    _syncSubscribe() {
        Main.notify(Me.metadata.name, _('Start synchronizing.'));
        this._fetchSubs().then(scc => {
            this.subscache = scc;
            this._updateMenu();
            Main.notify(Me.metadata.name, _('Synchronized successfully.'));
        }).catch(err => {
            Main.notifyError(Me.metadata.name, err);
        });
    }

    _genConfig(config) {
        return new Promise((resolve, reject) => {
            try {
                let subs = this._subscache;
                let conf = { server: [], server_port: subs.port, password: subs.password, method: subs.encryption, };
                if(config) {
                    Object.assign(conf, config);
                    this.servername = config.remarks;
                    this._updateMenu();
                } else {
                    conf.server = subs.servers.map(x => x.server).filter(x => x != '127.0.0.1');
                }
                let local = { local_port: this.localport, timeout: this.localtime, };
                if(this.localaddr) local.local_address = this.localaddr;
                if(this.additions) Object.assign(local, JSON.parse(this.additions));
                Object.assign(conf, local);
                if(!this.filename) throw new Error(_('Config file is not set.'));
                Gio.File.new_for_path(this.filename).replace_contents(JSON.stringify(conf, null, 2), null, false, Gio.FileCreateFlags.PRIVATE, null);
                resolve();
            } catch(e) {
                reject(e.message);
            }
        });
    }

    _checkCache() {
        if(this.subscache) {
            return true;
        } else if(this.subslink) {
            this._syncSubscribe();
            return false;
        } else {
            return false;
        }
    }

    _restartService() {
        if(gsettings.get_boolean('gen-all')) {
            this._genConfig().then(() => { Util.spawnCommandLine(this.restart) });
        } else {
            let conf = this._subscache.servers.find(x => x.remarks == this.servername);
            if(conf) this._genConfig(conf).then(() => { Util.spawnCommandLine(this.restart); });
        }
    }

    _networkSetting() {
        let network = Shell.AppSystem.get_default().lookup_app('gnome-network-panel.desktop');
        if(network) network.activate();
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
        addButtonItem('view-refresh-symbolic', () => { item._getTopMenu().close(); this._restartService(); });
        addButtonItem('face-cool-symbolic', () => { this.litemode = !this.litemode; this._updateMenu(); });
        addButtonItem('network-workgroup-symbolic', () => { item._getTopMenu().close(); this._networkSetting(); });
        item.add_child(hbox);
        return item;
    }

    _proxyItems() {
        let items = [];
        for(let x in this.MODES) {
            let item = new PopupMenu.PopupMenuItem(this.MODES[x]);
            if(x === this.proxymode) {
                this._tmpMode = x;
                item.setOrnament(PopupMenu.Ornament.DOT);
            } else {
                item.connect("activate", () => { item._getTopMenu().close(); this.proxymode = x; });
            }
            items.push(item);
        }
        return items;
    }

    _updateMenu() {
        this._button.menu.removeAll();
        if(this.litemode) {
            this._proxyItems().forEach(item => { this._button.menu.addMenuItem(item); });
        } else {
            let proxy = new PopupMenu.PopupSubMenuMenuItem(_("Proxy: ") + this.MODES[this.proxymode]);
            this._proxyItems().forEach(item => { proxy.menu.addMenuItem(item); });
            this._button.menu.addMenuItem(proxy);

            if(this._checkCache()) {
                let subs = this._subscache;
                let servers = new PopupMenu.PopupSubMenuMenuItem(_('Airport: ') + "%d/%d".format(subs.traffic_used, subs.traffic_total));
                subs.servers.forEach(x => {
                    let item = new PopupMenu.PopupMenuItem(x.remarks, { style_class: 'ss-subscriber-item' });
                    if(x.remarks === this.servername) {
                        item.setOrnament(PopupMenu.Ornament.DOT);
                    } else {
                       item.connect("activate", () => { item._getTopMenu().close(); this._genConfig(x).then(() => { Util.spawnCommandLine(this.restart) }); });
                    }
                    servers.menu.addMenuItem(item);
                });
                this._button.menu.addMenuItem(servers);

                let sync = new PopupMenu.PopupMenuItem(_("Sync Subscription"));
                sync.connect("activate", () => { sync._getTopMenu().close(); this._syncSubscribe(); });
                this._button.menu.addMenuItem(sync);
            }
        }

        this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(''));
        this._button.menu.addMenuItem(this._settingItem());
    }

    _addIndicator() {
        this._button = new PanelMenu.Button(null);
        this._button.add_actor(new St.Icon({
            gicon: new Gio.FileIcon({ file: Gio.File.new_for_path(PAPER_PLANE_ICON) }),
            style_class: 'ss-subscriber system-status-icon'
        }));
        this._button.add_style_class_name(this.proxymode);
        Main.panel.addToStatusArea(Me.metadata.uuid, this._button);
        this._updateMenu();
    }

    enable() {
        this._bindSettings();
        this._addIndicator();
        this.proxymodeId = proxyGsettings.connect('changed::' + Fields.PROXYMODE, this._onModeChanged.bind(this));
    }

    disable() {
        if(this.proxymodeId)
            proxyGsettings.disconnect(this.proxymodeId), this.proxymodeId = 0;
        this._button.destroy();
        this._button = null;
    }
});

function init() {
    ExtensionUtils.initTranslations();
    return new Shadowsocks();
}
