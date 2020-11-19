// vim:fdm=syntax
// by tuberry
//
const { Gio, Gtk, GLib, GObject } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const _ = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;

const gsettings = ExtensionUtils.getSettings();

var Fields = {
    PROXYMODE:  'mode',
    LITEMODE:   'lite-mode',
    LOCALADDR:  'local-addr',
    LOCALPORT:  'local-port',
    FILENAME:   'config-file',
    LOCALTIME:  'local-timeout',
    SERVERNAME: 'server-remarks',
    SUBSLINK:   'subscribe-link',
    RESTART:    'restart-command',
    ADDITIONAL: 'addtional-config',
    ENABLEADD:  'enable-addtional',
    SUBSCACHE:  'subscribe-caches',
};

const Subscriber = GObject.registerClass(
class Subscriber extends Gtk.ScrolledWindow {
    _init() {
        super._init({
            vscrollbar_policy: Gtk.PolicyType.NEVER,
        });

        this._bulidWidget();
        this._bulidUI();
        this._bindValues();
        this._syncStatus();
        this.show_all();
    }

    _bulidWidget() {
        this._field_more_info  = this._labelMaker(_('See <span><a href="%s">%s</a></span> for pre-steps to use it.').format(Me.metadata.url, Me.metadata.url));
        this._field_filename   = new Gtk.FileChooserButton({ title: _('Choose the config file'), action: Gtk.FileChooserAction.SAVE });
        this._field_subs_link  = this._entryMaker('https://www.example.com', _('Subscription link (SSD only)'));
        this._field_restart    = new Gtk.Entry({ placeholder_text: 'systemctl --user restart shadowsocks@ssss.service' });
        this._field_enable_add = new Gtk.CheckButton({ active: gsettings.get_boolean(Fields.ENABLEADD), label: _('Addtional conf') });
        this._field_additional = new Gtk.Entry({ placeholder_text: '{ "fast_open": true }' });
        this._field_local_addr = new Gtk.Entry({ placeholder_text: 'local_address' });
        this._field_local_port = this._spinMaker(0, 65535, 1);
        this._field_local_time = this._spinMaker(200, 1000, 50);
    }

    _bulidUI() {
        this._box = new Gtk.Box({
            margin: 30,
            orientation: Gtk.Orientation.VERTICAL,
        });
        let btn = new Gtk.Button({ label: _('Restart') });
        btn.set_tooltip_text(_('Apply new conf then restart service'));
        btn.connect('clicked', this._updateConfig.bind(this));
        this.add(this._box);
        this._server = this._listFrameMaker(_('Server'), 0);
        this._server._add(this._field_subs_link);
        this._server._add(this._field_more_info);

        this._local = this._listFrameMaker(_('Local'), 20);
        this._local._add(this._labelMaker(_('Conf file')), this._field_filename);
        this._local._add(this._labelMaker(_('Timeout (ms)')), this._field_local_time);
        this._local._add(this._labelMaker(_('Address and port')), this._field_local_addr, this._field_local_port);
        this._local._add(this._field_enable_add, this._field_additional);
        this._local._add(btn, this._field_restart);
    }

    _bindValues() {
        gsettings.bind(Fields.ENABLEADD,  this._field_enable_add, 'active', Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.LOCALPORT,  this._field_local_port, 'value',  Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.LOCALTIME,  this._field_local_time, 'value',  Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.LOCALADDR,  this._field_local_addr, 'text',   Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.ADDITIONAL, this._field_additional, 'text',   Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.SUBSLINK,   this._field_subs_link,  'text',   Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.RESTART,    this._field_restart,    'text',   Gio.SettingsBindFlags.DEFAULT);
    }

    _syncStatus() {
        this._field_filename.set_filename(gsettings.get_string(Fields.FILENAME));
        this._field_filename.connect('file-set', widget => {
            gsettings.set_string(Fields.FILENAME, widget.get_filename());
        });
        this._toggleEditable(this._field_subs_link, !gsettings.get_string(Fields.SUBSLINK));
        this._field_enable_add.connect('notify::active', widget => {
            this._field_additional.set_sensitive(widget.active );
        });
        this._field_additional.set_sensitive(this._field_enable_add.active);
    }

    _toggleEditable(entry, edit) {
        entry.set_editable(edit);
        entry.secondary_icon_name = edit ? "document-edit-symbolic" : "action-unavailable-symbolic";
    }

    _updateConfig() {
        let [ok, content] = GLib.file_get_contents(gsettings.get_string(Fields.FILENAME));
        if(!ok) return;
        let conf = JSON.parse(content);
        Object.assign(conf, this._localConf);
        try {
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
        if(gsettings.get_boolean(Fields.ENABLEADD))
            try {
                Object.assign(local, JSON.parse(gsettings.get_string(Fields.ADDITIONAL)));
            } catch(e) {
                //
            }

        return local;
    }

    _listFrameMaker(lbl, margin_top) {
        let frame = new Gtk.Frame({
            label_yalign: 1,
        });
        frame.set_label_widget(new Gtk.Label({
            use_markup: true,
            margin_top: margin_top,
            label: "<b><big>" + lbl + "</big></b>",
        }));
        this._box.add(frame);

        frame.grid = new Gtk.Grid({
            margin: 10,
            hexpand: true,
            row_spacing: 12,
            column_spacing: 18,
            row_homogeneous: false,
            column_homogeneous: false,
        });

        frame.grid._row = 0;
        frame.add(frame.grid);
        frame._add = (x, y, z) => {
            const hbox = new Gtk.Box();
            if(z) {
                hbox.pack_start(x, true, true, 4);
                hbox.pack_start(y, false, false, 4);
                hbox.pack_start(z, false, false, 4);
            } else if(y) {
                let etr = (y instanceof Gtk.Entry) && !y.adjustment;
                hbox.pack_start(x, !etr, !etr, 4);
                hbox.pack_start(y, etr, etr, 4);
            } else {
                hbox.pack_start(x, true, true, 4);
            }
            frame.grid.attach(hbox, 0, frame.grid._row++, 1, 1);
        }
        return frame;
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

    _entryMaker(x, y) {
        let entry = new Gtk.Entry({
            hexpand: true,
            visibility: false,
            placeholder_text: x,
            secondary_icon_sensitive: true,
            secondary_icon_tooltip_text: y,
            secondary_icon_activatable: true,
            secondary_icon_name: "action-unavailable",
        });
        entry.connect('icon-press', () => {
            this._toggleEditable(entry, !entry.get_editable());
        });
        return entry;
    }
});

function buildPrefsWidget() {
    return new Subscriber();
}

function init() {
    ExtensionUtils.initTranslations();
}

