# android-ext-qa/ext-qa-data

### `addons_canary` XPI

This directory has the following three xpi files, which are different versions
of the same add-on (with ID `{a73cc3ed-9261-4571-94f6-3679930f0332}`):

- `addons_canary-1.0.xpi` is version 1.0.
- `addons_canary-2.0.xpi` is version 2.0.
- `addons_canary-3.0.xpi` is version 3.0 and blocklisted.

### `ext_updates.json`

`ext_updates.json` lists the above files as available updates. Because Firefox
only updates to newer versions, any update request will result in an attempt
to install version 3.0. To request an update to 2.0, delete the 3.0 entry.

### `mozilla_components_addon_collection_en_Extensions-for-Android.json`

`mozilla_components_addon_collection_en_Extensions-for-Android.json` is an
example of a collection that lists the three add-on files above.

In practice, the collection should list only one version of an add-on, but this
file lists three different versions of the same add-on. Consequently:

- When not installed, the Add-on Manager UI shows the metadata for each
  individual version.
- When installed, the Add-on Manager UI shows a mix of the individual version
  and the installed version. The description at the top matches the individual
  version, but the version number reflects the installed add-on.
