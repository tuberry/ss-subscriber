// vim:fdm=syntax
// by tuberry
/* exported init */
'use strict';

const Main = imports.ui.main;
const Util = imports.misc.util;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const { GLib, GObject, Soup, Gio, St } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const _ = ExtensionUtils.gettext;
const Me = ExtensionUtils.getCurrentExtension();
const { Fields, Field } = Me.imports.fields;
const Mode = { auto: 0, manual: 1, none: 2, 0: 'auto', 1: 'manual', 2: 'none' };

const noop = () => {};
const dc = x => new TextDecoder().decode(x);
const ec = x => new TextEncoder().encode(x);
const genIcon = x => Gio.Icon.new_for_string(Me.dir.get_child('icons').get_child(`${x}.svg`).get_path());

Gio._promisify(Gio.File.prototype, 'load_contents_async');
Gio._promisify(Gio.File.prototype, 'replace_contents_async');

class MenuItem extends PopupMenu.PopupMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(text, callback, params) {
        super(text, params);
        this.connect('activate', callback);
    }

    setLabel(label) {
        if(this.label.text !== label) this.label.set_text(label);
    }
}

class DRadioItem extends PopupMenu.PopupSubMenuMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(name, list, index, cb1, cb2) {
        super('');
        this._name = name;
        this._cb1 = cb1;
        this._cb2 = cb2 || (x => this._list[x]);
        this.setList(list, index);
    }

    setSelected(index) {
        this._index = index;
        this.label.set_text(`${this._name}：${this._cb2(this._index) || ''}`);
        this.menu._getMenuItems().forEach((y, i) => y.setOrnament(index === i ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE));
    }

    setList(list, index) {
        let items = this.menu._getMenuItems();
        let diff = list.length - items.length;
        if(diff > 0) for(let a = 0; a < diff; a++) this.menu.addMenuItem(new MenuItem('', () => this._cb1(items.length + a)));
        else if(diff < 0) for(let a = 0; a > diff; a--) items.at(a - 1).destroy();
        this._list = list;
        this.menu._getMenuItems().forEach((x, i) => x.setLabel(list[i]));
        this.setSelected(index ?? this._index);
    }
}

class Shadowsocks {
    constructor() {
        this._addIndicator();
        this._bindSettings();
        this._addMenuItems();
        this._loadSubs().then(() => this._updateSubs()).catch(() => {
            this._syncSubs().then(() => this._updateSubs()).catch(noop);
        });
    }

    _bindSettings() {
        this._field = new Field({
            restart:     [Fields.RESTART,  'string'],
            filename:    [Fields.FILE,     'string'],
            additions:   [Fields.ADDITION, 'string'],
            subs_link:   [Fields.LINK,     'string'],
            local_addr:  [Fields.ADDR,     'string'],
            local_port:  [Fields.PORT,     'uint'],
            local_time:  [Fields.TIME,     'uint'],
            server_name: [Fields.SERVER,   'string'],
        }, ExtensionUtils.getSettings(), this);
        this._pfield = new Field({ proxy: [Fields.PROXY, 'string'] }, 'org.gnome.system.proxy', this);
    }

    set proxy(proxy) {
        if(this._proxy) this._button.remove_style_pseudo_class(this._proxy);
        this._button.add_style_pseudo_class(this._proxy = proxy);
        this._menus?.proxy.setSelected(Mode[this._proxy]);
    }

    set local_addr(addr) {
        this._local_addr = addr || '127.0.0.1';
    }

    set additions(additions) {
        try {
            this._additions = JSON.parse(additions);
        } catch(e) {
            this._additions = {};
        }
    }

    setServer(index) {
        this._genConfig(this.subs?.servers[index]).catch(noop).finally(() => this._menus?.airport.setSelected(this.getServer()));
    }

    getServer() {
        return this.subs?.servers.findIndex(x => x.remarks === this.server_name) ?? -1;
    }

    getServers() {
        return this.subs?.servers.map(x => x.remarks) ?? [];
    }

