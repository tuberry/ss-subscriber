# ss-subscriber
Simple shadowsocks subscriber (SSD only), yet another proxy switcher for gnome shell.

> data **提问的智慧** = 别问 | 问就是**提问的智慧**<br>
[![license]](/LICENSE)

<br>

## Installation
[<img src="https://raw.githubusercontent.com/andyholmes/gnome-shell-extensions-badge/master/get-it-on-ego.svg?sanitize=true" alt="Get it on GNOME Extensions" height="100" align="middle">][EGO]

Or manually:
```shell
git clone https://github.com/tuberry/ss-subscriber.git
cd ss-subscriber && make install
```
## Usage

![image](https://user-images.githubusercontent.com/17917040/81277066-76b7dd00-9086-11ea-953e-af4236c17ee7.png)

### dependencies
1. `shadowsocks-libev`: provides `ss-local`.
### config file
```
mkdir -p ~/.config/shadowsocks
touch ~/.config/shadowsocks/ssss.json
```
### service unit
```
mkdir -p ~/.config/systemd/user
echo '[Unit]
Description=Shadowsocks-Libev Client User Service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/ss-local -c %h/.config/shadowsocks/%i.json

[Install]
WantedBy=default.target
' > ~/.config/systemd/user/shadowsocks-libev@.service
# enable service
systemctl --user enable shadowsocks-libev@ssss.service --now
```

### fill blanks
![image](https://user-images.githubusercontent.com/17917040/81277650-46247300-9087-11ea-8108-e0a686dabae6.png)

## Acknowledgements
* [proxy-switcher](https://github.com/tomflannaghan/proxy-switcher): network setting button
* [SSD-windows](https://github.com/TheCGDF/SSD-Windows/wiki/HTTP-Subscription-Agreement): SSD http subscription agreement
* [GS-shadowsocks](https://github.com/ylxdzsw/gnome-shell-extension-shadowsocks): panel button and menu arrangement

## Note
1. NO feature request.

[license]:https://img.shields.io/badge/license-GPLv3-green.svg
[EGO]:https://extensions.gnome.org/extension/3073/ss-subscriber/
