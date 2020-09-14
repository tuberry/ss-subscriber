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
const _ = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;
const Fields = Me.imports.prefs.Fields;

const PAPER_PLANE_ICON = Me.dir.get_child('icons').get_child('paper-plane-symbolic.svg').get_path();
const newFile = x => Gio.File.new_for_path(GLib.build_filenamev([GLib.get_user_config_dir()].concat(x)));
const base64rgx = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/

const Shadowsocks = GObject.registerClass(
class Shadowsocks extends GObject.Object {
    _init() {
        super._init();
        this.PROXYMODES = { auto: _('Automatic'), manual: _('Manual'), none: _('Disable') };
    }

    _loadSettings() {
    }

    get _subslink() {
        return gsettings.get_string(Fields.SUBSLINK);
    }

    get _subscache() {
        return gsettings.get_string(Fields.SUBSCACHE);
    }

    get _litemode() {
        return gsettings.get_boolean(Fields.LITEMODE);
    }

    get _servername() {
        return gsettings.get_string(Fields.SERVERNAME) || 'NONE';
    }

    get _additional() {
        return gsettings.get_string(Fields.ADDITIONAL);
    }

    get _proxymode() {
        return proxyGsettings.get_string(Fields.PROXYMODE);
    }

    set _proxymode(mode) {
        proxyGsettings.set_string(Fields.PROXYMODE, mode);
    }

    _onModeChanged() {
        this._button.remove_style_class_name(this._tmpMode);
        this._button.add_style_class_name(this._proxymode);
        this._updateMenu();
    }

    _syncSubscribe() {
        if(!this._subslink) {
            this._subscache = '';
            gsettings.set_string(Fields.SUBSCACHE, '');
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

    _parseSSD(subs) {
        if(!subs) {
            Main.notifyError(Me.metadata.name, _('Error: Subscription content is empty.'));
            return;
        }
        const fix = x => x.replace(/-/g, '+').replace(/_/g, '/');
        const fill = x => x.length % 4 === 0 ? x : x + "=".repeat(4 - x.length % 4);
        const decode = x => eval("'" + ByteArray.toString(GLib.base64_decode(fill(fix(x)))) + "'");

        this._subscache = decode(subs.slice(6)).replace(/\s/g, ' ');
        gsettings.set_string(Fields.SUBSCACHE, this._subscache);
        if(gsettings.get_boolean('gen-all')) this._genAll();
        Main.notify(Me.metadata.name, _('Synchronized successfully.'));
        this._updateMenu();
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

    _settingItem() {
        let item = new PopupMenu.PopupBaseMenuItem({ style_class: 'ss-subscriber-item', hover: false });
        let hbox = new St.BoxLayout({ x_align: St.Align.START, x_expand: true });
        let addButtonItem = (icon, func) => {
            let btn = new St.Button({
                hover: true,
                x_expand: true,
                style_class: 'ss-subscriber-button',
                child: new St.Icon({ icon_name: icon, style_class: 'popup-menu-icon', }),
            });
            btn.connect('clicked', func);
            hbox.add_child(btn);
        }
        addButtonItem('emblem-system-symbolic', () => { item._getTopMenu().close(); ExtensionUtils.openPrefs(); });
        addButtonItem('view-refresh-symbolic', () => {
            item._getTopMenu().close();
            let shadowsocks = 'shadowsocks-libev@%s.service'.format(gsettings.get_boolean('gen-all') ? 'whoami' : 'ssss');
            Util.spawn(['systemctl', '--user', 'restart', shadowsocks]);
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
            for(let x in this.PROXYMODES) {
                let item = new PopupMenu.PopupMenuItem(this.PROXYMODES[x]);
                if(x === this._proxymode) {
                    this._tmpMode = x;
                    item.setOrnament(PopupMenu.Ornament.DOT);
                } else {
                    item.connect("activate", () => { item._getTopMenu().close(); this._proxymode = x; });
                }
                this._button.menu.addMenuItem(item);
            }
        } else {
            let proxy = new PopupMenu.PopupSubMenuMenuItem(_("Proxy: ") + this.PROXYMODES[this._proxymode]);
            for(let x in this.PROXYMODES) {
                let item = new PopupMenu.PopupMenuItem(this.PROXYMODES[x]);
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
                let servers = new PopupMenu.PopupSubMenuMenuItem(_('Airport: ') + subs.airport);
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

    _genConfig(config) {
        let conf = {};
        let subs = JSON.parse(this._subscache);
        conf.server_port = conf.server_port ? conf.server_port : subs.port;
        conf.password = conf.password ? conf.password : subs.password;
        conf.method = conf.method ? conf.method : subs.encryption;
        Object.assign(conf, config);
        Object.assign(conf, JSON.parse(this._additional));
        try {
            let file = newFile(['shadowsocks', 'ssss.json']);
            file.replace_contents(JSON.stringify(conf, null, 2), null, false, Gio.FileCreateFlags.PRIVATE, null);
            Util.spawn(['systemctl',  '--user', 'restart', 'shadowsocks-libev@ssss.service']);
        } catch(e) {
            Main.notifyError(Me.metadata.name, e.message);
        }
        this._servername = conf.remarks;
        gsettings.set_string(Fields.SERVERNAME, this._servername);
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
        Object.assign(conf, JSON.parse(this._additional));
        try {
            let file = newFile(['shadowsocks', 'whoami.json']);
            file.replace_contents(JSON.stringify(conf, null, 2), null, false, Gio.FileCreateFlags.PRIVATE, null);
            Util.spawn(['systemctl', '--user', 'restart', 'shadowsocks-libev@whoami.service']);
        } catch(e) {
            Main.notifyError(Me.metadata.name, e.message);
        }
    }

    enable() {
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
