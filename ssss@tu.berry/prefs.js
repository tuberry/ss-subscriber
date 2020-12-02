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
    AUTOSUBS:   'auto-subscribe',
    SERVERNAME: 'server-remarks',
    SUBSLINK:   'subscribe-link',
    RESTART:    'restart-command',
    ADDITIONAL: 'addtional-config',
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
        this._field_local_port = this._spinMaker(0, 65535, 1);
        this._field_local_time = this._spinMaker(0, 1000, 50);
        this._field_local_addr = this._entryMaker('local_address', _('Can be blank'), true);
        this._field_filename   = this._fileChooser(_('Choose the config file'), 'application/json');
        this._field_additional = this._entryMaker('{ "fast_open": true }', _('JSON format, can be blank'));
        this._field_subs_link  = this._linkMaker('https://www.example.com', _('Subscription link (SSD only)'));
        this._field_restart    = this._entryMaker('systemctl --user restart shadowsocks@ssss.service', _('Command to restart'));
        this._field_more_info  = this._labelMaker(_('See <span><a href="%s">%s</a></span> for pre-steps to use it.').format(Me.metadata.url, Me.metadata.url));
        this._field_auto_subs  = new Gtk.CheckButton({ label: _('Auto update subscription (not config file)'), hexpand: true });
    }

    _bulidUI() {
        this._box = new Gtk.Box({
            margin: 30,
            orientation: Gtk.Orientation.VERTICAL,
        });
        this.add(this._box);
        this._server = this._listFrameMaker(_('Server'), 0);
        this._server._add(this._field_auto_subs);
        this._server._att(this._labelMaker(_('Subs link'), true), this._field_subs_link);
        this._server._add(this._field_more_info);

        this._local = this._listFrameMaker(_('Local'), 20);
        this._local._add(this._labelMaker(_('Conf file')), this._field_filename);
        this._local._add(this._labelMaker(_('Timeout')), this._field_local_time);
        this._local._add(this._labelMaker(_('Address and port')), this._field_local_addr, this._field_local_port);
        this._local._att(this._labelMaker(_('Addtional'), true), this._field_additional);

        let btn = new Gtk.Button({ label: _('Apply') });
        btn.set_tooltip_text(_('Apply new config then restart service'));
        btn.connect('clicked', this._updateConfig.bind(this));
        this._local._att(btn, this._field_restart);
    }

    _bindValues() {
        gsettings.bind(Fields.AUTOSUBS,   this._field_auto_subs, 'active',  Gio.SettingsBindFlags.DEFAULT);
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
    }

    _toggleEditable(entry, edit) {
        entry.set_editable(edit);
        entry.secondary_icon_name = edit ? "document-edit-symbolic" : "action-unavailable-symbolic";
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
            hbox.pack_start(x, true, true, 0);
            if(y) hbox.pack_start(y, false, false, 4)
            if(z) hbox.pack_start(z, false, false, 4)
            frame.grid.attach(hbox, 0, frame.grid._row++, 2, 1);
        }
        frame._att = (x, y) => {
            let r = frame.grid._row++;
            frame.grid.attach(x, 0, r, 1, 1);
            frame.grid.attach(y, 1, r, 1, 1);
        }

        return frame;
    }

    _fileChooser(title, mime) {
        let filter = new Gtk.FileFilter();
        filter.add_mime_type(mime);
        return new Gtk.FileChooserButton({
            title: title,
            filter: filter,
            action: Gtk.FileChooserAction.OPEN,
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

    _labelMaker(x, y) {
        return new Gtk.Label({
            label: x,
            use_markup: true,
            hexpand: y ? false : true,
            halign: Gtk.Align.START,
        });
    }

    _linkMaker(x, y) {
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

    _entryMaker(x, y, z) {
        let entry = new Gtk.Entry({
            placeholder_text: x,
            hexpand: z ? false : true,
            secondary_icon_sensitive: true,
            secondary_icon_tooltip_text: y,
            secondary_icon_activatable: true,
            secondary_icon_name: "dialog-information-symbolic",
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

