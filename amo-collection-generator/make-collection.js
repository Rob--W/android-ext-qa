#!/usr/bin/env node

/**
 * Source: https://github.com/Rob--W/android-ext-qa
 *
 * This file generates a collection to allow the installation of the given xpi
 * files on Android. It creates a JSON file in the current working directory
 * (defaults to COLLECTION_JSON_NAME).
 *
 * Usage:
 * ./make-collection.js file1.xpi file2.xpi
 *
 * To create one JSON file, set environment var: CREATE_ONE_BIG_FILE=1
 * and the xpis will be base64-encoded and embedded in the JSON file. The
 * advantage of this is that there is only one file to carry around, while a
 * major disadvantage is higher storage and memory usage.
 */

const child_process = require("child_process");
const crypto = require("crypto");
const fs = require("fs/promises");

// asn1lite and mozcose are sourced from https://github.com/Rob--W/crxviewer/pull/84
const asn1lite = require("./asn1lite");
const mozcose = require("./mozcose");

// COLLECTION_JSON_NAME is the default name of the JSON file on Fenix (English).
// Its name is computed by getCacheFileName from:
// https://github.com/mozilla-mobile/firefox-android/blob/722c6015632f84f97e686dca68ecc680bf945366/android-components/components/feature/addons/src/main/java/mozilla/components/feature/addons/amo/AddonCollectionProvider.kt
// https://github.com/mozilla-mobile/firefox-android/blob/722c6015632f84f97e686dca68ecc680bf945366/fenix/app/build.gradle#L48-L50
const COLLECTION_JSON_NAME = "mozilla_components_addon_collection_en_Extensions-for-Android.json";

function makeAddonObject({
  CREATE_ONE_BIG_FILE,
  xpiFileName,
  xpiFileBuffer,
  addonId,
  version,
  name,
  description,
}) {
  let downloadUrl;
  if (CREATE_ONE_BIG_FILE) {
    downloadUrl = `data:application/x-xpinstall;base64,${xpiFileBuffer.toString("base64")}`;
  } else {
    downloadUrl = `file:///data/local/tmp/ext-qa-data/${xpiFileName}`;
  }

  // downloadId is parsed but not used by A-C/Fenix. Generate a stable unique
  // value regardless:
  const downloadId = getIntegerHashForBuffer(xpiFileBuffer);

  // For simplicity, a subset of https://addons-server.readthedocs.io/en/latest/topics/api/addons.html#addon-detail-object
  // Parsed at https://github.com/mozilla-mobile/firefox-android/blob/722c6015632f84f97e686dca68ecc680bf945366/android-components/components/feature/addons/src/main/java/mozilla/components/feature/addons/amo/AddonCollectionProvider.kt#L307-L345
  return {
    guid: addonId,
    authors: [], // Array of: { id, name, username, url }
    // categories: not used
    created: "2022-02-22T22:22:22Z", // Dummy.
    last_updated: "2023-03-03T03:33:33Z", // Dummy
    current_version: {
      version,
      files: [
        {
          id: downloadId,
          size: xpiFileBuffer.byteLength, // metadata, not parsed by A-C.
          url: downloadUrl,
          // TODO: should we put something sensible here?
          // I wonder what happens when there is a disconnect between AMO's
          // response and Gecko's interpretation of the manifest.
          //
          // Interesting test cases (missing and/or added):
          // - recognized permission with warning, e.g. "tabs".
          // - recognized permission without warning, e.g. "cookies".
          // - unknown permission, e.g. "bogus".
          // - privileged permission, e.g. "mozillaAddons", "nativeMessaging".
          permissions: [],
        },
      ],
    },
    name,
    description: `[ addon: ${addonId}:${version} ]\n\n${description}`,
    summary: `[version ${version}] ${description}`,
    icon_url: null,
    url: null,
    ratings: null,
    default_locale: null,
  };
}

function makeCollectionArray(addonObjects) {
  // Format of https://addons-server.readthedocs.io/en/latest/topics/api/collections.html#collection-add-ons-list
  // Example query: https://services.addons.mozilla.org/api/v4/accounts/account/mozilla/collections/Extensions-for-Android/addons/?page_size=50&lang=en-US
  // Query used in reality at https://github.com/mozilla-mobile/firefox-android/blob/722c6015632f84f97e686dca68ecc680bf945366/android-components/components/feature/addons/src/main/java/mozilla/components/feature/addons/amo/AddonCollectionProvider.kt
  // with overrides in https://github.com/mozilla-mobile/firefox-android/blob/722c6015632f84f97e686dca68ecc680bf945366/fenix/app/build.gradle#L48-L50
  return {
    count: addonObjects.length,
    next: null,
    previous: null,
    results: addonObjects.map(addon => ({
      addon,
      notes: null,
    })),
  };
}

