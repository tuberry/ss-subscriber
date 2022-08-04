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
const { Fields } = Me.imports.fields;
const Mode = { auto: 0, manual: 1, none: 2, 0: 'auto', 1: 'manual', 2: 'none' };

const noop = () => {};
const dc = x => new TextDecoder().decode(x);
const ec = x => new TextEncoder().encode(x);
const genIcon = x => Gio.Icon.new_for_string(Me.dir.get_child('icons').get_child(`${x}-symbolic.svg`).get_path());

Gio._promisify(Gio.File.prototype, 'create_async');
Gio._promisify(Gio.File.prototype, 'load_contents_async');
Gio._promisify(Gio.File.prototype, 'replace_contents_async');

class Field {
    constructor(prop, gset, obj) {
        this.gset = typeof gset === 'string' ? new Gio.Settings({ schema: gset }) : gset;
        this.prop = prop;
        this.bind(obj);
    }

    _get(x) {
        return this.gset[`get_${this.prop[x][1]}`](this.prop[x][0]);
    }

    _set(x, y) {
        this.gset[`set_${this.prop[x][1]}`](this.prop[x][0], y);
    }

    bind(a) {
        let fs = Object.entries(this.prop);
        fs.forEach(([x]) => { a[x] = this._get(x); });
        this.gset.connectObject(...fs.flatMap(([x, [y]]) => [`changed::${y}`, () => { a[x] = this._get(x); }]), a);
    }

    unbind(a) {
        this.gset.disconnectObject(a);
    }
}

class IconItem extends PopupMenu.PopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(style, callbacks) {
        super({ activate: false });
        this._style = style;
        this._hbox = new St.BoxLayout({ x_align: St.Align.START, x_expand: true });
        callbacks.forEach(xs => this.addButton(...xs));
        this.add_child(this._hbox);
    }

    addButton(icon_name, callback) {
        let btn = new St.Button({ x_expand: true, style_class: this._style, child: new St.Icon({ icon_name, style_class: 'popup-menu-icon' }) });
        btn.connect('clicked', callback);
        this._hbox.add_child(btn);
    }
}

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

class DIndexItem extends PopupMenu.PopupSubMenuMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(name, list, index, callback1, callback2) {
        super('');
        this._name = name;
        this._call1 = callback1;
        this._call2 = callback2 || (x => this._list[x]);
        this.setList(list);
        this.setSelected(index);
    }

    setSelected(index) {
        this._index = index;
        this.label.set_text(`${this._name}${this._call2(this._index) || ''}`);
        this._items.forEach((y, i) => y.setOrnament(index === i ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE));
    }

    setList(list) {
        let items = this._items;
        let diff = list.length - items.length;
        if(diff > 0) for(let a = 0; a < diff; a++) this.menu.addMenuItem(new MenuItem('', () => this._call1(items.length + a)));
        else if(diff < 0) for(let a = 0; a > diff; a--) items.at(a - 1).destroy();
        this._list = list;
        this._items.forEach((x, i) => x.setLabel(list[i]));
    }

    get _items() {
        return this.menu._getMenuItems();
    }
}

class RadioSection extends PopupMenu.PopupMenuSection {
    constructor(modes, index, callback) {
        super('');
        this._list = Array.isArray(modes) ? modes : Object.keys(modes);
        this._list.map((x, i) => new MenuItem(_(x), () => callback(i))).forEach(x => this.addMenuItem(x));
        this.setSelected(index);
    }

    setSelected(index) {
        if(!(index in this._list)) return;
        this._getMenuItems().forEach((x, i) => x.setOrnament(index === i ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE));
    }

    hide() {
        this._getMenuItems().forEach(x => x.hide());
    }

    show() {
        this._getMenuItems().forEach(x => x.show());
    }
}

class Shadowsocks {
    constructor() {
        this._addIndicator();
        this._bindSettings();
        this._addMenuItems();
        this._loadSubs().then(() => this._updateSubs()).catch(() => {
            this._syncSubs().then(() => this._updateSubs()).catch(e => log(e.message));
        });
    }

    _bindSettings() {
        this._field = new Field({
            restart:     [Fields.RESTART,  'string'],
            filename:    [Fields.FILE,     'string'],
            additions:   [Fields.ADDITION, 'string'],
            subs_link:   [Fields.LINK,     'string'],
            lite_mode:   [Fields.LITE,     'boolean'],
            local_addr:  [Fields.ADDR,     'string'],
            local_port:  [Fields.PORT,     'uint'],
            local_time:  [Fields.TIME,     'uint'],
            server_name: [Fields.SERVER,   'string'],
        }, ExtensionUtils.getSettings(), this);
        this._pfield = new Field({ 'proxy': [Fields.PROXY, 'string'] }, 'org.gnome.system.proxy', this);
    }

    _updateSubs() {
        this._menus?.airport.setList(this.servers);
        this._menus?.airport.setSelected(this.server);
    }

