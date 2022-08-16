// vim:fdm=syntax
// by tuberry
/* exported init buildPrefsWidget */
'use strict';

const { Adw, Gio, Gtk, GLib, GObject } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const _ = ExtensionUtils.gettext;
const { Fields } = Me.imports.fields;
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
        this._buildUI();
    }

    _buildWidgets() {
        this.gset = ExtensionUtils.getSettings();
        this._restart_btn = new Gtk.Button({ label: _('Resart'), valign: Gtk.Align.CENTER });
        this._field = {
            PORT:     ['value', new UI.Spin(0, 65535, 1)],
            TIME:     ['value', new UI.Spin(0, 1000, 50)],
            FILE:     ['file',  new UI.File({ filter: 'application/json' })],
            ADDITION: ['text',  new UI.LazyEntry('{ "fast_open": true }', _('JSON format, can be blank'))],
            LINK:     ['text',  new UI.LazyEntry('https://www.example.com', _('Subscription link (SSD only)'))],
            RESTART:  ['text',  new UI.LazyEntry('systemctl --user restart shadowsocks@ssss.service', _('Command to restart'))],
            ADDR:     ['text',  new Gtk.Entry({ placeholder_text: 'local_address', tooltip_text: _('Can be blank'), valign: Gtk.Align.CENTER })],
        };
        Object.entries(this._field).forEach(([x, [y, z]]) => this.gset.bind(Fields[x], z, y, Gio.SettingsBindFlags.DEFAULT));
        this._restart_btn.connect('clicked', this._updateConfig.bind(this));
    }

    _buildUI() {
        [
            [[_('Subs link')],       this._field.LINK[1]],
            [[_('Conf file')],       this._field.FILE[1]],
            [[_('Timeout')],         this._field.TIME[1]],
            [[_('Addr &amp; port')], this._field.ADDR[1], this._field.PORT[1]],
            [[_('Addtional')],       this._field.ADDITION[1]],
        ].forEach(xs => this.add(new UI.PrefRow(...xs)));
        let row = new Adw.ActionRow();
        row.add_prefix(this._restart_btn);
        row.add_suffix(this._field.RESTART[1]);
        row.set_activatable_widget(this._field.RESTART[1]);
        this.add(row);
    }

    async _updateConfig() {
        let file = Gio.File.new_for_path(this.gset.get_string(Fields.FILE));
        if(!file) return;
        let conf = JSON.parse(new TextDecoder().decode((await file.load_contents_async(null))[0]));
        let buffer = new TextEncoder().encode(JSON.stringify({ ...conf, ...this._localConf }, null, 2));
        await file.replace_contents_async(buffer, null, false, Gio.FileCreateFlags.PRIVATE, null);
        let proc = new Gio.Subprocess({
            argv: GLib.shell_parse_argv(this.gset.get_string(Fields.RESTART))[1],
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