function getIntegerHashForBuffer(buffer) {
  const hasher = crypto.createHash("shake128", { outputLength: 4 });
  hasher.update(buffer);
  return new DataView(hasher.digest().buffer).getUint32(0);
}

async function readFileFromZip(zipPath, filenameInZip, ignoreError) {
  const command = "unzip";
  const args = ["-p", zipPath, filenameInZip];
  const subprocess = child_process.spawn(command, args, {
    stdio: ["ignore", "pipe", ignoreError ? "ignore" : "inherit"],
  });
  const chunks = [];
  const promise = new Promise((resolve, reject) => {
    subprocess.stdout.on("data", data => {
      chunks.push(data);
    });
    subprocess.on("close", code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`unzip: Exited with failure code: ${code}`));
      }
    });
    subprocess.on("error", reject);
  });

  try {
    await promise;
  } catch (e) {
    if (ignoreError) {
      return null;
    }
    throw e;
  }
  return Buffer.concat(chunks);
}

async function readOptionalFileFromZip(zipPath, filenameInZip) {
  return readFileFromZip(zipPath, filenameInZip, /* ignoreError */ true);
}

function parseManifest(str) {
  try {
    return JSON.parse(str);
  } catch (e) {
    // COMMENT_REGEXP from https://searchfox.org/mozilla-central/rev/926b6c9fc7d84b603f501448c31d489473862bca/toolkit/components/extensions/Extension.sys.mjs#375-388
    const COMMENT_REGEXP = /^((?:[^"\n]|"(?:[^"\\\n]|\\.)*")*?)\/\/.*/gm;
    str = str.replace(COMMENT_REGEXP, "$1");
    return JSON.parse(str);
  }
}

async function getAddonId(xpiFilePath, manifest) {
  const id =
    manifest.browser_specific_settings?.gecko?.id ||
    manifest.applications?.gecko?.id;
  if (id) {
    // if available, use id from manifest.
    return id;
  }

  // Extract extension ID from signature, logic derived from:
  // https://github.com/Rob--W/crxviewer/blob/e7ccd4f49d550e189e0d5a444790fffdc0065dc4/src/crxviewer.js#L954-L996
  let der;
  const cose = await readOptionalFileFromZip(xpiFilePath, "META-INF/cose.sig");
  if (cose) {
    der = mozcose.parseMozCOSE(cose);
  } else {
    der = await readOptionalFileFromZip(xpiFilePath, "META-INF/mozilla.rsa");
    if (!der) {
      // Unsigned add-ons cannot be installed!
      throw new Error(`Unexpected unsigned addon at: ${xpiFilePath}`);
    }
  }
  const subject = asn1lite.parseCertificate(der);
  return subject.CN;
}

async function main(xpiFilePaths, outputFilePath, CREATE_ONE_BIG_FILE) {
  const addonObjects = [];
  for (let xpiFilePath of xpiFilePaths) {
    console.log(`Reading ${xpiFilePath}...`);
    const xpiFileBuffer = await fs.readFile(xpiFilePath);
    const manifest = parseManifest(
      (await readFileFromZip(xpiFilePath, "manifest.json")).toString()
    );
    const addonId = await getAddonId(xpiFilePath, manifest);

    addonObjects.push(
      makeAddonObject({
        CREATE_ONE_BIG_FILE,
        xpiFileName: xpiFilePath.split("/").pop(),
        xpiFileBuffer,
        addonId,
        version: manifest.version,
        // TODO: If wanted, localize these.
        name: manifest.name,
        description: manifest.description,
      }),
    );
  }
  const collection = makeCollectionArray(addonObjects);
  const output = JSON.stringify(collection, null, 2);
  await fs.writeFile(outputFilePath, output);
  console.log(`Written to ${outputFilePath}`);
}

main(
  process.argv.slice(2),
  /*outputFilePath:*/ process.env.COLLECTION_JSON_NAME || COLLECTION_JSON_NAME,
  /*CREATE_ONE_BIG_FILE:*/ process.env.CREATE_ONE_BIG_FILE || false
);
