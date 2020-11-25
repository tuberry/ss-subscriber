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

    get _proxymode() {
        return proxyGsettings.get_string(Fields.PROXYMODE);
    }

    set _proxymode(mode) {
        proxyGsettings.set_string(Fields.PROXYMODE, mode);
    }

    set _subscache(cache) {
        gsettings.set_string(Fields.SUBSCACHE, cache);
        if(gsettings.get_boolean('gen-all')) this._genConfig();
    }

    set _servername(name) {
        gsettings.set_string(Fields.SERVERNAME, name);
    }

    _fetchSubs() {
        return new Promise((resolve, reject) => {
            try{
                if(!this._subslink) reject(_('Subscription link is missing.'));
                let session = new Soup.SessionAsync();
                Soup.Session.prototype.add_feature.call(session, new Soup.ProxyResolverDefault());
                let uri = new Soup.URI(this._subslink);
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
        this._button.add_style_class_name(this._proxymode);
        this._updateMenu();
    }

    _syncSubscribe() {
        Main.notify(Me.metadata.name, _('Start synchronizing.'));
        this._fetchSubs().then(scc => {
            this._subscache = scc;
            this._updateMenu();
            Main.notify(Me.metadata.name, _('Synchronized successfully.'));
        }).catch(err => {
            Main.notifyError(Me.metadata.name, err);
        });
    }

    _genConfig(config) {
        return new Promise((resolve, reject) => {
            try {
                let subs = JSON.parse(this._subscache);
                let conf = { server: [], server_port: subs.port, password: subs.password, method: subs.encryption, };
                if(config) {
                    Object.assign(conf, config);
                } else {
                    conf.server = subs.servers.map(x => x.server).filter(x => x != '127.0.0.1');
                }
                let local = { local_port: gsettings.get_uint(Fields.LOCALPORT), timeout: gsettings.get_uint(Fields.LOCALTIME), };
                if(gsettings.get_string(Fields.LOCALADDR))
                    local.local_address = gsettings.get_string(Fields.LOCALADDR);
                if(gsettings.get_string(Fields.ADDITIONAL))
                    Object.assign(local, JSON.parse(gsettings.get_string(Fields.ADDITIONAL)));
                Object.assign(conf, local);
                let filename = gsettings.get_string(Fields.FILENAME);
                if(!filename) throw new Error(_('Config file is not set'));
                Gio.File.new_for_path(filename).replace_contents(JSON.stringify(conf, null, 2), null, false, Gio.FileCreateFlags.PRIVATE, null);
                resolve();
            } catch(e) {
                reject(e.message);
            }
        });
    }

    _checkCache() {
        if(this._subscache) {
            return true;
        } else if(this._subslink) {
            this._syncSubscribe();
            return false;
        } else {
            return false;
        }
    }

    _restart() {
        Util.spawnCommandLine(gsettings.get_string(Fields.RESTART));
    }

    _restartService() {
        if(gsettings.get_boolean('gen-all')) {
            this._genConfig().then(this._restart);
        } else {
            let conf = JSON.parse(this._subscache).servers.find(x => x.remarks == this._servername);
            if(conf) this._genConfig(conf).then(this._restart);
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
        addButtonItem('face-cool-symbolic', () => { gsettings.set_boolean(Fields.LITEMODE, !this._litemode); this._updateMenu(); });
        addButtonItem('network-workgroup-symbolic', () => { item._getTopMenu().close(); this._networkSetting(); });
        item.add_child(hbox);
        return item;
    }

    _proxyItems() {
        let items = [];
        for(let x in this.MODES) {
            let item = new PopupMenu.PopupMenuItem(this.MODES[x]);
            if(x === this._proxymode) {
                this._tmpMode = x;
                item.setOrnament(PopupMenu.Ornament.DOT);
            } else {
                item.connect("activate", () => { item._getTopMenu().close(); this._proxymode = x; });
            }
            items.push(item);
        }
        return items;
    }

    _updateMenu() {
        this._button.menu.removeAll();
        if(this._litemode) {
            this._proxyItems().forEach(item => { this._button.menu.addMenuItem(item); });
        } else {
            let proxy = new PopupMenu.PopupSubMenuMenuItem(_("Proxy: ") + this.MODES[this._proxymode]);
            this._proxyItems().forEach(item => { proxy.menu.addMenuItem(item); });
            this._button.menu.addMenuItem(proxy);

            if(this._checkCache()) {
                let subs = JSON.parse(this._subscache);
                let servers = new PopupMenu.PopupSubMenuMenuItem(_('Airport: ') + "%d/%d".format(subs.traffic_used, subs.traffic_total));
                subs.servers.forEach(x => {
                    let item = new PopupMenu.PopupMenuItem(x.remarks, { style_class: 'ss-subscriber-item' });
                    if(x.remarks === this._servername) {
                        item.setOrnament(PopupMenu.Ornament.DOT);
                    } else {
                       item.connect("activate", () => { item._getTopMenu().close(); this._genConfig(x).then(this._restart); });
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
        if(this._autosubs) this._fetchSubs().then(scc => { this._subscache = scc; });
        this._proxymodeID = proxyGsettings.connect('changed::' + Fields.PROXYMODE, this._onModeChanged.bind(this));
        this._addButton();
    }

    disable() {
        if(this._proxymodeID)
            proxyGsettings.disconnect(this._proxymodeID), this._proxymodeID = 0;
        this._button.destroy();
    }
});

function init() {
    ExtensionUtils.initTranslations();
    return new Shadowsocks();
}
