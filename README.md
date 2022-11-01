# ss-subscriber

Simple shadowsocks subscriber (SSD only), yet another proxy switcher for GNOME Shell.
> data **提问的智慧** = 别问 | 问就是**提问的智慧**<br>
[![license]](/LICENSE)
<br>

![image](https://user-images.githubusercontent.com/17917040/81277066-76b7dd00-9086-11ea-953e-af4236c17ee7.png)

## Installation

### Manual

The latest and supported version should only work on the most current stable version of GNOME Shell.

```bash
git clone https://github.com/tuberry/ss-subscriber.git && cd ss-subscriber
make && make install
# make LANG=your_language_code mergepo # for translators
```

For older versions, it's necessary to switch the git tag before `make`:

```bash
# git tag # to see available versions
git checkout your_gnome_shell_version
```

### E.G.O

[<img src="https://raw.githubusercontent.com/andyholmes/gnome-shell-extensions-badge/master/get-it-on-ego.svg?sanitize=true" alt="Get it on GNOME Extensions" height="100" align="middle">][EGO]

## Usage

### Dependencies

* `shadowsocks-libev`: provides `ss-local`.

### Config file

```bash
mkdir -p ~/.config/shadowsocks
touch ~/.config/shadowsocks/ssss.json
```

### Service unit

```bash
mkdir -p ~/.config/systemd/user
echo '[Unit]
Description=Shadowsocks-Libev Client User Service
After=network-online.target
Wants=network-online.target

[Service]
Type=exec
ExecStart=/usr/bin/ss-local -c %h/.config/shadowsocks/%i.json

[Install]
WantedBy=default.target
' > ~/.config/systemd/user/shadowsocks-libev@.service
# enable service
systemctl --user enable shadowsocks-libev@ssss.service --now
```

### Fill blanks

![ssprefs](https://user-images.githubusercontent.com/17917040/155883556-0c302a49-e900-4d47-a814-240457f4fb4b.png)

## Acknowledgements

* [proxy-switcher](https://github.com/tomflannaghan/proxy-switcher): network setting button
* [SSD-windows](https://github.com/TheCGDF/SSD-Windows/wiki/HTTP-Subscription-Agreement): SSD http subscription agreement

[license]:https://img.shields.io/badge/license-GPLv3-green.svg
[EGO]:https://extensions.gnome.org/extension/3073/ss-subscriber/
