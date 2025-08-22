import { setFailed } from "@actions/core";
import { getInputValue } from "./action_input";
import { PackSquashBinaryManifest } from "./binary_manifest";
import { computeCacheKeys, restorePackSquashCache, savePackSquashCache } from "./cache";
import setPackFilesModificationTimesFromCommits from "./git_set_file_times";
import { printPackSquashVersion, runPackSquash } from "./packsquash";
import { PackSquashOptions } from "./packsquash_options";
import { getEnvOrThrow } from "./util";
import { uploadArtifact } from "./workflow";
import WorkingDirectory from "./working_directory";

async function run() {
  const workingDirectory = new WorkingDirectory();
  await workingDirectory.rm();
  await workingDirectory.mkdir();

  const packSquashOptions = await PackSquashOptions.parseAndTweak(workingDirectory);
  await packSquashOptions.show();

  const packDirectory = packSquashOptions.getPackDirectory();
  if (packDirectory === undefined) {
    // This likely common error would be caught later by PackSquash,
    // but handling it here avoids wasting time
    throw new Error(
      "The required pack_directory option is missing from the specified options. " +
        "Please specify the relative path to the folder containing the pack.mcmeta file of the pack you want to optimize",
    );
  }

  const binaryManifest = await PackSquashBinaryManifest.fetchManifest(getInputValue("packsquash_manifest"));
  const binaryEnvironment = await binaryManifest.download(getInputValue("packsquash_version"), workingDirectory);

  await printPackSquashVersion(binaryEnvironment, workingDirectory);

  const [key, ...restoreKeys] = await computeCacheKeys(packSquashOptions);
  let cacheRestored = false;
  if (packSquashOptions.mayCacheBeUsed()) {
    cacheRestored = await restorePackSquashCache(workingDirectory, packSquashOptions, key, restoreKeys);
    await setPackFilesModificationTimesFromCommits(getEnvOrThrow("GITHUB_WORKSPACE"), packDirectory);
  }

  await runPackSquash(packSquashOptions, binaryEnvironment, workingDirectory);

  await uploadArtifact(packSquashOptions);

  if (packSquashOptions.mayCacheBeUsed() && !cacheRestored) {
    await savePackSquashCache(workingDirectory, key);
  }
}

run().catch(err => setFailed(err instanceof Error ? err.message : err));
