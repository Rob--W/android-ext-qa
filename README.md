# android-ext-qa

This is a collection of instructions to support QA with verifying add-on
functionality in Fenix (=Firefox for Android).

Repository: https://github.com/Rob--W/android-ext-qa

## Table of contents

- [Overview](#overview)
- [Clean profile directory](#clean-profile-directory)
- [Running JS snippet in main process](#running-js-snippet-in-main-process)
- [Installing extensions](#installing-extensions)
- [Updating extensions](#updating-extensions)
- [Verify telemetry](#verify-telemetry)


## Overview

Each section describes a relevant part of the test process. All steps are
designed to be as independent of external factors as possible. In particular,
internet connectivity is not required.


## Clean profile directory

For predictable results, you should test with an empty profile directory.
Android's "App Info" -> "Clear storage" can be used for that, but that does not
only wipe the profile directory, but also the rest of the app files.

The instructions below enable you to run with a profile directory independent
of the default profile directory:

Setup:

1. Determine the package ID of the Fenix app:
   - `org.mozilla.fenix` - Firefox Nightly for Developers
   - `org.mozilla.firefox_beta` - Firefox Beta
   - `org.mozilla.firefox` - Firefox Release

   The examples below use Nightly (`org.mozilla.fenix`). If you are testing
   another Fenix app, replace ALL mentions of `org.mozilla.fenix` with the ID.
2. Copy `replace.this.with.id-geckoview-config.yaml` to `org.mozilla.fenix-geckoview-config.yaml`
   and edit it: replace `replace.this.with.id` with `org.mozilla.fenix`.
   Then push the file to the device:
    ```sh
    adb push org.mozilla.fenix-geckoview-config.yaml /data/local/tmp/
    ```
3. Create the profile directory as specified in the config.
    ```sh
    adb shell mkdir /sdcard/Android/data/org.mozilla.fenix/ext-qa-profdir
    ```
4. Set the debug app to the Fenix app:
    ```sh
    adb shell am set-debug-app --persistent org.mozilla.fenix
    ```

After following the steps above, you can launch the app and do your testing.
You can verify whether the above worked by checking `adb logcat`, as shown at
https://firefox-source-docs.mozilla.org/mobile/android/geckoview/consumer/automation.html#verifying-configuration-from-a-file

Whenever you want to restart with an empty profile after the setup, force-stop
the Fenix app, delete the profile directory and create it again:

```sh
adb shell am force-stop org.mozilla.fenix
adb shell rm -r /sdcard/Android/data/org.mozilla.fenix/ext-qa-profdir
adb shell mkdir /sdcard/Android/data/org.mozilla.fenix/ext-qa-profdir
```


When you are done, restore the original state as follows:

6. Clear the debug app:
    ```sh
    adb shell am clear-debug-app
    ```
7. Remove the config file (replace the ID as before):
    ```sh
    adb shell rm /data/local/tmp/org.mozilla.fenix-geckoview-config.yaml
    ```
8. Remove the profile directory:
    ```sh
    adb shell am force-stop org.mozilla.fenix
    adb shell rm -r /sdcard/Android/data/org.mozilla.fenix/ext-qa-profdir
    ```


## Running JS snippet in main process

When you need to manually run a JavaScript code snippet in the main process,
follow the following steps:

1. Connect to the device in about:debugging, following the instructions at https://extensionworkshop.com/documentation/develop/developing-extensions-for-firefox-for-android/#debug-your-extension
   In short: connect phone, enable adb debugging, visit about:debugging, follow instructions to connect to Firefox on your device.
2. Open a tab with any content, e.g. `about:blank`
3. Scroll down to "Main Process" and click on "Inspect" to connect the debugger.
4. Paste the snippet in the console and run it.

### Troubleshooting: Snippet does not run

Verify that the debugger is still connected:

- Run `1` and verify that `1` is output.
- If there is no output, close the debugger tab and restart from step 1.

Verify that the debugger is running in the right context:

- Run `location` and confirm that the output is `chrome://geckoview/content/geckoview.xhtml`
- If the location is `resource://gre-resources/hiddenWindow.html`, it means
  that step 2 was skipped, or all tabs were closed. Restart from step 2.
- If the location is incorrect, close the debugger and restart from step 3.


## Installing extensions

Broad add-on support is currently experimental and limited to public AMO
extensions, and only in Beta and Nightly (not Release), as explained at:
https://blog.mozilla.org/addons/2020/09/29/expanded-extension-support-in-firefox-for-android-nightly/

To install any extension on Release, or add-ons not on AMO, follow these steps
to replace the contents of the default collection with the ones of choice:

1. Put the prepared JSON and XPI files on the device:
    ```sh
    adb push ext-qa-data/ /data/local/tmp/ext-qa-data
    ```
2. Run this JS snippet in the main process to replace the collection:
    ```js
    IOUtils.copy(
      "/data/local/tmp/ext-qa-data/mozilla_components_addon_collection_en_Extensions-for-Android.json",
      Services.env.get("HOME") + "/mozilla_components_addon_collection_en_Extensions-for-Android.json"
    );
    ```
3. Tap on the triple-dot menu, "Add-ons", "Add-ons Manager".
4. In the "Add-ons Manager" install the extension of choice through the `+` button.

The JSON name is dependent on the locale. For English, the default name
(without the collection override mentioned before) is:
`mozilla_components_addon_collection_en_Extensions-for-Android.json`

The `files/` directory is in the app's private data directory. This file cannot
be modified by other apps, only the app itself or with root privileges. To
remove the file, either use Android's "App Info" -> "Clear storage", or run the
next JS snippet in the main process:

```js
IOUtils.remove(
  Services.env.get("HOME") + "/mozilla_components_addon_collection_en_Extensions-for-Android.json"
);
```

### Troubleshooting: Collection not replaced

If the above steps did not result in a replaced collection, force-stop Fenix
and restart it.

If that does still not work, confirm that the file name is correct:

1. Activate internet connectivity if it was disabled before.
2. Launch Fenix, tap on the triple-dot menu, "Add-ons", "Add-ons Manager". This
   will download and initialize the list of extensions.
3. Run the following snippet to see the full expected file path path:

```js
IOUtils.getChildren(Services.env.get("HOME")).then(
  files => files.filter(p => p.includes("mozilla_components_addon_collection"))
).then(console.log);
```


## Updating extensions

### Override update server

By default, AMO is queried for updates. If you want more control over update
behavior, override the update server to point to a local file, and update that
file before [triggering an update check](#trigger-update-check).

To do so, edit `replace.this.with.id-geckoview-config.yaml` and uncomment the
following lines after `prefs:` to end up with:

```yaml
  extensions.checkUpdateSecurity: false
  extensions.update.url: "file:///data/local/tmp/ext-qa-data/ext_updates.json"
```

... and follow the steps at [Clean profile directory](#clean-profile-directory)
to start the Fenix app with this config file and a new profile directory.

The `ext-qa-data/ext_updates.json` file lists the available updates. Firefox
will only update to newer versions. For completeness the file currently lists
all 3 sample extensions, of which 3.0 is the newest. To force an update to 2.0,
delete the 3.0 entry.

After making any modification to `ext_updates.json`, upload it to the device:

```sh
adb push ext-qa-data/ext_updates.json /data/local/tmp/ext-qa-data/
```

This change is immediately effective at the next update check.

### Trigger update check

There is no UI to force update checks. Run the following JS snippet in the main
process to force an update check for a given addon ID.

```js
{
  let addonId = "{a73cc3ed-9261-4571-94f6-3679930f0332}";
  ChromeUtils.importESModule(
    "resource://gre/modules/GeckoViewWebExtension.sys.mjs"
  ).GeckoViewWebExtension.updateWebExtension(addonId);
}
```

To trigger an update for another add-on, [find its addon ID](#find-addon-id) and
replace the value in `addonId` with the desired addon ID.

### Avoiding updates

Fenix seems to request an update immediately after installation. To avoid that,
temporarily remove the file before installing:

```sh
adb shell rm /data/local/tmp/ext-qa-data/ext_updates.json
```

and restore it before [triggering the update check](#trigger-update-check):

```sh
adb push ext-qa-data/ext_updates.json /data/local/tmp/ext-qa-data/
```

### Find addon ID

To determine the extension ID of an arbitrary XPI file:

1. Visit https://robwu.nl/crxviewer/
2. Select the XPI file in the file picker.
3. Click on manifest.json
4. Click on "Show analysis".
5. The addon ID is shown at "Extension ID"


## Verify telemetry

Glean data can be read by running a JS snippet in the main process that calls
`Glean.<category>.<metric>.testGetValue()`. For example, to query recorded
blocklist state change events, run:

```js
Glean.blocklist.addonBlockChange.testGetValue();
```

When there are no events, or when the telemetry has been reported, the result
is `undefined`. Verify that the value is not undefined at some point and has
meaningful values.

TODO: Add instructions to set up a server to log received Glean telemetry.


