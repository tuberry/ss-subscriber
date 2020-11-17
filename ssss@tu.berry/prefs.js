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
    LITEMODE:   'lite-mode',
    FILENAME:   'config-file',
    SERVERNAME: 'server-remarks',
    SUBSLINK:   'subscribe-link',
    RESTART:    'restart-command',
    SUBSCACHE:  'subscribe-cache',
    ADDITIONAL: 'addtional-config',
};

const Subscriber = GObject.registerClass(
class Subscriber extends Gtk.Grid {
    _init() {
        super._init({
            margin: 30,
            row_spacing: 12,
            column_spacing: 18,
            row_homogeneous: false,
            column_homogeneous: false,
        });

        this._bulidWidget();
        this._bulidUI();
        this._bindValues();
        this._syncStatus();
        this.show_all();
    }

    _bulidWidget() {
        this._field_filename   = new Gtk.FileChooserButton({ title: _('Choose the config file'), action: Gtk.FileChooserAction.SAVE });
        this._field_subs_link  = this._entryMaker('https://www.example.com',                 _('Subscription link (SSD only)'));
        this._field_additional = this._entryMaker('{"local_port": 1874, "fast_open": true}', _('Local config (JSON format)'));
        this._field_restart    = this._entryMaker('systemctl --user restart shadowsocks@ssss.service', _('Command to restart the service'));
        this._field_more_info  = this._labelMaker(_('See <span><a href="%s">%s</a></span> for pre-steps to use it.').format(Me.metadata.url, Me.metadata.url));
    }

    _bulidUI() {
        this._row = 0;
        this._rowMaker(this._labelMaker(_('Config file')), this._field_filename);
        this._rowMaker(this._field_subs_link);
        this._rowMaker(this._field_additional);
        this._rowMaker(this._field_restart);
        this._rowMaker(this._field_more_info);
    }

    _bindValues() {
        gsettings.bind(Fields.ADDITIONAL, this._field_additional, 'text',   Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.SUBSLINK,   this._field_subs_link,  'text',   Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.RESTART,    this._field_restart,    'text',   Gio.SettingsBindFlags.DEFAULT);
    }

    _syncStatus() {
        this._field_filename.set_filename(gsettings.get_string(Fields.FILENAME));
        this._field_filename.connect('file-set', widget => {
            gsettings.set_string(Fields.FILENAME, widget.get_filename());
        });
        this._field_subs_link.set_visibility(false);
        this._field_subs_link.connect('icon-press', () => {
            this._field_subs_link.set_visibility(!this._field_subs_link.get_visibility());
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
});

function buildPrefsWidget() {
    return new Subscriber();
}

function init() {
    ExtensionUtils.initTranslations();
}

