// vim:fdm=syntax
// by tuberry
//
const Main = imports.ui.main
const ByteArray = imports.byteArray;
const PanelMenu = imports.ui.panelMenu
const PopupMenu = imports.ui.popupMenu
const { GLib, GObject, Soup, Gio, St } = imports.gi

const proxyGsettings = new Gio.Settings({ schema_id: 'org.gnome.system.proxy' });
const ExtensionUtils = imports.misc.extensionUtils;
const gsettings = ExtensionUtils.getSettings();
const Me = ExtensionUtils.getCurrentExtension();
const _ = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;
const Fields = Me.imports.prefs.Fields;

const unicode = x => x.includes('\\u') ? eval("'" + x + "'") : x;
const PROXYMODES = { auto: _("Automatic"), manual: _("Manual"), none: _("Disable") };

const Shadowsocks = GObject.registerClass(
class Shadowsocks extends GObject.Object {
    _init() {
        super._init();
    }

    _loadSettings() {
        this._fetchSettings();
        this._addButton(this._indicator ? unicode(this._indicator) : '\uF1D8');
        this._launcher     = new Gio.SubprocessLauncher({ flags: Gio.SubprocessFlags.NONE });
        this._subslinkId   = gsettings.connect(`changed::${Fields.SUBSLINK}`, () => this._subslink = gsettings.get_uint(Fields.SUBSLINK));
        this._additionalId = gsettings.connect(`changed::${Fields.ADDITIONAL}`, () => this._additional = gsettings.get_uint(Fields.ADDITIONAL));
        this._proxymodeID  = proxyGsettings.connect(`changed::${Fields.PROXYMODE}`, () => this._changeMode(proxyGsettings.get_string(Fields.PROXYMODE)));
        this._hidetextId = gsettings.connect(`changed::${Fields.HIDETEXT}`, () => { gsettings.get_boolean(Fields.HIDETEXT) ? this._button.hide() : this._button.show(); });
        this._indicatorId  = gsettings.connect(`changed::${Fields.INDICATOR}`, () => {
            this._indicator = gsettings.get_string(Fields.INDICATOR);
            this._text.set_text(this._indicator ? unicode(this._indicator) : '\uF1D8');
        });
    }

    _fetchSettings() {
        this._subslink   = gsettings.get_string(Fields.SUBSLINK);
        this._indicator  = gsettings.get_string(Fields.INDICATOR);
        this._subscache  = gsettings.get_string(Fields.SUBSCACHE);
        this._additional = gsettings.get_string(Fields.ADDITIONAL);
        this._servername = gsettings.get_string(Fields.SERVERNAME);
        this._proxymode  = proxyGsettings.get_string(Fields.PROXYMODE);
    }

    destroy() {
        for(let x in this)
            if(RegExp(/^_.+Id$/).test(x)) eval(`if(this.%s) gsettings.disconnect(this.%s), this.%s = 0;`.format(x, x, x));
        if(this._proxymodeID)
            proxyGsettings.disconnect(this._proxymodeID), this._proxymodeID = 0;
        this._launcher = null;
        this._text.destroy();
        this._button.destroy();
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
        session.queue_message(request, ((session, message) => {
            if (message.status_code == 200) {
                this._parseSSD(message.response_body.data.trim());
                Main.notify(Me.metadata.name, _('Synchronized successfully.'));
            } else {
                Main.notifyError(Me.metadata.name, `Error: %s status code %d`.format(uri.scheme.toUpperCase(), message.status_code));
            }
        }));
    }

    _parseSSD(link) {
        const fix = x => x.replace(/-/g, '+').replace(/_/g, '/');
        const fill = x => x.length % 4 === 0 ? x : x + "=".repeat(4 - x.length % 4);
        const decode = x => eval("'" + ByteArray.toString(GLib.base64_decode(fill(fix(x)))) + "'");
        let subscribe = decode(link.slice(6)).replace(/\s/g, ' ');

        this._subscache = decode(link.slice(6)).replace(/\s/g, ' ');
        gsettings.set_string(Fields.SUBSCACHE, this._subscache);
        this._updateMenu();
    }

    _addButton(txt) {
        this._button = new PanelMenu.Button(null);
        this._text = new St.Label({ text: txt, style_class: `ss-subscriber-text-${this._proxymode} ss-subscriber-text` });
        this._button.add_actor(this._text);
        Main.panel.addToStatusArea('ssrs@tu.berry', this._button);
        gsettings.get_boolean(Fields.HIDETEXT) ? this._button.hide() : this._button.show();
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

    _updateMenu() {
        this._button.menu.removeAll();
        if(this._checkCache()) {
            let subs = JSON.parse(this._subscache);
            let servers = new PopupMenu.PopupSubMenuMenuItem(_('Airport: ') + subs.airport);
            this._button.menu.addMenuItem(servers);
            subs.servers.forEach(x => {
                let item = new PopupMenu.PopupMenuItem(x.remarks, { style_class: 'ss-subscriber-item' });
                if(x.remarks === this._servername) {
                    item.setOrnament(PopupMenu.Ornament.DOT);
                } else {
                   item.connect("button_press_event", () => this._genConfig(x));
                }
                servers.menu.addMenuItem(item);
            });
            let sync = new PopupMenu.PopupMenuItem(_("Sync Subscription"));
            sync.connect("button_press_event", () => this._syncSubscribe());
            this._button.menu.addMenuItem(sync);
        }

        let proxy = new PopupMenu.PopupSubMenuMenuItem(_("Proxy: ") + PROXYMODES[this._proxymode]);
        for(let x in PROXYMODES) {
            let item = new PopupMenu.PopupMenuItem(PROXYMODES[x]);
            if(x === this._proxymode) {
                item.setOrnament(PopupMenu.Ornament.DOT);
            } else {
                item.connect("button_press_event", () => this._changeMode(x));
            }
            proxy.menu.addMenuItem(item);
        }
        proxy.menu.addSettingsAction(_("Network Settings"), 'gnome-network-panel.desktop');
        this._button.menu.addMenuItem(proxy);

        this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(''));

        let setting = new PopupMenu.PopupMenuItem(_("Settings"));
        setting.connect("button_press_event", () => { this._launcher.spawnv(['gnome-extensions', 'prefs', 'ssss@tu.berry']); });
        this._button.menu.addMenuItem(setting);
    }

    _changeMode(mode) {
        if(mode === this._proxymode) return;
        this._text.remove_style_class_name(`ss-subscriber-text-${this._proxymode}`);
        this._text.add_style_class_name(`ss-subscriber-text-${mode}`);
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
            this._launcher.spawnv(['systemctl', 'restart', 'shadowsocks-libev@ssss.service']);
        } catch(e) {
            Main.notifyError(Me.metadata.name, e.message);
        }
        this._servername = conf.remarks;
        gsettings.set_string(Fields.SERVERNAME, this._servername);
        this._updateMenu();
    }

    enable() {
        this._loadSettings();
    }

    disable() {
        this.destroy();
    }
});

function init() {
    return new Shadowsocks();
}