    getTraffic() {
        return `${Math.round(this.subs?.traffic_used ?? 0)}/${this.subs?.traffic_total ?? 0}`;
    }

    getCacheFile() {
        return Gio.File.new_for_path(GLib.build_filenamev([GLib.path_get_dirname(this.filename), 'ssss-cache.json']));
    }

    _updateSubs() {
        this._menus?.airport.setList(this.getServers(), this.getServer());
    }

    async _loadSubs() {
        let [data] = await this.getCacheFile().load_contents_async(null);
        this.subs = JSON.parse(dc(data));
    }

    async _syncSubs() {
        if(!this.subs_link) throw new Error(_('Subscription link is missing.'));
        let message = Soup.Message.new('GET', this.subs_link);
        let bytes = await new Soup.Session().send_and_read_async(message, GLib.PRIORITY_DEFAULT, null);
        if(message.statusCode !== Soup.Status.OK) throw new Error(`Unexpected response: ${message.get_reason_phrase()}`);
        this.subs = JSON.parse(dc(GLib.base64_decode(dc(bytes.get_data().slice(6))))); // ignore 6-chars prefix
        let file = this.getCacheFile();
        await file.touch_async().catch(noop);
        await file.replace_contents_async(ec(JSON.stringify(this.subs, null, 2)), null, false, Gio.FileCreateFlags.PRIVATE, null);
    }

    _addIndicator() {
        this._button = new PanelMenu.Button(0.5, Me.metadata.uuid);
        this._button.menu.actor.add_style_class_name('ss-subscriber-menu app-menu');
        this._button.add_actor(new St.Icon({ gicon: genIcon('paper-plane-symbolic'), style_class: 'system-status-icon' }));
        this._button.add_style_class_name('ss-subscriber-systray');
        Main.panel.addToStatusArea(Me.metadata.uuid, this._button);
    }

    _addMenuItems() {
        let MODES = [_('Automatic'), _('Manual'), _('Disable')];
        this._menus = {
            restart: new MenuItem(_('Restart service'), () => Util.spawnCommandLine(this.restart)),
            sep0:    new PopupMenu.PopupSeparatorMenuItem(),
            airport: new DRadioItem(_('Servers'), this.getServers(), this.getServer(), x => this.setServer(x), () => this.getTraffic()),
            proxy:   new DRadioItem(_('Proxy'), MODES, Mode[this._proxy], x => this.setf('proxy', Mode[x], 'p')),
            sync:    new MenuItem(_('Sync Subscription'), () => this._subscribe()),
            sep1:    new PopupMenu.PopupSeparatorMenuItem(),
            prefs:   new MenuItem(_('Settings'), () => ExtensionUtils.openPrefs()),
        };
        for(let p in this._menus) this._button.menu.addMenuItem(this._menus[p]);
    }

    _subscribe() {
        Main.notify(Me.metadata.name, _('Start synchronizing.'));
        this._syncSubs().then(() => {
            Main.notify(Me.metadata.name, _('Synchronized successfully.'));
            this._updateSubs();
        }).catch(err => {
            Main.notifyError(Me.metadata.name, err.message);
        });
    }

    async _genConfig(config) {
        if(!this.filename) throw new Error(_('Config file is not set.'));
        this.setf('server_name', config.remarks);
        let { encryption: method, port: server_port, ...others } = config,
            { local_port, local_time: timeout, _local_addr: local_address } = this,
            content = ec(JSON.stringify({ ...others, server_port, method, local_port, local_address, timeout, ...this._additions }, null, 2));
        await Gio.File.new_for_path(this.filename).replace_contents_async(content, null, false, Gio.FileCreateFlags.PRIVATE, null);
        Util.spawnCommandLine(this.restart);
    }

    destroy() {
        ['_field', '_pfield'].forEach(x => this[x].detach(this));
        this._button.destroy();
        this._button = null;
    }
}

class Extension {
    constructor() {
        ExtensionUtils.initTranslations();
    }

    enable() {
        this._ext = new Shadowsocks();
    }

    disable() {
        this._ext.destroy();
        this._ext = null;
    }
}

function init() {
    return new Extension();
}
