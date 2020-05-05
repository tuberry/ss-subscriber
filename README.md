# ss-subscriber
Simple shadowsocks subscriber (SSD only), yet another proxy switcher for gnome shell.

> 情人若寂寥地出生在1874 / 刚刚早一百年一个世纪 / 是否终身都这样顽强地等 / 雨季会降临赤地 —— *《1874》*<br>
[![license]](/LICENSE)

<br>

## Installation
```shell
git clone git@github.com:tuberry/ss-subscriber.git
cp -r ./ss-subscriber/ssss@tu.berry ~/.local/share/gnome-shell/extensions/
```
## Usage
### Dependencies
0. `sudo`: root privilege;
1. `systemd`: provide `systemctl`;
2. `curl`: fetch the subscriptions;
3. `shadowsocks-libev`: provide `ss-local`.
### Configuration
#### config file
```
touch /tmp/ssss.json # readable and writable
sudo mv /tmp/ssss.json /etc/shadowsocks/
```
#### enable service
```
sudo systemctl enable shadowsocks-libev@ssss.service # ignore the output
```
#### fill blanks
![image](https://user-images.githubusercontent.com/17917040/81079385-13ad3580-8f22-11ea-991f-ac6042ee9eee.png)

then enable it and wait for sync.

![image](https://user-images.githubusercontent.com/17917040/81082140-76540080-8f25-11ea-8304-a79231161d02.png)

## Acknowledgements
* [proxy-switcher](https://github.com/tomflannaghan/proxy-switcher): network setting button
* [SSD-windows](https://github.com/TheCGDF/SSD-Windows/wiki/HTTP-Subscription-Agreement): SSD http subscription agreement
* [GS-shadowsocks](https://github.com/ylxdzsw/gnome-shell-extension-shadowsocks): panel button and menu arrangement

## Note
1. NO feature request.

[license]:https://img.shields.io/badge/license-GPLv3-green.svg

