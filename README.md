# ss-subscriber
Simple shadowsocks subscriber (SSD only), yet another proxy switcher for gnome shell.

> 情人若寂寥地出生在1874 / 刚刚早一百年一个世纪 / 是否终身都这样顽强地等 / 雨季会降临赤地 —— *《1874》*<br>
[![license]](/LICENSE)

<br>

## Installation
[<img src="https://raw.githubusercontent.com/andyholmes/gnome-shell-extensions-badge/master/get-it-on-ego.svg?sanitize=true" alt="Get it on GNOME Extensions" height="100" align="middle">][EGO]

Or manually:
```shell
git clone git@github.com:tuberry/ss-subscriber.git
cp -r ./ss-subscriber/ssss@tu.berry ~/.local/share/gnome-shell/extensions/
```
## Usage

![image](https://user-images.githubusercontent.com/17917040/81277066-76b7dd00-9086-11ea-953e-af4236c17ee7.png)

### dependencies
1. `shadowsocks-libev`: provide `ss-local`.
### config file
```
touch /tmp/ssss.json # readable and writable
sudo mv /tmp/ssss.json /etc/shadowsocks/
```
### enable service
```
sudo systemctl enable shadowsocks-libev@ssss.service # ignore the output
```
### fill blanks
![image](https://user-images.githubusercontent.com/17917040/81277650-46247300-9087-11ea-8108-e0a686dabae6.png)

then enable it and wait for sync.

## Acknowledgements
* [proxy-switcher](https://github.com/tomflannaghan/proxy-switcher): network setting button
* [SSD-windows](https://github.com/TheCGDF/SSD-Windows/wiki/HTTP-Subscription-Agreement): SSD http subscription agreement
* [GS-shadowsocks](https://github.com/ylxdzsw/gnome-shell-extension-shadowsocks): panel button and menu arrangement

## Note
1. NO feature request.

[license]:https://img.shields.io/badge/license-GPLv3-green.svg
[EGO]:https://extensions.gnome.org/extension/3073/ss-subscriber/
