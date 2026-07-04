# galley-pad-bin AUR package

This directory contains the files for publishing `galley-pad-bin` to the AUR.
It repackages the upstream GitHub release `.deb` and installs its native files
under `/usr`.

The AUR package is intentionally version-pinned. A `PKGBUILD` should not fetch a
moving "latest" asset because makepkg needs reproducible sources and checksums.
To update the package after a Galley Pad release, edit `pkgver` and
`sha256sums`, then regenerate `.SRCINFO`:

```bash
cd packaging/aur/galley-pad-bin
updpkgsums
makepkg --printsrcinfo > .SRCINFO
makepkg --verifysource
```

First-time AUR publication:

```bash
mkdir /tmp/galley-pad-bin
cp PKGBUILD .SRCINFO /tmp/galley-pad-bin/
cd /tmp/galley-pad-bin
git init
git remote add origin ssh://aur@aur.archlinux.org/galley-pad-bin.git
git add PKGBUILD .SRCINFO
git commit -m "Initial import"
git push origin HEAD:master
```

Automated updates run after semantic-release successfully builds and uploads the
Linux `.deb`. Configure these GitHub Actions values before expecting the AUR
publish step to push:

- Secret `AUR_SSH_PRIVATE_KEY`: private SSH key for an AUR account that can push
  to `galley-pad-bin`.
- Variable `AUR_SSH_KNOWN_HOSTS`: optional pinned `aur.archlinux.org` known-hosts
  entry. If omitted, the workflow falls back to `ssh-keyscan`.

Until `AUR_SSH_PRIVATE_KEY` is configured, the workflow logs a skip and keeps the
release green. When the key is configured, the workflow can publish either to an
existing AUR repo or to the first `galley-pad-bin` repo push.

The AUR package metadata declares the app license as `MIT`.
