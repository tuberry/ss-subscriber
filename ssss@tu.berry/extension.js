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

const PROXYMODES = { auto: _("Automatic"), manual: _("Manual"), none: _("Disable") };

const Shadowsocks = GObject.registerClass(
class Shadowsocks extends GObject.Object {
    _init() {
        super._init();
    }

    _loadSettings() {
        this._fetchSettings();
        this._subslinkId   = gsettings.connect(`changed::${Fields.SUBSLINK}`, () => { this._subslink = gsettings.get_string(Fields.SUBSLINK); });
        this._additionalId = gsettings.connect(`changed::${Fields.ADDITIONAL}`, () => { this._additional = gsettings.get_string(Fields.ADDITIONAL); });
        this._proxymodeID  = proxyGsettings.connect(`changed::${Fields.PROXYMODE}`, () => { this._changeMode(proxyGsettings.get_string(Fields.PROXYMODE)); });
        this._litemodeId = gsettings.connect(`changed::${Fields.LITEMODE}`, () => {
            this._litemode = gsettings.get_boolean(Fields.LITEMODE);
            this._updateMenu();
        });
    }

    _fetchSettings() {
        this._subslink   = gsettings.get_string(Fields.SUBSLINK);
        this._litemode   = gsettings.get_boolean(Fields.LITEMODE);
        this._subscache  = gsettings.get_string(Fields.SUBSCACHE);
        this._additional = gsettings.get_string(Fields.ADDITIONAL);
        this._servername = gsettings.get_string(Fields.SERVERNAME);
        this._proxymode  = proxyGsettings.get_string(Fields.PROXYMODE);
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
            if (message.status_code == 200) {
                this._parseSSD(message.response_body.data.trim());
            } else {
                Main.notifyError(Me.metadata.name, `Error: %s status code %d`.format(uri.scheme.toUpperCase(), message.status_code));
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
        this._genAll();
        Main.notify(Me.metadata.name, _('Synchronized successfully.'));
        this._updateMenu();
    }

    _addButton() {
        this._button = new PanelMenu.Button(null);
        this._button.add_actor(new St.Icon({ icon_name: 'applications-science-symbolic', style_class: 'ss-subscriber system-status-icon' }));
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
            for(let x in PROXYMODES) {
                let item = new PopupMenu.PopupMenuItem(PROXYMODES[x]);
                if(x === this._proxymode) {
                    item.setOrnament(PopupMenu.Ornament.DOT);
                } else {
                    item.connect("button-press-event", () => { this._changeMode(x); });
                }
                this._button.menu.addMenuItem(item);
            }
        } else {
            let proxy = new PopupMenu.PopupSubMenuMenuItem(_("Proxy: ") + PROXYMODES[this._proxymode]);
            for(let x in PROXYMODES) {
                let item = new PopupMenu.PopupMenuItem(PROXYMODES[x]);
                if(x === this._proxymode) {
                    item.setOrnament(PopupMenu.Ornament.DOT);
                } else {
                    item.connect("button-press-event", () => { this._changeMode(x); });
                }
                proxy.menu.addMenuItem(item);
            }
            proxy.menu.addSettingsAction(_("Network Settings"), 'gnome-network-panel.desktop');
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
                       item.connect("button-press-event", () => { this._genConfig(x); });
                    }
                    servers.menu.addMenuItem(item);
                });
                let sync = new PopupMenu.PopupMenuItem(_("Sync Subscription"));
                sync.connect("button-press-event", () => { this._syncSubscribe(); });
                this._button.menu.addMenuItem(sync);
            }
        }

        this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(''));

        this._button.menu.addMenuItem(this._settingItem());
    }

    _changeMode(mode) {
        if(mode === this._proxymode) return;
        this._button.remove_style_class_name(this._proxymode);
        this._button.add_style_class_name(mode);
        this._proxymode = mode;
        proxyGsettings.set_string(Fields.PROXYMODE, mode);
        this._updateMenu();
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
            let file = Gio.File.new_for_path('/etc/shadowsocks/ssss.json');
            file.replace_contents(JSON.stringify(conf, null, 2), null, false, Gio.FileCreateFlags.PRIVATE, null);
            Util.spawn(['systemctl', 'restart', 'shadowsocks-libev@ssss.service']);
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
        subs.servers.forEach(x => conf.server.push(x.server));
        conf.server_port = conf.server_port ? conf.server_port : subs.port;
        conf.password = conf.password ? conf.password : subs.password;
        conf.method = conf.method ? conf.method : subs.encryption;
        Object.assign(conf, JSON.parse(this._additional));
        try {
            let file = Gio.File.new_for_path('/etc/shadowsocks/ssss.json');
            file.replace_contents(JSON.stringify(conf, null, 2), null, false, Gio.FileCreateFlags.PRIVATE, null);
            Util.spawn(['systemctl', 'restart', 'shadowsocks-libev@ssss.service']);
        } catch(e) {
            Main.notifyError(Me.metadata.name, e.message);
        }
        this._servername = conf.remarks;
        gsettings.set_string(Fields.SERVERNAME, this._servername);
        this._updateMenu();
    }

    enable() {
        this._loadSettings();
        this._addButton();
    }

    disable() {
        for(let x in this)
            if(RegExp(/^_.+Id$/).test(x)) eval(`if(this.%s) gsettings.disconnect(this.%s), this.%s = 0;`.format(x, x, x));
        if(this._proxymodeID)
            proxyGsettings.disconnect(this._proxymodeID), this._proxymodeID = 0;
        this._button.destroy();
    }
});

function init() {
    return new Shadowsocks();
}
