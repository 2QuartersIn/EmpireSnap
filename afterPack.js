/* EmpireSnap — electron-builder afterPack hook
 *
 * Ad-hoc sign the macOS app bundle before it is packaged into the .dmg/.zip.
 *
 * Why: a completely unsigned bundle is a dead end on Apple Silicon. macOS
 * refuses to run it and reports the app as "damaged", and because the launch
 * never reaches Gatekeeper's normal path, no "Open Anyway" entry appears in
 * System Settings > Privacy & Security — which leaves the user stuck with no
 * visible way forward.
 *
 * An ad-hoc signature ("-") is free, needs no Apple account, and puts the app
 * back on the normal Gatekeeper path: the user gets the standard "unverified
 * developer" prompt and the Open Anyway button actually shows up. It is not a
 * substitute for real signing/notarization, which still needs a paid account.
 */
const { execFileSync } = require("child_process");
const path = require("path");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  try {
    execFileSync(
      "codesign",
      ["--force", "--deep", "--sign", "-", "--timestamp=none", appPath],
      { stdio: "inherit" }
    );
    console.log(`[EmpireSnap] ad-hoc signed ${appPath}`);
  } catch (err) {
    // don't fail the build — an unsigned dmg is still better than no dmg
    console.warn(
      "[EmpireSnap] ad-hoc signing failed:",
      (err && err.message) || err
    );
  }
};
