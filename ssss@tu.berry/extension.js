// vim:fdm=syntax
// by tuberry
const Main = imports.ui.main
const PanelMenu = imports.ui.panelMenu
const PopupMenu = imports.ui.popupMenu
const { Pango, GLib, GObject, Gio, St } = imports.gi

const proxyGsettings = new Gio.Settings({ schema_id: 'org.gnome.system.proxy' });
const ExtensionUtils = imports.misc.extensionUtils;
const gsettings = ExtensionUtils.getSettings();
const Me = ExtensionUtils.getCurrentExtension();
const _ = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;
const Fields = Me.imports.prefs.Fields;

const MODES = { auto: _("Automatic"), manual: _("Manual"), none: _("Disable") };

const Shadowsocks = GObject.registerClass(
class Shadowsocks extends GObject.Object {
    _init() {
        super._init();
    }

    _loadSettings() {
        this._fetchSettings();
        this._createButton();
        this._subslinkId = gsettings.connect(`changed::${Fields.SUBSLINK}`, () => this._subslink = gsettings.get_uint(Fields.SUBSLINK));
        this._maxlengthId = gsettings.connect(`changed::${Fields.MAXLENGTH}`, () => this._maxlength = gsettings.get_uint(Fields.MAXLENGTH));
        this._additionalId = gsettings.connect(`changed::${Fields.ADDITIONAL}`, () => this._additional = gsettings.get_uint(Fields.ADDITIONAL));
        this._proxymodeID = proxyGsettings.connect(`changed::${Fields.PROXYMODE}`, () => this._proxymode = MODES[proxyGsettings.get_string(Fields.PROXYMODE)]);
    }

    _fetchSettings() {
        this._maxlength = gsettings.get_uint(Fields.MAXLENGTH);
        this._subslink = gsettings.get_string(Fields.SUBSLINK);
        this._subscache = gsettings.get_string(Fields.SUBSCACHE);
        this._additional = gsettings.get_string(Fields.ADDITIONAL);
        this._servername = gsettings.get_string(Fields.SERVERNAME);
        this._proxymode = MODES[proxyGsettings.get_string(Fields.PROXYMODE)];
    }

    destroy() {
        for(let x in this) {
            if(RegExp(/^_.+Id$/).test(x))
                eval(`if(this.%s) gsettings.disconnect(this.%s), this.%s = 0;`.format(x, x, x));
        }
        if(this._proxymodeID)
            proxyGsettings.disconnect(this._proxymodeID), this._proxymodeID = 0;
        this._button.destroy();
    }

    _syncSubscribe() {
        if(!this._subslink) return;
        let proc = new Gio.Subprocess({
            argv: ['/bin/bash', '-c', 'curl -sL ' +  GLib.shell_quote(this._subslink)],
            flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
        });
        proc.init(null);
        proc.communicate_utf8_async(null, null, (proc, res) => {
            try {
                let [, stdout, stderr] = proc.communicate_utf8_finish(res);
                let ok = proc.get_exit_status() === 0;
                if(ok) {
                    this._parseSSD(stdout.trim());
                    Main.notifyError(Me.metadata.name, _('Synchronized successfully.'));
                } else {
                    Main.notifyError(Me.metadata.name, stderr.trim());
                }
            } catch(e) {
                Main.notifyError(Me.metadata.name, e.message);
            }
        });
    }

    _parseSSD(link) {
        const fix = x => x.replace(/-/g, '+').replace(/_/g, '/');
        const fill = x => x.length % 4 === 0 ? x : x + "=".repeat(4 - x.length % 4);
        const decode = x => eval("'" + GLib.base64_decode(fill(fix(x))) + "'");
        this._subscache = decode(link.slice(6)).replace(/\s/g, ' ');
        gsettings.set_string(Fields.SUBSCACHE, this._subscache);
        this._updateMenu();
    }

    _createButton() {
        this._button = new PanelMenu.Button(null);
        let hbox = new St.BoxLayout();
        let icon = new St.Icon({ icon_name: 'mail-send-symbolic', style_class: 'system-status-icon' });
        hbox.add_child(icon);
        this._button.actor.add_actor(hbox);
        this._button.actor.add_style_class_name('panel-status-button');
        this._button.actor.connect('button-press-event', this._updateMenu.bind(this));
        Main.panel.addToStatusArea('ssrs@tu.berry', this._button);
        this._updateMenu();
    }

    _checkCache() {
        if(this._subscache.length) {
            return true;
        } else if(this._subslink.length) {
            this._syncSubscribe();
            Main.notifyError(Me.metadata.name, _('Start synchronizing.'));
            return false;
        } else {
            Main.notifyError(Me.metadata.name, _('Subscription link is missing.'));
            return false;
        }
    }

    _updateMenu() {
        this._button.menu.removeAll();
        if(!this._checkCache()) return;
        let subs = JSON.parse(this._subscache);
        let servers = new PopupMenu.PopupSubMenuMenuItem(_('Airport: ') + subs.airport);
        this._button.menu.addMenuItem(servers);
        subs.servers.forEach(x => {
            let item = new PopupMenu.PopupMenuItem(x.remarks);
            if(this._maxlength >= 200)
                item.actor.style = 'max-width: %dpx'.format(this._maxlength);
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

        let proxy = new PopupMenu.PopupSubMenuMenuItem(_("Network: ") + this._proxymode);
        for(let x in MODES) {
            let item = new PopupMenu.PopupMenuItem(MODES[x]);
            item.connect("button_press_event", () => { proxyGsettings.set_string(Fields.PROXYMODE, x); });
            if(MODES[x] === this._proxymode) item.setOrnament(PopupMenu.Ornament.DOT);
            proxy.menu.addMenuItem(item);
        }
        proxy.menu.addSettingsAction(_("Network Settings"), 'gnome-network-panel.desktop');
        this._button.menu.addMenuItem(proxy);
    }

    _genConfig(conf) {
        let subs = JSON.parse(this._subscache);
        conf.server_port = subs.port;
        conf.password = subs.password;
        conf.method = subs.encryption;
        Object.assign(conf, JSON.parse(this._additional));
        try {
            let file = Gio.File.new_for_path('/etc/shadowsocks/ssss.json');
            file.replace_contents(JSON.stringify(conf, null, 2), null, false, Gio.FileCreateFlags.PRIVATE, null);
            let launch = new Gio.SubprocessLauncher({ flags: Gio.SubprocessFlags.NONE });
            launch.spawnv(['/bin/bash', '-c', 'systemctl restart shadowsocks-libev@ssss.service']);
        } catch(e) {
            Main.notifyError(Me.metadata.name, e.message);
        }
        this._servername = conf.remarks;
        gsettings.set_string(Fields.SERVERNAME, this._servername);
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
