# amo-collection-generator

This tool takes a list of signed XPI files and outputs a JSON file in a format
that can be used to install add-ons on Fenix for QA purposes.

Example of usage, with input XPI files and output JSON file at
https://github.com/Rob--W/android-ext-qa/tree/main/ext-qa-data

```console
$ cd ../ext-qa-data/
$ ../amo-collection-generator/make-collection.js *.xpi
Reading addons_canary-1.0.xpi...
Reading addons_canary-2.0.xpi...
Reading addons_canary-3.0.xpi...
Written to mozilla_components_addon_collection_en_Extensions-for-Android.json
```

Instructions on using the generated files to install add-ons are at:
https://github.com/Rob--W/android-ext-qa#installing-extensions
