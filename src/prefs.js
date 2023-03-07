// vim:fdm=syntax
// by tuberry
/* exported init buildPrefsWidget */
'use strict';

const { Adw, Gtk, GObject } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const { _, dc, fl, execute, fread, fwrite } = Me.imports.util;
const { Field } = Me.imports.const;
const UI = Me.imports.ui;

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
        this._blk = new UI.Block({
            port: [Field.PORT,     'value', new UI.Spin(0, 65535, 1)],
            time: [Field.TIME,     'value', new UI.Spin(0, 1000, 50)],
            file: [Field.FILE,     'file',  new UI.File({ filter: 'application/json' })],
            add:  [Field.ADDITION, 'text',  new UI.LazyEntry('{ "fast_open": true }', _('JSON format, can be blank'))],
            link: [Field.LINK,     'text',  new UI.LazyEntry('https://www.example.com', _('Subscription link (SSD only)'))],
            exec: [Field.RESTART,  'text',  new UI.LazyEntry('systemctl --user restart shadowsocks@ssss.service', _('Command to restart'))],
            addr: [Field.ADDR,     'text',  new Gtk.Entry({ placeholder_text: 'local_address', tooltip_text: _('Can be blank'), valign: Gtk.Align.CENTER })],
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
        if(!this._blk.file.file) return;
        let file = fl(this._blk.file.file);
        let buffer = JSON.stringify({
            ...JSON.parse(dc((await fread(file)).at(0))),
            timeout: this._blk.time.value,
            local_port: this._blk.port.value,
            local_address: this._blk.addr.text || undefined,
            ...JSON.parse(this._blk.add.text || '{}'),
        }, null, 2);
        await fwrite(file, buffer);
        execute(this._blk.exec.text);
    }
}
