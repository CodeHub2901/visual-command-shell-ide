# Catalog source evidence

This file records the upstream documentation checked for the common-syntax
catalog expansion. It complements the exact distro/package evidence in
`catalog-version-evidence.md`. The review was performed on 2026-07-29.

Only a small, useful option subset is modeled for each command. An option is
included when its spelling and value behavior are supported across the current
Ubuntu 24.04/26.04 and Fedora 44 family targets. Newer or implementation-specific
options are omitted until an exact overlay can express the difference.

| Command group | Commands | Upstream evidence |
| --- | --- | --- |
| GNU Coreutils | `pwd`, `ln`, `readlink`, `realpath`, `basename`, `dirname`, `cut`, `tr`, `uniq`, `tee` | [GNU Coreutils manual](https://www.gnu.org/software/coreutils/manual/coreutils.html) |
| GNU Findutils / locate implementations | `xargs`, `locate` | [GNU Findutils manual](https://www.gnu.org/software/findutils/manual/html_mono/find.html) |
| procps-ng | `pgrep`, `pkill`, `top` | [pgrep/pkill upstream manual rendering](https://man7.org/linux/man-pages/man1/pgrep.1.html), [top upstream manual rendering](https://man7.org/linux/man-pages/man1/top.1.html) |
| systemd | `hostnamectl`, `timedatectl`, `loginctl` | [hostnamectl](https://www.freedesktop.org/software/systemd/man/255/hostnamectl.html), [timedatectl](https://www.freedesktop.org/software/systemd/man/255/timedatectl.html), [loginctl](https://www.freedesktop.org/software/systemd/man/255/loginctl.html) |
| util-linux | `blkid`, `findmnt`, `umount` | [blkid upstream manual rendering](https://man7.org/linux/man-pages/man8/blkid.8.html), [findmnt upstream manual rendering](https://man7.org/linux/man-pages/man8/findmnt.8.html), [umount upstream manual rendering](https://man7.org/linux/man-pages/man8/umount.8.html) |
| Network/archive/build | `wget`, `xz`, `make` | [GNU Wget manual](https://www.gnu.org/software/wget/manual/wget.html), [XZ manual](https://tukaani.org/xz/man/xz.1.html), [GNU Make manual](https://www.gnu.org/software/make/manual/make.html) |

Risk tags remain command-wide and conservative, but the deterministic risk
engine refines commands whose selected operation materially changes the result.
Read-only `systemctl`, `hostnamectl`, `timedatectl`, and `loginctl` operations
are Low; persistent system-configuration operations are Critical. Listing
mounts is Low, while attaching or detaching filesystems is Critical. Ordinary
deletion and permission/ownership changes are High, with recursive forms raised
to Critical. `xargs` and `make` remain High because a delegated command or
recipe can change system state; `pkill` is Medium process-signal risk; and
`wget`, `xz`, `ln`, `uniq`, and `tee` retain write or network side-effect
metadata even when a particular invocation can be read-only.

`apt` and `dnf` are also refined by selected operation. Search, information,
listing, dependency/repository queries, downloads, and explicit simulation or
assume-no transactions are Medium because they can read repositories, use the
network, or write local download/cache data. Transactions that can change
installed packages or repository state remain High.
