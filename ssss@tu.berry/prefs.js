// vim:fdm=syntax
// by tuberry
//
const { Gio, Gtk, GLib, GObject } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const _ = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;
const gsettings = ExtensionUtils.getSettings();
const UI = Me.imports.ui;

var Fields = {
    PROXYMODE:  'mode',
    LITEMODE:   'lite-mode',
    LOCALADDR:  'local-addr',
    LOCALPORT:  'local-port',
    FILENAME:   'config-file',
    LOCALTIME:  'local-timeout',
    AUTOSUBS:   'auto-subscribe',
    SERVERNAME: 'server-remarks',
    SUBSLINK:   'subscribe-link',
    RESTART:    'restart-command',
    ADDITIONAL: 'addtional-config',
    SUBSCACHE:  'subscribe-caches',
};

function buildPrefsWidget() {
    return new SSSubscriberPrefs();
}

function init() {
    ExtensionUtils.initTranslations();
}

const SSSubscriberPrefs = GObject.registerClass(
class SSSubscriberPrefs extends Gtk.ScrolledWindow {
    _init() {
        super._init({
            vscrollbar_policy: Gtk.PolicyType.NEVER,
        });

        this._bulidUI();
        this._bindValues();
        this.show_all();
    }

    _bulidUI() {
        this._field_local_port = new UI.Spin(0, 65535, 1);
        this._field_local_time = new UI.Spin(0, 1000, 50);
        this._field_local_addr = new UI.Entry('local_address', _('Can be blank'), true);
        this._field_auto_subs  = new UI.Check(_('Auto update subscription (not config file)'));
        this._field_additional = new UI.Entry('{ "fast_open": true }', _('JSON format, can be blank'));
        this._field_subs_link  = this._linkMaker('https://www.example.com', _('Subscription link (SSD only)'));
        this._field_filename   = new UI.FileButton(gsettings.get_string(Fields.FILENAME), { filter: 'application/json' });
        this._field_restart    = new UI.Entry('systemctl --user restart shadowsocks@ssss.service', _('Command to restart'));
        this._field_more_info  = this._labelMaker(_('See <span><a href="%s">%s</a></span> for pre-steps to use it.').format(Me.metadata.url, Me.metadata.url));

        let grid = new UI.ListGrid();
        grid._add(this._field_auto_subs);
        grid._att(new UI.Label(_('Subs link'), true), this._field_subs_link);
        grid._add(new UI.Label(_('Conf file')), this._field_filename);
        grid._add(new UI.Label(_('Timeout')), this._field_local_time);
        grid._add(new UI.Label(_('Address and port')), this._field_local_addr, this._field_local_port);
        grid._att(new UI.Label(_('Addtional'), true), this._field_additional);
        let btn = new Gtk.Button({ label: _('Apply') });
        btn.set_tooltip_text(_('Apply new config then restart service'));
        btn.connect('clicked', this._updateConfig.bind(this));
        grid._att(btn, this._field_restart);
        grid._add(this._field_more_info);
        this.add(new UI.Frame(grid));
    }

    _bindValues() {
        gsettings.bind(Fields.AUTOSUBS,   this._field_auto_subs, 'active',  Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.LOCALPORT,  this._field_local_port, 'value',  Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.LOCALTIME,  this._field_local_time, 'value',  Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.LOCALADDR,  this._field_local_addr, 'text',   Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.ADDITIONAL, this._field_additional, 'text',   Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.SUBSLINK,   this._field_subs_link,  'text',   Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.RESTART,    this._field_restart,    'text',   Gio.SettingsBindFlags.DEFAULT);

        this._field_subs_link.set_edit(!gsettings.get_string(Fields.SUBSLINK));
    }

    _updateConfig() {
        let [ok, content] = GLib.file_get_contents(gsettings.get_string(Fields.FILENAME));
        if(!ok) return;
        try {
            let conf = JSON.parse(content);
            Object.assign(conf, this._localConf);
            let file = Gio.File.new_for_path(gsettings.get_string(Fields.FILENAME));
            file.replace_contents(JSON.stringify(conf, null, 2), null, false, Gio.FileCreateFlags.PRIVATE, null);
            let proc = new Gio.Subprocess({
                argv: ['/bin/bash', '-c', gsettings.get_string(Fields.RESTART)],
                flags: Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE
            });
            proc.init(null);
        } catch(e) {
            //
        }
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
                //
            }
        return local;
    }

    _labelMaker(x, y) {
        return new Gtk.Label({
            label: x,
            use_markup: true,
            hexpand: y ? false : true,
            halign: Gtk.Align.START,
        });
    }

    _linkMaker(x, y) {
        let entry = new UI.Entry(x, y);
        entry.set_visibility(false);
        return entry;
    }
});

