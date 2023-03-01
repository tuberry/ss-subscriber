// vim:fdm=syntax
// by tuberry
/* exported init buildPrefsWidget */
'use strict';

const { Adw, Gio, Gtk, GLib, GObject } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const _ = ExtensionUtils.gettext;
const { Fields, Block } = Me.imports.fields;
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
        this._blk = new Block({
            port: [Fields.PORT,     'value', new UI.Spin(0, 65535, 1)],
            time: [Fields.TIME,     'value', new UI.Spin(0, 1000, 50)],
            file: [Fields.FILE,     'file',  new UI.File({ filter: 'application/json' })],
            add:  [Fields.ADDITION, 'text',  new UI.LazyEntry('{ "fast_open": true }', _('JSON format, can be blank'))],
            link: [Fields.LINK,     'text',  new UI.LazyEntry('https://www.example.com', _('Subscription link (SSD only)'))],
            exec: [Fields.RESTART,  'text',  new UI.LazyEntry('systemctl --user restart shadowsocks@ssss.service', _('Command to restart'))],
            addr: [Fields.ADDR,     'text',  new Gtk.Entry({ placeholder_text: 'local_address', tooltip_text: _('Can be blank'), valign: Gtk.Align.CENTER })],
        });
        this._blk.restart = new Gtk.Button({ label: _('Restart'), valign: Gtk.Align.CENTER });
        this._blk.restart.connect('clicked', () => this._updateConfig());
    }

    _buildUI() {
        [
            [[_('Subs link')],       this._blk.link],
            [[_('Conf file')],       this._blk.file],
            [[_('Timeout')],         this._blk.time],
            [[_('Addr &amp; port')], this._blk.addr, this._blk.port],
            [[_('Additional')],      this._blk.add],
            [this._blk.restart,      [], this._blk.exec],
        ].forEach(xs => this.add(new UI.PrefRow(...xs)));
    }

    async _updateConfig() {
        let file = Gio.File.new_for_path(this._blk.file.file);
        if(!file) return;
        let conf = JSON.parse(new TextDecoder().decode((await file.load_contents_async(null))[0]));
        let buffer = new TextEncoder().encode(JSON.stringify({
            ...conf,
            timeout: this._blk.time.value,
            local_port: this._blk.port.value,
            local_address: this._blk.addr.text || undefined,
            ...JSON.parse(this._blk.add.text || '{}'),
        }, null, 2));
        await file.replace_contents_async(buffer, null, false, Gio.FileCreateFlags.PRIVATE, null);
        let proc = new Gio.Subprocess({
            argv: GLib.shell_parse_argv(this._blk.exec.text)[1],
            flags: Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE,
        });
        proc.init(null);
    }
}
