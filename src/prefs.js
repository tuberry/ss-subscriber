// vim:fdm=syntax
// by tuberry
/* exported init buildPrefsWidget */
'use strict';

const { Adw, Gtk, GObject } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const { _, dc, fl, execute, fread, fwrite } = Me.imports.util;
const UI = Me.imports.ui;

function buildPrefsWidget() {
    return new SimpleSubsPrefs();
}

function init() {
    ExtensionUtils.initTranslations();
}

class SimpleSubsPrefs extends Adw.PreferencesGroup {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super();
        this._buildWidgets();
        this._buildUI();
    }

    _buildWidgets() {
        this._blk = UI.block({
            PORT: ['value', new UI.Spin(0, 65535, 1)],
            TIME: ['value', new UI.Spin(0, 1000, 50)],
            FILE: ['value', new UI.File({ filter: { mime_types: ['application/json'] } })],
            ETR:  ['text',  new UI.LazyEntry('{ "fast_open": true }', _('JSON format, can be blank'))],
            LINK: ['text',  new UI.LazyEntry('https://www.example.com', _('Subscription link (SSD only)'))],
            RCMD: ['text',  new UI.LazyEntry('systemctl --user restart shadowsocks@ssss.service', _('Command to restart'))],
            ADDR: ['text',  new Gtk.Entry({ placeholder_text: 'local_address', tooltip_text: _('Can be blank'), valign: Gtk.Align.CENTER })],
        });
        this._blk.restart = new Gtk.Button({ label: _('Restart'), valign: Gtk.Align.CENTER });
        this._blk.restart.connect('clicked', () => this._updateConfig());
    }

    _buildUI() {
        [
            [[_('Subs link')],       this._blk.LINK],
            [[_('Conf file')],       this._blk.FILE],
            [[_('Timeout')],         this._blk.TIME],
            [[_('Addr &amp; port')], this._blk.ADDR, this._blk.PORT],
            [[_('Additional')],      this._blk.ETR],
            [this._blk.restart,      [], this._blk.RCMD],
        ].forEach(xs => this.add(new UI.PrefRow(...xs)));
    }

    async _updateConfig() {
        if(!this._blk.FILE.file) return;
        let conf = fl(this._blk.FILE.file);
        let buffer = JSON.stringify({
            ...JSON.parse(dc((await fread(conf)).at(0))),
            timeout: this._blk.TIME.value,
            local_port: this._blk.PORT.value,
            local_address: this._blk.ADDR.text || undefined,
            ...JSON.parse(this._blk.ETR.text || '{}'),
        }, null, 2);
        await fwrite(conf, buffer);
        execute(this._blk.RCMD.text);
    }
}
