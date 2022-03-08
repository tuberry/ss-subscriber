// vim:fdm=syntax
// by tuberry
/* exported init buildPrefsWidget */
'use strict';

const { Adw, Gio, Gtk, GLib, GObject } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const _ = ExtensionUtils.gettext;
const gsettings = ExtensionUtils.getSettings();
const Fields = Me.imports.fields.Fields;
const UI = Me.imports.ui;

Gio._promisify(Gio.File.prototype, 'replace_contents_async');
Gio._promisify(Gio.File.prototype, 'load_contents_async');

function buildPrefsWidget() {
    return new SSSubscriberPrefs();
}

function init() {
    ExtensionUtils.initTranslations();
}

class SSSubscriberPrefs extends Adw.PreferencesGroup {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super();
        this._buildWidgets();
        this._bindValues();
        this._buildUI();
    }

    _buildWidgets() {
        this._field_local_port = new UI.Spin(0, 65535, 1);
        this._field_local_time = new UI.Spin(0, 1000, 50);
        this._field_filename   = new UI.File({ filter: 'application/json' });
        this._restart_btn      = new Gtk.Button({ label: _('Resart'), valign: Gtk.Align.CENTER });
        this._field_additional = new UI.LazyEntry('{ "fast_open": true }', _('JSON format, can be blank'));
        this._field_subs_link  = new UI.LazyEntry('https://www.example.com', _('Subscription link (SSD only)'));
        this._field_restart    = new UI.LazyEntry('systemctl --user restart shadowsocks@ssss.service', _('Command to restart'));
        this._field_local_addr = new Gtk.Entry({ placeholder_text: 'local_address', tooltip_text: _('Can be blank'), valign: Gtk.Align.CENTER });
    }

    _buildUI() {
        [
            [[_('Subs link')], this._field_subs_link],
            [[_('Conf file')], this._field_filename],
            [[_('Timeout')], this._field_local_time],
            [[_('Addr &amp; port')], this._field_local_addr, this._field_local_port],
            [[_('Addtional')], this._field_additional],
        ].forEach(xs => this.add(new UI.PrefRow(...xs)));
        let row = new Adw.ActionRow();
        row.add_prefix(this._restart_btn);
        row.add_suffix(this._field_restart);
        row.set_activatable_widget(this._field_restart);
        this.add(row);
    }

    _bindValues() {
        [
            [Fields.PORT,     this._field_local_port, 'value'],
            [Fields.TIME,     this._field_local_time, 'value'],
            [Fields.FILE,     this._field_filename,   'file'],
            [Fields.ADDR,     this._field_local_addr, 'text'],
            [Fields.ADDITION, this._field_additional, 'text'],
            [Fields.LINK,     this._field_subs_link,  'text'],
            [Fields.RESTART,  this._field_restart,    'text'],
        ].forEach(xs => gsettings.bind(...xs, Gio.SettingsBindFlags.DEFAULT));
        this._restart_btn.connect('clicked', this._updateConfig.bind(this));
    }

    async _updateConfig() {
        let file = Gio.File.new_for_path(gsettings.get_string(Fields.FILE));
        if(!file) return;
        let conf = JSON.parse(new TextDecoder().decode((await file.load_contents_async(null))[0]));
        let buffer = new TextEncoder().encode(JSON.stringify({ ...conf, ...this._localConf }, null, 2));
        await file.replace_contents_async(buffer, null, false, Gio.FileCreateFlags.PRIVATE, null);
        let proc = new Gio.Subprocess({
            argv: GLib.shell_parse_argv(gsettings.get_string(Fields.RESTART))[1],
            flags: Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE,
        });
        proc.init(null);
    }

    get _localConf() {
        return {
            timeout: this._field_local_time.value,
            local_port: this._field_local_port.value,
            local_address: this._field_local_addr.text || undefined,
            ...JSON.parse(this._field_additional.text || '{}'),
        };
    }
}