    get cache() {
        return Gio.File.new_for_path(GLib.build_filenamev([this.filename.substring(0, this.filename.lastIndexOf('/')), 'ssss-cache.json']));
    }

    set proxy(proxy) {
        if(this._proxy) this._button.remove_style_pseudo_class(this._proxy);
        this._button.add_style_pseudo_class(this._proxy = proxy);
        this._menus?.proxy.setSelected(Mode[this._proxy]);
    }

    set lite_mode(lite_mode) {
        this._lite_mode = lite_mode;
        this._checkLiteMode();
    }

    async _loadSubs() {
        let [data] = await this.cache.load_contents_async(null);
        this.subs = JSON.parse(dc(data));
    }

    async _syncSubs() {
        if(!this.subs_link) throw new Error(_('Subscription link is missing.'));
        let message = Soup.Message.new('GET', this.subs_link);
        let bytes = await new Soup.Session().send_and_read_async(message, GLib.PRIORITY_DEFAULT, null);
        if(message.statusCode !== Soup.Status.OK) throw new Error(`Unexpected response: ${Soup.Status.get_phrase(message.statusCode)}`);
        this.subs = JSON.parse(dc(GLib.base64_decode(dc(bytes.get_data().slice(6))))); // ignore 6-chars prefix
        let file = this.cache;
        await file.create_async(Gio.FileCreateFlags.NONE, GLib.PRIORITY_DEFAULT, null).catch(noop);
        await file.replace_contents_async(ec(JSON.stringify(this.subs, null, 2)), null, false, Gio.FileCreateFlags.PRIVATE, null);
    }

    _addIndicator() {
        this._button = new PanelMenu.Button(0.5, Me.metadata.uuid);
        this._button.menu.actor.add_style_class_name('ss-subscriber-menu');
        this._button.add_actor(new St.Icon({ gicon: genIcon('paper-plane'), style_class: 'system-status-icon' }));
        this._button.add_style_class_name('ss-subscriber-systray');
        Main.panel.addToStatusArea(Me.metadata.uuid, this._button);
    }

    _checkLiteMode() {
        this._lite_mode ? this._menus?.lite.show() : this._menus?.lite.hide();
        ['proxy', 'airport', 'sync'].forEach(x => this._lite_mode ? this._menus?.[x].hide() : this._menus?.[x].show());
    }

    _addMenuItems() {
        let MODES = [_('Automatic'), _('Manual'), _('Disable')];
        this._menus = {
            lite:     new RadioSection(MODES, Mode[this._proxy], x => this._pfield._set('proxy', Mode[x])),
            proxy:    new DIndexItem(_('Proxy: '), MODES, Mode[this._proxy], x => this._pfield._set('proxy', Mode[x])),
            airport:  new DIndexItem(_('Airport: '), this.servers, this.server, x => (this.server = x), () => this.traffic),
            sync:     new MenuItem(_('Sync Subscription'), this._subscribe.bind(this)),
            sep:      new PopupMenu.PopupSeparatorMenuItem(),
            settings: new IconItem('ss-subscriber-setting', [
                ['emblem-system-symbolic',     () => { this._button.menu.close(); ExtensionUtils.openPrefs(); }],
                ['view-refresh-symbolic',      () => { this._button.menu.close(); Util.spawnCommandLine(this.restart); }],
                ['face-cool-symbolic',         () => this._field._set('lite_mode', !this._lite_mode)],
                ['network-workgroup-symbolic', () => { this._button.menu.close(); Util.spawn(['gnome-control-center', 'network']); }],
            ]),
        };
        for(let p in this._menus) this._button.menu.addMenuItem(this._menus[p]);
        this._checkLiteMode();
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
        this._field._set('server_name', config.remarks);
        let { encryption: method, port: server_port, ...others } = config;
        let { local_port, local_time: timeout, _local_addr: local_address } = this;
        let content = ec(JSON.stringify({ ...others, server_port, method, local_port, local_address, timeout, ...this._additions }, null, 2));
        await Gio.File.new_for_path(this.filename).replace_contents_async(content, null, false, Gio.FileCreateFlags.PRIVATE, null);
        Util.spawnCommandLine(this.restart);
    }

    get servers() {
        return this.subs?.servers.map(x => x.remarks) ?? [];
    }

    get server() {
        return this.subs?.servers.findIndex(x => x.remarks === this.server_name) ?? -1;
    }

    set server(index) {
        this._genConfig(this.subs?.servers[index]).catch(noop).finally(() => this._menus?.airport.setSelected(this.server));
    }

    get traffic() {
        return `${Math.round(this.subs?.traffic_used ?? 0)}/${this.subs?.traffic_total ?? 0}`;
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

    destroy() {
        ['_field', '_pfield'].forEach(x => this[x].unbind(this));
        this._button.destroy();
        this._button = null;
    }
}

class Extension {
    static {
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
