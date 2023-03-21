// vim:fdm=syntax
// by tuberry
/* exported init */
'use strict';

const Main = imports.ui.main;
const Util = imports.misc.util;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const { GLib } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const { Fulu, Extension, DEventEmitter, symbiose, omit } = Me.imports.fubar;
const { MenuItem, RadioItem, DRadioItem, TrayIcon } = Me.imports.menu;
const { _, noop, fl, dc, fwrite, fread, access } = Me.imports.util;
const { Field } = Me.imports.const;

class SimpleSubs extends DEventEmitter {
    constructor() {
        super();
        this._addIndicator();
        this._bindSettings();
        this._addMenuItems();
        this._loadSubs().then(() => this._updateSubs()).catch(() => {
            this._syncSubs().then(() => this._updateSubs()).catch(noop);
        });
        symbiose(this, () => omit(this, '_btn'));
    }

    _bindSettings() {
        this._fulu = new Fulu({
            restart:     [Field.RCMD, 'string'],
            filename:    [Field.FILE, 'string'],
            additions:   [Field.ETR,  'string'],
            subs_link:   [Field.LINK, 'string'],
            local_addr:  [Field.ADDR, 'string'],
            local_port:  [Field.PORT, 'uint'],
            local_time:  [Field.TIME, 'uint'],
            server_name: [Field.SVR,  'string'],
        }, ExtensionUtils.getSettings(), this);
        this._fulu_p = new Fulu({ proxy: [Field.PRX, 'string'] }, 'org.gnome.system.proxy', this);
    }

    set proxy(proxy) {
        if(this._proxy) this._btn.remove_style_pseudo_class(this._proxy);
        this._btn.add_style_pseudo_class(this._proxy = proxy);
        this._menus?.proxy.setSelected(this._proxy);
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
        return fl(GLib.path_get_dirname(this.filename), 'ssss-cache.json');
    }

    _updateSubs() {
        this._menus?.airport.setList(this.getServers(), this.getServer());
    }

    async _loadSubs() {
        let [data] = await fread(this.getCacheFile());
        this.subs = JSON.parse(dc(data));
    }

    async _syncSubs() {
        if(!this.subs_link) throw new Error(_('Subscription link is missing.'));
        this.subs = JSON.parse(dc(GLib.base64_decode((await access('GET', this.subs_link)).slice(6)))); // ignore 6-chars prefix
        await fwrite(this.getCacheFile(), JSON.stringify(this.subs, null, 2));
    }

    _addIndicator() {
        this._btn = Main.panel.addToStatusArea(Me.metadata.uuid, new PanelMenu.Button(0.5, Me.metadata.uuid));
        this._btn.menu.actor.add_style_class_name('ss-subscriber-menu app-menu');
        this._btn.add_actor(new TrayIcon('paper-plane-symbolic', true));
        this._btn.add_style_class_name('ss-subscriber-systray');
    }

    _addMenuItems() {
        let Mode = { auto: _('Automatic'), manual: _('Manual'), none: _('Disable') }; // l10n
        this._menus = {
            restart: new MenuItem(_('Restart service'), () => Util.spawnCommandLine(this.restart)),
            sep0:    new PopupMenu.PopupSeparatorMenuItem(),
            airport: new DRadioItem(_('Servers'), this.getServers(), this.getServer(), x => this.setServer(x), () => this.getTraffic()),
            proxy:   new RadioItem(_('Proxy'), Mode, this._proxy, x => this._fulu_p.set('proxy', x, this)),
            sync:    new MenuItem(_('Sync Subscription'), () => this._subscribe()),
            sep1:    new PopupMenu.PopupSeparatorMenuItem(),
            prefs:   new MenuItem(_('Settings'), () => ExtensionUtils.openPrefs()),
        };
        for(let p in this._menus) this._btn.menu.addMenuItem(this._menus[p]);
    }

    _subscribe() {
        Main.notify(Me.metadata.name, _('Start synchronizing.'));
        this._syncSubs().then(() => {
            Main.notify(Me.metadata.name, _('Synchronized successfully.'));
            this._updateSubs();
        }).catch(e => Main.notifyError(Me.metadata.name, e.message));
    }

    async _genConfig(config) {
        if(!this.filename) throw new Error(_('Config file is not set.'));
        this._fulu.set('server_name', config.remarks, this);
        let { encryption: method, port: server_port, ...others } = config,
            { local_port, local_time: timeout, _local_addr: local_address } = this,
            json = JSON.stringify({ ...others, server_port, method, local_port, local_address, timeout, ...this._additions }, null, 2);
        await fwrite(fl(this.filename), json);
        Util.spawnCommandLine(this.restart);
    }
}

function init() {
    return new Extension(SimpleSubs);
}
