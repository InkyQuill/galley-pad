## [1.6.2](https://github.com/InkyQuill/galley-pad/compare/v1.6.1...v1.6.2) (2026-09-28)

## [1.7.0](https://github.com/InkyQuill/galley-pad/compare/v1.6.3...v1.7.0) (2026-10-09)


### Features

* add AUR packaging and fix packaged editor ([95f36f6](https://github.com/InkyQuill/galley-pad/commit/95f36f6bd1f9892a764f8f398925c40ae7f46e3e))
* add document lifecycle commands ([08ef3b6](https://github.com/InkyQuill/galley-pad/commit/08ef3b63f700f9bd326dcce32821a3242aa76faf))
* add document session model ([488e8eb](https://github.com/InkyQuill/galley-pad/commit/488e8eb3d752db1273f93ac8ed363137f54609e5))
* add native dialog plugin ([d5a2ada](https://github.com/InkyQuill/galley-pad/commit/d5a2ada4652ed18899501cf125092c0fb30237a5))
* add text file tauri commands ([9d664d0](https://github.com/InkyQuill/galley-pad/commit/9d664d08b8fae2ca3a8eeb3cfce30e64a8a5168b))
* add typed dialog wrappers ([c5734ae](https://github.com/InkyQuill/galley-pad/commit/c5734ae56a7ff07460a6e7b2fc7ccc1493d73f42))
* add typed file command wrappers ([54d8457](https://github.com/InkyQuill/galley-pad/commit/54d845708a819166d9094214b6769e8b5dcabf88))
* adopt per-document editor state and add tab UX fixes ([873cad5](https://github.com/InkyQuill/galley-pad/commit/873cad5d16ddeaa691d299d0d2f4c3f7869b75f8))
* **app:** add external file warning banner ([9c3244a](https://github.com/InkyQuill/galley-pad/commit/9c3244a9def3941856af3ab8e528c2b125d083be))
* **app:** add external reconcile view ([2c103ce](https://github.com/InkyQuill/galley-pad/commit/2c103ce18424a56d784fd68be3b53bf69c4b0d30))
* **app:** add theme mode settings ([2a77cdb](https://github.com/InkyQuill/galley-pad/commit/2a77cdbbc25b1e464c57c5465e229ba8ed4fdf06))
* **app:** handle external file warnings ([d2a1368](https://github.com/InkyQuill/galley-pad/commit/d2a13687f4f94a993e195b31f63c63f4168a9855))
* **app:** persist and apply word wrap ([8544916](https://github.com/InkyQuill/galley-pad/commit/85449169ce3b903d39d36e5579003c7801f1f3ba))
* **app:** refine editor shell and persistence ([5fa72c0](https://github.com/InkyQuill/galley-pad/commit/5fa72c0ab341e8c82d17f1bc6b846355072185f2))
* **app:** resolve theme settings ([29189a5](https://github.com/InkyQuill/galley-pad/commit/29189a5fac2aa242b8374e2566e9e8c0aadcd0ab))
* **document:** add side-by-side diff rows ([61f1279](https://github.com/InkyQuill/galley-pad/commit/61f1279d0f381d3231030b821d83f1ebca06d3c4))
* **document:** classify external file changes ([1b1182e](https://github.com/InkyQuill/galley-pad/commit/1b1182eeb2c97f7e70a545126b3681a4adc2f43c))
* **document:** track external update session state ([b334b33](https://github.com/InkyQuill/galley-pad/commit/b334b333a0c5b65a10ea39ed254ed6c803ca9d9d))
* **editor:** add search and persistent word wrap ([47baddf](https://github.com/InkyQuill/galley-pad/commit/47baddf500d2ed88044406c11cd4a2b0087b94ef))
* **editor:** expose search and word wrap boundary ([5bc55b6](https://github.com/InkyQuill/galley-pad/commit/5bc55b6b20438bcb6e77aa7f81b6d5d1ba0c881f))
* integrate galley-editor 0.13.0 (per-document state, tab fixes) ([8fb2232](https://github.com/InkyQuill/galley-pad/commit/8fb2232353a99f2baa351bc72b0715118c4681c1))
* **menu:** add accessible footer command menu ([b148df1](https://github.com/InkyQuill/galley-pad/commit/b148df16a4f6cf712567de31ddf675401c7a599f))
* **menu:** add find and word wrap commands ([9066f20](https://github.com/InkyQuill/galley-pad/commit/9066f205b85521a4b3d83bbcf6e67e1b7c39d199))
* **menu:** expose word wrap in Linux fallback ([ebc62be](https://github.com/InkyQuill/galley-pad/commit/ebc62bec9b371c8ceedae76e072d83f99478c394))
* **platform:** detect Linux desktop runtime ([28debe7](https://github.com/InkyQuill/galley-pad/commit/28debe7ad90f286cf6123619a8074b75b8410b07))
* **release:** automate versioned installer builds ([69a2d14](https://github.com/InkyQuill/galley-pad/commit/69a2d14064e125147581d8af1eed336d7d40f4b8))
* **settings:** persist word wrap preference ([590db82](https://github.com/InkyQuill/galley-pad/commit/590db82b860bf4c255f095ef4c86de922c020d2a))
* **tabs:** improve tab navigation and close flow ([c367eac](https://github.com/InkyQuill/galley-pad/commit/c367eac35f77041148d70a68fde33951f40f898c))
* **themes:** add built-in theme catalog ([8a4c7d7](https://github.com/InkyQuill/galley-pad/commit/8a4c7d7aaee572d52d7febc15ac11201d04ccc75))
* **themes:** add theme settings resolution ([3ad3c4f](https://github.com/InkyQuill/galley-pad/commit/3ad3c4f449b485814a94923d3f559056fa9f3545))
* **themes:** add theme token mapping ([3497da2](https://github.com/InkyQuill/galley-pad/commit/3497da24ac7c2968da1d7943c06861c5b47be7e6))
* **themes:** persist theme settings ([10666f9](https://github.com/InkyQuill/galley-pad/commit/10666f90e29087999a7dae12746d3b76ca38789e))
* **updates:** check latest GitHub release ([760667a](https://github.com/InkyQuill/galley-pad/commit/760667a15c3bc5fffe7846ff04c3f1266f049258))
* **updates:** open release pages in browser ([8aab477](https://github.com/InkyQuill/galley-pad/commit/8aab4778e60989e4c9cbfe8a722a3f20eb7669fe))
* **updates:** show available releases in editor footer ([bc7f1c1](https://github.com/InkyQuill/galley-pad/commit/bc7f1c1f27c9052a632a861c491ff9696c6d84c4))
* wire app to document session ([854c8fb](https://github.com/InkyQuill/galley-pad/commit/854c8fb0b093aa547a4ce974c7ae7201a43fa173))
* wire file commands into app shell ([a395225](https://github.com/InkyQuill/galley-pad/commit/a395225f1c52cdcd309c7c94bb1a9b7068af05d3))


### Bug Fixes

* add a screenshot ([350c985](https://github.com/InkyQuill/galley-pad/commit/350c9855dbee932af06e3c84a10407b8cb58fe7c))
* address file command review comments ([da33b8f](https://github.com/InkyQuill/galley-pad/commit/da33b8f7cea6d41d2d520bd43768ec11c2b703e2))
* address review feedback ([e5ef51b](https://github.com/InkyQuill/galley-pad/commit/e5ef51bb95b8811b23ccae1eb542d5f6f36fc023))
* **app:** address close persistence review ([d14e1c8](https://github.com/InkyQuill/galley-pad/commit/d14e1c800f8f10697d0c291c663a4af072a9b406))
* **app:** address external update review feedback ([8afbff2](https://github.com/InkyQuill/galley-pad/commit/8afbff2093617fcf43372ddb3d7ea58e847b3c21))
* **app:** address follow-up review findings ([c8bac13](https://github.com/InkyQuill/galley-pad/commit/c8bac13b562d941ca4fa7315a8e872e1c0ea3a26))
* **app:** address review findings ([a5eb711](https://github.com/InkyQuill/galley-pad/commit/a5eb711a2159560019d281b97c771ccbd9a4cc54))
* **app:** address third review pass ([f0ab966](https://github.com/InkyQuill/galley-pad/commit/f0ab966a7a3f30ca373ff1ad88708b12001580d7))
* **app:** apply theme vars to editor surface ([a371f9c](https://github.com/InkyQuill/galley-pad/commit/a371f9c6ea5f866786f701d7704e2ba21c4dc472))
* **app:** avoid stale theme repair writes ([92356b9](https://github.com/InkyQuill/galley-pad/commit/92356b9714ff69a84fb9ab799f61fb6e0d853252))
* **app:** harden external file warning flows ([faaa580](https://github.com/InkyQuill/galley-pad/commit/faaa58068d6259d973b0d5b669a036b54dcd87f0))
* apply CodeRabbit auto-fixes ([dfe32a7](https://github.com/InkyQuill/galley-pad/commit/dfe32a7235715514549b38574296b8a4147d3e87))
* apply CodeRabbit auto-fixes ([f897474](https://github.com/InkyQuill/galley-pad/commit/f89747442fe52045c8f5b632a3dc2a200aa34d90))
* **app:** normalize theme scheme selections ([1b90c00](https://github.com/InkyQuill/galley-pad/commit/1b90c00f064a70e70e27afaf07e99fcd3bde1eeb))
* **app:** repair normalized theme settings ([c1ca526](https://github.com/InkyQuill/galley-pad/commit/c1ca5265f92a8278ecb798625f70fc88f2b6ea22))
* **app:** use icons for close controls ([93c706f](https://github.com/InkyQuill/galley-pad/commit/93c706ffee3973c12682d55130d22a6f452385e5))
* **build:** prepare local galley editor dist ([6b1aa79](https://github.com/InkyQuill/galley-pad/commit/6b1aa79b8ae558d1bcd43b2e1c751b1cd34a9540))
* **document:** allow saving acknowledged deletions ([0070e5c](https://github.com/InkyQuill/galley-pad/commit/0070e5cd37406b3bc107f01ad19b7464441c0681))
* **document:** avoid false external conflicts ([6549288](https://github.com/InkyQuill/galley-pad/commit/65492885502f4f6a3e6c985c71b72cda63abb97b))
* **document:** check unknown-mtime file paths ([9e10da6](https://github.com/InkyQuill/galley-pad/commit/9e10da635dcac5a9da75760b0ebb47f7c29b3ca9))
* **document:** classify external update conflicts ([93c2ada](https://github.com/InkyQuill/galley-pad/commit/93c2ada92fc767de1305de1197f746661119e404))
* **document:** clear deletion marker after recreated content ([6c503d0](https://github.com/InkyQuill/galley-pad/commit/6c503d02b154dd18f0d40e7350b9d746cb3ce953))
* **document:** keep deletion acknowledgments fresh ([3946069](https://github.com/InkyQuill/galley-pad/commit/3946069be72b2d1065ba9a14661b0803a0d5d06a))
* **document:** normalize external update runtime state ([faa52a1](https://github.com/InkyQuill/galley-pad/commit/faa52a1d015dc51a7be907c450a65758d5e50d4b))
* **document:** reset restored external update state ([3c63c6c](https://github.com/InkyQuill/galley-pad/commit/3c63c6c966900342a482e3a0940d0d37acfb42b3))
* **editor:** cache table control icon markup ([a47a35b](https://github.com/InkyQuill/galley-pad/commit/a47a35b37db12cfc77c633b840b627c3ad6dbbb8))
* **editor:** suppress middle-click paste events ([8c6e775](https://github.com/InkyQuill/galley-pad/commit/8c6e775f5c08710c429e3302b6ce91c7ec5a9117))
* **editor:** update table controls and windows launch ([2693921](https://github.com/InkyQuill/galley-pad/commit/2693921770dad6b92b3704d53e987591b7c6f00c))
* fail on missing editor layout DOM ([ce5b8eb](https://github.com/InkyQuill/galley-pad/commit/ce5b8eb4882451f782266358dcafe27a52083ce6))
* **footer:** brand editor footer tooltip ([f012dec](https://github.com/InkyQuill/galley-pad/commit/f012decbea257e014ea76dc6c072ce7e85bcf781))
* harden desktop scaffold toolchain ([3272322](https://github.com/InkyQuill/galley-pad/commit/327232257be845b759858aae87e38db44860e97b))
* ignore stale open command results ([e3ec90a](https://github.com/InkyQuill/galley-pad/commit/e3ec90a620d9328d389ef67ca64151393c8fe1cf))
* keep editor in flexible app shell row ([fb44227](https://github.com/InkyQuill/galley-pad/commit/fb44227c4864bf46b2054b8e201373fb1a94da7a))
* **linux:** use packaged gpad desktop entry ([7646769](https://github.com/InkyQuill/galley-pad/commit/7646769ff24f6d5a4b73a562ee98f0e1cf67bdbb))
* make mise verification shell portable ([969a66f](https://github.com/InkyQuill/galley-pad/commit/969a66fb212085e89a23a63d01b235aadce2b2e8))
* make scaffold verification portable ([12d79cf](https://github.com/InkyQuill/galley-pad/commit/12d79cf05c7d34700ac0efe331023a484c938109))
* **menu:** use native separator element ([fe5845c](https://github.com/InkyQuill/galley-pad/commit/fe5845cda1d24c816d3b00b08bc723d5aaaffc0f))
* **menu:** use public Tauri runtime detection ([17dde12](https://github.com/InkyQuill/galley-pad/commit/17dde125611c7214e8520f6cbe0d0895b6dab508))
* **merge:** add a screenshot ([89303ca](https://github.com/InkyQuill/galley-pad/commit/89303ca001dc735743fe93691d62a75e8c93d8ec))
* **pad:** address release and editor recovery review findings ([57e8a70](https://github.com/InkyQuill/galley-pad/commit/57e8a7087a048926d78f706a6f4fa2d5833412a2))
* **pad:** correct middle-button event handling ([f028524](https://github.com/InkyQuill/galley-pad/commit/f028524be37113e045a35f5ad322c133dc013ec2))
* **pad:** update editor and repair desktop startup ([f3baca3](https://github.com/InkyQuill/galley-pad/commit/f3baca3c72d167865b0798937b785f971b66b08c))
* **pad:** update editor, repair desktop startup and migrate to release-please ([d9aeb34](https://github.com/InkyQuill/galley-pad/commit/d9aeb343bdbd9a6f610994a3e7ba59519aefde84))
* prefer wayland native launch ([e0b18f9](https://github.com/InkyQuill/galley-pad/commit/e0b18f920df344853d55edfb555c00dd702ddb0c))
* preserve edits during pending save ([4b6cb7e](https://github.com/InkyQuill/galley-pad/commit/4b6cb7e4fe76e3b1979d840f05b16084b41bc3c8))
* **release:** avoid version-sensitive release hooks ([91a42cf](https://github.com/InkyQuill/galley-pad/commit/91a42cf67471d20f202eae5aa6bb2f26ae3e578a))
* **release:** build Arch package artifacts ([b887fe2](https://github.com/InkyQuill/galley-pad/commit/b887fe2e4b5a7f66f727bd7951bf533d9350fec3))
* **release:** publish macOS pkg installers only ([f83330f](https://github.com/InkyQuill/galley-pad/commit/f83330f56ac230e2851e7905d1ef869b1dcdfeff))
* **settings:** defer writes until startup load ([8538cfc](https://github.com/InkyQuill/galley-pad/commit/8538cfc48b8b4080c2c13f60f105d75551a170bb))
* **shell:** detach terminal launcher ([328f955](https://github.com/InkyQuill/galley-pad/commit/328f955f84782e7a4c988f423746606748871bb8))
* **shell:** detach terminal launcher ([bea5844](https://github.com/InkyQuill/galley-pad/commit/bea5844cc8cdc83edeb8233be795f14df38c8814))
* stretch editor to window ([5984886](https://github.com/InkyQuill/galley-pad/commit/598488671105d3945b6d6df4eafa3e275708a110))
* **tabs:** close inactive tabs directly ([b28fa22](https://github.com/InkyQuill/galley-pad/commit/b28fa22e27344b7ab7d66297e8aa91908b7ebfd7))
* **theme:** address follow-up review ([abf49ca](https://github.com/InkyQuill/galley-pad/commit/abf49ca0fe5d2b421d5d9c58825074f83b5fbf3b))
* **theme:** address review feedback ([9af74c3](https://github.com/InkyQuill/galley-pad/commit/9af74c3873bd91ea1a9419315317f6bc489ad780))
* **theme:** persist legacy appearance migration ([70642c6](https://github.com/InkyQuill/galley-pad/commit/70642c6830e857dc313af414b5a28d24e066b432))
* **theme:** preserve startup settings migration ([6c28298](https://github.com/InkyQuill/galley-pad/commit/6c28298fef7e7b0a0d49affaaa558231e7881b7a))
* **themes:** align legacy theme migration ([52f0a08](https://github.com/InkyQuill/galley-pad/commit/52f0a083bb644000bda05f6d5a1289c638eee916))
* **themes:** consume published @inkyquill/galley-themes 0.14.0 ([6f8cfff](https://github.com/InkyQuill/galley-pad/commit/6f8cfff5175e423d19458571fc71c42b791f30b1))
* **themes:** freeze built-in catalog ([6440693](https://github.com/InkyQuill/galley-pad/commit/64406936cf51939d801b045552b055b84b3bec0f))
* **themes:** harden built-in catalog exports ([f63a239](https://github.com/InkyQuill/galley-pad/commit/f63a23997a5d6d998f77d5968ae3f3bfdb2b6f24))
* **themes:** harden persisted settings boundary ([6937a2f](https://github.com/InkyQuill/galley-pad/commit/6937a2fb8f5ae44c80fc0747ef9fc89e0ed7fda4))
* **themes:** preserve settings in appearance shim ([69c76cc](https://github.com/InkyQuill/galley-pad/commit/69c76cc41a7c3c06d7007701107b2180755e4a69))
* **themes:** tolerate persisted theme settings ([49017e6](https://github.com/InkyQuill/galley-pad/commit/49017e690be799a4935f3b5a166be6265cd08bfc))
* **themes:** validate persisted theme writes ([2a94847](https://github.com/InkyQuill/galley-pad/commit/2a94847bf555cca436c633bd17605e88aa644df4))
* tighten integration verification ([326f475](https://github.com/InkyQuill/galley-pad/commit/326f475f30ad8e9ca6206bca2e34e103da9f9372))
* **updates:** deduplicate strict mode checks ([5fc9f37](https://github.com/InkyQuill/galley-pad/commit/5fc9f3744f42d0ad38a1eeefddadf4ef91b6b01e))
* **updates:** reject malformed release tags ([c45e42f](https://github.com/InkyQuill/galley-pad/commit/c45e42fd13c469deed3cbce98b065fc5801464be))
* **ux:** improve Linux menu and tab interactions ([2374d13](https://github.com/InkyQuill/galley-pad/commit/2374d137248d3616736f846891e9967221449008))

## [1.6.3](https://github.com/InkyQuill/galley-pad/compare/v1.6.2...v1.6.3) (2026-10-08)


### Bug Fixes

* **pad:** address release and editor recovery review findings ([57e8a70](https://github.com/InkyQuill/galley-pad/commit/57e8a7087a048926d78f706a6f4fa2d5833412a2))
* **pad:** update editor and repair desktop startup ([f3baca3](https://github.com/InkyQuill/galley-pad/commit/f3baca3c72d167865b0798937b785f971b66b08c))
* **pad:** update editor, repair desktop startup and migrate to release-please ([d9aeb34](https://github.com/InkyQuill/galley-pad/commit/d9aeb343bdbd9a6f610994a3e7ba59519aefde84))

## [1.6.1](https://github.com/InkyQuill/galley-pad/compare/v1.6.0...v1.6.1) (2026-09-15)

## [1.6.0](https://github.com/InkyQuill/galley-pad/compare/v1.5.1...v1.6.0) (2026-07-27)

## [1.5.1](https://github.com/InkyQuill/galley-pad/compare/v1.5.0...v1.5.1) (2026-07-27)

## [1.5.0](https://github.com/InkyQuill/galley-pad/compare/v1.4.0...v1.5.0) (2026-07-26)

## [1.4.0](https://github.com/InkyQuill/galley-pad/compare/v1.3.0...v1.4.0) (2026-07-24)

## [1.3.0](https://github.com/InkyQuill/galley-pad/compare/v1.2.3...v1.3.0) (2026-07-22)

## [1.2.3](https://github.com/InkyQuill/galley-pad/compare/v1.2.2...v1.2.3) (2026-07-07)

## Unreleased

### Fixed

- Updated Galley Editor to 0.10.2 for corrected table block widths.
- Replaced Galley toolbar and table block controls with Tabler icons.
- Reduced Galley Pad editor content left and right padding.

## [1.2.2](https://github.com/InkyQuill/galley-pad/compare/v1.2.1...v1.2.2) (2026-07-04)

## [1.2.1](https://github.com/InkyQuill/galley-pad/compare/v1.2.0...v1.2.1) (2026-07-04)

## [1.2.0](https://github.com/InkyQuill/galley-pad/compare/v1.1.0...v1.2.0) (2026-07-04)

## [1.1.0](https://github.com/InkyQuill/galley-pad/compare/v1.0.0...v1.1.0) (2026-06-30)

## 1.0.0 (2026-06-30)
