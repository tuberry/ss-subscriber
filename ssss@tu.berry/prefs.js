// vim:fdm=syntax
// by tuberry
//
const { Gio, Gtk, GObject } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const _ = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;

const gsettings = ExtensionUtils.getSettings();

var Fields = {
    PROXYMODE:  'mode',
    HIDEICON:   'hide-indicator',
    SERVERNAME: 'server-remarks',
    SUBSLINK:   'subscribe-link',
    SUBSCACHE:  'subscribe-cache',
    ADDITIONAL: 'addtional-config',
};

const Subscriber = GObject.registerClass(
class Subscriber extends Gtk.Grid {
    _init() {
        super._init({
            margin: 10,
            row_spacing: 12,
            column_spacing: 18,
            row_homogeneous: false,
            column_homogeneous: false,
        });

        this._bulidWidget();
        this._bulidUI();
        this._bindValues();
        this.show_all();
    }

    _bulidWidget() {
        this._field_hide_icon  = new Gtk.Switch();
        this._field_subs_link  = this._entryMaker('https://www.example.com', _('Subscription link (SSD only)'));
        this._field_additional = this._entryMaker('{"local_port": 1874, "fast_open": true}', _('Local config (JSON format)'));
    }

    _bulidUI() {
        this._row = 0;
        this._rowMaker(this._labelMaker(_('Hide indicator')), this._field_hide_icon);
        this._rowMaker(this._field_subs_link);
        this._rowMaker(this._field_additional);
    }

    _bindValues() {
        gsettings.bind(Fields.ADDITIONAL, this._field_additional, 'text',   Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.HIDEICON,   this._field_hide_icon,  'active', Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.SUBSLINK,   this._field_subs_link,  'text',   Gio.SettingsBindFlags.DEFAULT);
    }

    _rowMaker(x, y, z) {
        let hbox = new Gtk.HBox({ hexpand: true });
        if(z) {
            hbox.pack_start(x, false, false, 10);
            hbox.pack_start(y, true, true, 10);
            hbox.pack_end(z, false, false, 10);
        } else if(y) {
            hbox.pack_start(x, true, true, 10);
            hbox.pack_start(y, false, false, 10);
        } else {
            hbox.pack_start(x, true, true, 10);
        }
        this.attach(hbox, 0, this._row++, 1, 1);
    }

    _entryMaker(x, y) {
        return new Gtk.Entry({
            placeholder_text: x,
            secondary_icon_sensitive: true,
            secondary_icon_tooltip_text: y,
            secondary_icon_activatable: true,
            secondary_icon_name: "dialog-information-symbolic",
        });
    }

    _spinMaker(l, u, s) {
        return new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: l,
                upper: u,
                step_increment: s,
            }),
        });
    }

    _labelMaker(x) {
        return new Gtk.Label({
            label: x,
            hexpand: true,
            use_markup: true,
            halign: Gtk.Align.START,
        });
    }
});

function buildPrefsWidget() {
    return new Subscriber();
}

function init() {
    ExtensionUtils.initTranslations();
}

